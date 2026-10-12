// The conversation loop: decides what to ask next, hands answers to an engine
// (Claude or offline), and applies the result to the person's profiles.
import { BASICS, QUESTIONS, feedbackQuestion } from './questions.js';
import { mockEngine, draftBio } from './mock.js';
import { claudeEngine } from './claude.js';
import { applyUpdate, completeness, isReady, basicsDone, cleanText } from '../profile.js';
import { now } from '../clock.js';

export function pickEngine() {
  if (process.env.ZIDATE_AGENT === 'offline') return mockEngine;
  return process.env.ANTHROPIC_API_KEY ? claudeEngine : mockEngine;
}

export function newConversation() {
  return { messages: [], asked: [], pending: null, events: [], flags: {} };
}

const CITY_RE = /^[\p{L}][\p{L} .'-]{1,40}$/u;

function parseBasic(key, text) {
  const t = text.trim().toLowerCase();
  if (key === 'gender') {
    if (/^(woman|female|f|girl|lady)$/.test(t)) return 'woman';
    if (/^(man|male|m|guy|boy)$/.test(t)) return 'man';
    if (/non[- ]?binary|enby|nb|genderqueer|other/.test(t)) return 'nonbinary';
    return null;
  }
  if (key === 'seeking') {
    if (/^(women|woman|female|girls|ladies)$/.test(t)) return 'women';
    if (/^(men|man|male|guys)$/.test(t)) return 'men';
    if (/everyone|both|any|all|anyone|doesn'?t matter/.test(t)) return 'everyone';
    return null;
  }
  if (key === 'age') {
    const n = parseInt(t.match(/\d{2}/)?.[0], 10);
    return n >= 18 && n <= 99 ? n : n < 18 ? 'minor' : null;
  }
  if (key === 'city') {
    const c = text.trim().replace(/^i('| a)m in |^in /i, '').replace(/[.!]$/, '');
    if (!CITY_RE.test(c)) return null;
    return c.replace(/\b\p{L}/gu, (ch) => ch.toUpperCase());
  }
  return null;
}

const BASIC_HINT = {
  gender: 'Please pick one of the options.',
  seeking: 'Please pick one of the options.',
  age: 'Just the number is perfect, for example 31.',
  city: 'Just the city name is perfect.',
};

function questionScore(q, user, answeredSelf, lastHadChoices) {
  if (q.mode === 'partner' && answeredSelf < 4) return -1;
  const conf = q.traits.map((k) => user.hidden.traits[k].confidence);
  const need = conf.length ? conf.reduce((a, c) => a + (1 - c), 0) / conf.length : 0.5;
  // Alternate a quick tap with a question worth typing, so it feels like a conversation
  // rather than a form, and open answers keep feeding the shared profile.
  const rhythm = Boolean(q.choices) !== lastHadChoices ? 0.35 : 0;
  return need + rhythm + (q.share ? 0.1 : 0);
}

// What should the interviewer ask next?
export function nextQuestion(user, convo) {
  const basic = BASICS.find((b) => user.basics[b.key] == null);
  if (basic) return { ...basic, kind: 'basic', mode: 'self' };
  while (convo.events.length) {
    const fb = feedbackQuestion(convo.events.shift());
    if (fb) return { ...fb, kind: 'feedback' };
  }
  const answeredSelf = convo.asked.filter((id) => QUESTIONS.find((q) => q.id === id)?.mode === 'self').length;
  const lastId = [...convo.asked].reverse().find((id) => QUESTIONS.some((q) => q.id === id));
  const lastHadChoices = Boolean(QUESTIONS.find((q) => q.id === lastId)?.choices);
  const open = QUESTIONS.filter((q) => !convo.asked.includes(q.id))
    .map((q) => [q, questionScore(q, user, answeredSelf, lastHadChoices)])
    .filter(([, s]) => s >= 0)
    .sort((a, b) => b[1] - a[1]);
  if (open.length) return { ...open[0][0], kind: 'interview' };
  return { id: 'q_open', kind: 'open', mode: 'self', text: 'Is there anything else you would like me to know about you, or about who you hope to meet?' };
}

function choiceLabels(q) {
  if (!q?.choices) return undefined;
  return q.choices.map((c) => (typeof c === 'string' ? c : c.label));
}

function say(convo, text, q) {
  const msg = { role: 'agent', text, at: now().toISOString() };
  if (q) {
    msg.qid = q.id;
    const choices = choiceLabels(q);
    if (choices) msg.choices = choices;
  }
  convo.messages.push(msg);
  convo.pending = q ? { id: q.id, kind: q.kind, mode: q.mode, key: q.key, share: q.share, text: q.text, choices: q.choices } : null;
  if (q && !convo.asked.includes(q.id)) convo.asked.push(q.id);
  return msg;
}

export function opening(user, convo) {
  if (convo.messages.length) return null;
  const q = nextQuestion(user, convo);
  return say(convo, `Hi ${user.name}. I'm your matchmaker here. Instead of swiping, we talk, and each week I introduce you to two people. ${q.text}`, q);
}

const READY_LINE = "I know enough now to find your first two people. They are waiting under This week. We can keep talking whenever you like; the more I know, the better the picks.";

// Handle one message from the person. Returns the agent's reply message.
export async function respond(user, convo, rawText, engine = pickEngine()) {
  const text = cleanText(rawText, 1200);
  if (!text) throw Object.assign(new Error('Say something first.'), { status: 400 });
  convo.messages.push({ role: 'user', text, at: now().toISOString() });
  const pending = convo.pending;

  if (pending?.kind === 'basic') {
    const value = parseBasic(pending.key, text);
    if (value === 'minor') {
      user.blocked = 'under18';
      return say(convo, 'ziDate is only for adults, so I cannot continue. Take care.', null);
    }
    if (value == null) {
      const q = { ...BASICS.find((b) => b.key === pending.key), kind: 'basic', mode: 'self' };
      return say(convo, `${BASIC_HINT[pending.key]} ${q.text}`, q);
    }
    user.basics[pending.key] = value;
    const q = nextQuestion(user, convo);
    const lead = basicsDone(user) ? 'Thanks, that is all the admin. Now the interesting part.' : '';
    return say(convo, [lead, q.text].filter(Boolean).join(' '), q);
  }

  const wasReady = isReady(user);
  // Quick replies map straight onto traits, without guessing.
  let choiceApplied = false;
  const choice = pending?.choices?.find((c) => typeof c === 'object' && c.label.toLowerCase() === text.toLowerCase());
  if (choice) {
    applyUpdate(user, {
      traitUpdates: Object.entries(choice.set).map(([trait, value]) => ({ trait, value, confidence: 0.55 })),
      tags: choice.tags || [],
    });
    Object.assign(user.basics, choice.basics || {});
    choiceApplied = true;
  }

  const next = nextQuestion(user, convo);
  let result;
  try {
    result = await engine.turn({ user, convo, pending, answer: text, choiceApplied, choice, next });
  } catch (err) {
    if (engine === mockEngine) throw err;
    console.warn(`[agent] ${engine.name} failed, using offline engine: ${err.message}`);
    result = await mockEngine.turn({ user, convo, pending, answer: text, choiceApplied, choice, next });
  }
  applyUpdate(user, result.update);
  if (!result.update.bio) {
    const bio = draftBio(user);
    if (bio) user.shared.bioDraft = bio;
  }
  user.updatedAt = now().toISOString();

  let reply = result.reply || next.text;
  if (!wasReady && isReady(user) && !convo.flags.readyAnnounced) {
    convo.flags.readyAnnounced = true;
    reply = `${reply.replace(next.text, '').trim()} ${READY_LINE} ${next.text}`.replace(/\s+/g, ' ').trim();
  }
  return say(convo, reply, next);
}

export function queueEvent(convo, event) {
  // One question per person per week is plenty; drop duplicates.
  if (convo.events.some((e) => e.candidateId === event.candidateId && e.type === event.type)) return;
  convo.events.push(event);
}

export { completeness };
