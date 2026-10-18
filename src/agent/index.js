// The conversation loop: decides what to ask next, hands answers to an engine
// (Claude or offline), and applies the result to the person's profiles.
import { BASICS, QUESTIONS, DEEPER, feedbackQuestion } from './questions.js';
import { mockEngine, draftBio } from './mock.js';
import { claudeEngine } from './claude.js';
import { applyUpdate, completeness, isReady, basicsDone, cleanText } from '../profile.js';
import { now } from '../clock.js';
import { profileGuide } from '../guide.js';
import { normalizeCity } from '../cities.js';

export function pickEngine() {
  if (process.env.PISHI_AGENT === 'offline') return mockEngine;
  return process.env.ANTHROPIC_API_KEY ? claudeEngine : mockEngine;
}

export function newConversation() {
  return { messages: [], asked: [], pending: null, events: [], flags: {} };
}

export const SKIP_RE = /^(skip|skip (it|this|this one)|pass|next( question)?|rather not( say)?|i'?d rather not( say)?|prefer not to say|no comment)[.!]?$/i;
const NOT_A_CITY = /^(skip|pass|next|no|nope|none|idk|why|what|nowhere|secret|private|rather not( say)?|not telling|hi|hello|hey|yes|ok|okay)$/i;

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
    if (!/^[\p{L}][\p{L} .,'-]{1,50}$/u.test(c) || NOT_A_CITY.test(c)) return null;
    return normalizeCity(c);
  }
  return null;
}

const BASIC_HINT = {
  gender: 'Please pick one of the options.',
  seeking: 'Please pick one of the options.',
  age: 'Just the number is perfect, for example 31.',
  city: 'I need your city to suggest people near you. Just the name is perfect.',
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
  const lastId = [...convo.asked].reverse().find((id) => QUESTIONS.some((q) => q.id === id) || DEEPER.some((q) => q.id === id));
  const lastHadChoices = Boolean([...QUESTIONS, ...DEEPER].find((q) => q.id === lastId)?.choices);
  const open = QUESTIONS.filter((q) => !convo.asked.includes(q.id))
    .map((q) => [q, questionScore(q, user, answeredSelf, lastHadChoices)])
    .filter(([, s]) => s >= 0)
    .sort((a, b) => b[1] - a[1]);
  if (open.length) return { ...open[0][0], kind: 'interview' };
  // Core interview done: go deeper where we know least.
  const deeper = DEEPER.filter((q) => !convo.asked.includes(q.id))
    .map((q) => [q, questionScore(q, user, answeredSelf, lastHadChoices)])
    .sort((a, b) => b[1] - a[1]);
  if (deeper.length) return { ...deeper[0][0], kind: 'interview' };
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

const READY_LINE = 'I know enough to introduce you to your first two people. We can keep talking whenever you like: the more I know, the better the picks.';

// Handle one message from the person. Returns the agent's reply message.
// sink: optional callback for what the engine noticed that is kept only for matching.
export async function respond(user, convo, rawText, engine = pickEngine(), sink = null) {
  const text = cleanText(rawText, 1200);
  if (!text) throw Object.assign(new Error('Say something first.'), { status: 400 });
  convo.messages.push({ role: 'user', text, at: now().toISOString() });
  const pending = convo.pending;

  if (pending?.kind === 'basic') {
    const value = parseBasic(pending.key, text);
    if (value === 'minor') {
      user.blocked = 'under18';
      return say(convo, 'Pishi is only for adults, so I cannot continue. Take care.', null);
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

  // Every interview question is optional.
  if (SKIP_RE.test(text) && pending && pending.kind !== 'basic') {
    const q = nextQuestion(user, convo);
    return say(convo, `No problem, we can skip that. ${q.text}`, q);
  }

  const wasReady = isReady(user);
  // Quick replies map straight onto traits, without guessing.
  let choiceApplied = false;
  const choice = pending?.choices?.find((c) => typeof c === 'object' && c.label.toLowerCase() === text.toLowerCase());
  if (choice) {
    applyUpdate(user, {
      traitUpdates: Object.entries(choice.set || {}).map(([trait, value]) => ({ trait, value, confidence: 0.55 })),
      preferenceUpdates: choice.prefer || [],
      tags: choice.tags || [],
      aspects: choice.aspects,
      facts: choice.facts,
    });
    Object.assign(user.basics, choice.basics || {});
    applyPassChoice(user, convo, pending, choice);
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
  // A clear answer that contradicts something we were fairly sure of: ask, don't guess.
  convo.flags.rechecked ||= {};
  for (const t of result.update.traitUpdates || []) {
    const before = user.hidden.traits[t.trait];
    if (!before || convo.flags.rechecked[t.trait]) continue;
    if (before.confidence >= 0.45 && t.confidence >= 0.3 && Math.abs(t.value - before.value) > 0.55) {
      convo.flags.rechecked[t.trait] = true;
      queueEvent(convo, { type: 'recheck', trait: t.trait });
    }
  }
  const { observations, ...update } = result.update;
  if (observations?.length) sink?.(observations);
  applyUpdate(user, update);
  if (!update.bio) {
    const bio = draftBio(user);
    if (bio) user.shared.bioDraft = bio;
  }
  user.updatedAt = now().toISOString();

  const reply = result.reply || next.text;
  if (!wasReady && isReady(user) && !convo.flags.readyAnnounced) {
    // A milestone gets its own card in the chat, not a sentence buried in a reply.
    convo.flags.readyAnnounced = true;
    convo.messages.push({ role: 'agent', notice: 'ready', text: READY_LINE, at: now().toISOString() });
  } else if (wasReady) guideNudge(user, convo);
  return say(convo, reply, next);
}

// Once matching has started, point now and then at the most useful thing left to do
// on the profiles. Never more than once every six answers, never the same step twice in a row.
const NUDGE_EVERY = 6;
const NUDGES = {
  photo: 'People are far more likely to say yes when they can see you. Add a photo when you have a moment.',
  bio: 'You do not have a bio yet. Two sentences are enough, and I have drafted one you can use.',
  lines: 'Your shared profile is a bit quiet. A few lines in your own words give your matches something to reply to.',
  review: 'I have suggested some lines for your shared profile. They only appear once you approve them.',
  facts: 'A few plain facts, like your work or whether you want kids, save your matches a lot of guessing.',
  interests: 'Add a few interests so I can tell your matches what you have in common.',
  partner: 'I would like to know more about who you hope to meet. Tell me about the last person you really clicked with?',
  dealbreakers: 'Is there anything you could never accept in a partner? You can set dealbreakers on your profile.',
};

function guideNudge(user, convo) {
  convo.flags.sinceNudge = (convo.flags.sinceNudge || 0) + 1;
  if (convo.flags.sinceNudge < NUDGE_EVERY) return;
  const step = profileGuide(user).next;
  if (!step || !NUDGES[step.id] || step.action.href === '#/talk' || convo.flags.lastNudge === step.id) return;
  convo.flags.sinceNudge = 0;
  convo.flags.lastNudge = step.id;
  convo.messages.push({ role: 'agent', notice: 'guide', text: NUDGES[step.id], link: step.action.href, label: step.action.label, at: now().toISOString() });
}

// After a day or more away, greet the person and repeat where we were.
export function resume(user, convo) {
  const last = convo.messages.at(-1);
  if (!last || !convo.pending || user.blocked) return null;
  if (Date.parse(now().toISOString()) - Date.parse(last.at) < 20 * 3600e3) return null;
  const q = { ...convo.pending, kind: convo.pending.kind };
  const msg = { role: 'agent', text: `Welcome back, ${user.name}. Where were we… ${q.text}`, at: now().toISOString(), qid: q.id };
  if (q.choices) msg.choices = choiceLabels(q);
  convo.messages.push(msg);
  return msg;
}

// Ask the next queued question straight away, e.g. after "That's not me".
// The question that was pending goes back into the pool.
export function askNow(user, convo) {
  if (convo.pending?.id) convo.asked = convo.asked.filter((id) => id !== convo.pending.id);
  const q = nextQuestion(user, convo);
  return say(convo, q.text, q);
}

// A quick reply to one of the "why did you pass" questions: remember the reason,
// tighten the search if asked, and line up the follow-up question.
function applyPassChoice(user, convo, pending, choice) {
  const cid = pending.id.replace(/^fb\w?_/, '');
  user.hidden.passReasons ||= [];
  user.hidden.limits ||= {};
  if (choice.reason) {
    user.hidden.passReasons.push({ candidateId: cid, reason: choice.reason, at: now().toISOString() });
    user.hidden.passReasons = user.hidden.passReasons.slice(-30);
  }
  if (choice.detail) {
    const last = user.hidden.passReasons.findLast((r) => r.candidateId === cid);
    if (last) last.detail = choice.detail;
  }
  if (choice.limits) {
    const l = user.hidden.limits;
    Object.assign(l, choice.limits);
    // Never leave an impossible age window behind.
    if (l.ageMin != null && l.ageMax != null && l.ageMin > l.ageMax) delete l[choice.limits.ageMin != null ? 'ageMax' : 'ageMin'];
  }
  if (choice.then) convo.events.unshift(choice.then);
}

export function queueEvent(convo, event) {
  // One question per person per week is plenty; drop duplicates.
  if (convo.events.some((e) => e.type === event.type && e.candidateId === event.candidateId && e.trait === event.trait)) return;
  convo.events.push(event);
}

export { completeness };
