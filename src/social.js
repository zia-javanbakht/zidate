// What happens between two people: likes, matches, demo replies, icebreakers.
import { TRAIT_KEYS } from './traits.js';
import { blendTrait } from './profile.js';
import { matchId } from './matching.js';
import { queueEvent } from './agent/index.js';
import { now } from './clock.js';
import { noteMatch, noteCheckin, noteMessage } from './signals.js';

// Liking someone is also a signal: nudge preferences a little toward them. Likes alone
// never take a preference past LIKE_CAP, so what the person told us keeps the upper hand
// and a run of similar likes cannot narrow every future week to look-alikes.
const LIKE_CAP = 0.3;
export function learnFromLike(user, other) {
  for (const k of TRAIT_KEYS) {
    const t = other.hidden.traits[k];
    if (t.confidence < 0.2) continue;
    const cur = user.hidden.preference[k] || { value: 0.5, confidence: 0 };
    const next = blendTrait(cur, t.value, 0.12);
    user.hidden.preference[k] = { value: next.value, confidence: Math.max(cur.confidence, Math.min(LIKE_CAP, next.confidence)) };
  }
}

export function createMatch(ctx, a, b) {
  const { store, notify } = ctx;
  const id = matchId(a.id, b.id);
  if (store.data.matches[id]) return store.data.matches[id];
  // The person who completed the match sees it straight away, so it is not "new" for them.
  const m = { id, users: [a.id, b.id], createdAt: now().toISOString(), seen: { [a.id]: now().toISOString() } };
  store.data.matches[id] = m;
  store.data.messages[id] = [];
  // A note sent with a like becomes the first message, the earlier like first.
  const notes = store.data.likeNotes || {};
  const sent = [[b, a], [a, b]].map(([x, y]) => [x, notes[`${x.id}>${y.id}`]]).filter(([, n]) => n)
    .sort(([, p], [, q]) => p.at.localeCompare(q.at));
  for (const [x, n] of sent) {
    store.data.messages[id].push({ from: x.id, text: n.note || (n.on?.kind === 'photo' ? 'Liked your photo.' : 'Liked this.'), at: n.at, ...(n.on ? { about: n.on } : {}) });
    noteMessage(store, x, store.data.messages[id]);
  }
  delete notes[`${a.id}>${b.id}`];
  delete notes[`${b.id}>${a.id}`];
  noteMatch(store, a);
  noteMatch(store, b);
  for (const [x, y] of [[a, b], [b, a]]) {
    if (x.demo) continue;
    queueEvent(store.data.conversations[x.id], { type: 'match', candidateId: y.id, name: y.name });
  }
  notify(b, { type: 'match', text: `You and ${a.name} like each other.`, link: `#/match/${encodeURIComponent(id)}` });
  return m;
}

// Demo people answer so a solo tester can try the whole flow. Clearly labelled as demo.
export function demoReply(demo, user, thread) {
  const mine = thread.filter((x) => x.from === demo.id).length;
  const interest = demo.shared.interests.find((i) => user.shared.interests.includes(i)) || demo.shared.interests[0];
  const lines = [
    `Hi ${user.name}! Nice to match. I saw you are in ${user.basics.city}, how are you finding it?`,
    `Ha, fair. I have been really into ${interest} lately. Are you?`,
    'What does a good week look like for you?',
    'I like that. Coffee sometime? (I am a demo profile, so this is where the demo ends.)',
  ];
  return lines[Math.min(mine, lines.length - 1)];
}

// Conversation starters built only from what both people chose to share.
export function icebreakers(me, other) {
  const out = [];
  const common = me.shared.interests.filter((i) => other.shared.interests.includes(i));
  if (common[0]) out.push(`You both like ${common[0]}. What got you into it?`);
  const item = other.shared.items.find((i) => i.status === 'approved');
  if (item) out.push(`About “${item.prompt || 'your profile'}”: ${item.text.length > 70 ? `${item.text.slice(0, 67)}…` : item.text} Tell me more?`);
  if (other.shared.interests[0] && !common.includes(other.shared.interests[0])) out.push(`I have never really tried ${other.shared.interests[0]}. Where would I start?`);
  out.push('What does a good week look like for you?');
  return out.slice(0, 3);
}

// A week after matching, the matchmaker asks how it is going.
export function runCheckins(ctx) {
  const { store, notify } = ctx;
  let n = 0;
  const cutoff = Date.parse(now().toISOString()) - 7 * 864e5;
  for (const m of Object.values(store.data.matches)) {
    if (m.checkin || Date.parse(m.createdAt) > cutoff) continue;
    m.checkin = now().toISOString();
    const [a, b] = m.users.map((id) => store.data.users[id]);
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!x || !y || x.demo) continue;
      noteCheckin(store, x, store.data.messages[m.id] || []);
      queueEvent(store.data.conversations[x.id], { type: 'checkin', candidateId: y.id, name: y.name });
      notify(x, { type: 'checkin', text: `How is it going with ${y.name}? Tell your matchmaker.`, link: '#/talk' });
      n++;
    }
  }
  return n;
}
