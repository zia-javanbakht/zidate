import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../src/db.js';
import { newUser } from '../../src/app.js';
import { TRAIT_KEYS } from '../../src/traits.js';
import { profileGuide } from '../../src/guide.js';
import { signalBoost } from '../../src/matching.js';
import { respond, opening } from '../../src/agent/index.js';
import {
  signalsOf, noteDecision, noteAnswer, noteMessage, noteCheckin, noteActive, noteObservations,
  revealedPreferences, likeChance, responsiveness, hoursOverlap, summarizeSignals,
} from '../../src/signals.js';

function person(store, traits = {}, basics = {}) {
  const u = newUser(store, { name: 'P', email: `${Math.random()}@x.co`, password: null });
  u.basics = { gender: 'woman', seeking: 'men', age: 33, city: 'London', ...basics };
  for (const k of TRAIT_KEYS) u.hidden.traits[k] = { value: traits[k] ?? 0.5, confidence: 0.6 };
  return u;
}

test('guide: new people start with the hidden profile; ready people with the shared one', () => {
  const store = new Store(null);
  const u = newUser(store, { name: 'New', email: 'n@x.co', password: null });
  let g = profileGuide(u);
  assert.equal(g.next.id, 'basics');
  assert.equal(g.hidden.percent, 0);
  assert.equal(g.shared.percent, 17); // nothing waiting for approval already counts
  const r = person(store);
  g = profileGuide(r);
  assert.equal(g.next.id, 'photo');
  r.photos = [{ id: 'p1' }];
  r.shared.bio = 'Hello.';
  for (let i = 0; i < 3; i++) r.shared.items.push({ id: `i${i}`, text: 'x', status: 'approved' });
  r.shared.items.push({ id: 's', text: 'y', status: 'suggested' });
  g = profileGuide(r);
  assert.equal(g.next.id, 'review');
  assert.match(g.next.action.label, /Review 1 suggestion$/);
});

test('guide: "no dealbreakers" counts as done', () => {
  const store = new Store(null);
  const u = person(store);
  const step = () => profileGuide(u).hidden.steps.find((s) => s.id === 'dealbreakers');
  assert.equal(step().done, false);
  u.guide = { noDealbreakers: true };
  assert.equal(step().done, true);
});

test('revealed preferences appear only after enough decisions, leaning toward who they liked', () => {
  const store = new Store(null);
  const me = person(store);
  const outgoing = person(store, { social: 0.9 }, { gender: 'man' });
  const quiet = person(store, { social: 0.1 }, { gender: 'man' });
  noteDecision(store, me, outgoing, { liked: true });
  noteDecision(store, me, quiet, { liked: false });
  assert.deepEqual(revealedPreferences(signalsOf(store, me.id)), {});
  noteDecision(store, me, outgoing, { liked: true });
  noteDecision(store, me, quiet, { liked: false });
  const rev = revealedPreferences(signalsOf(store, me.id));
  assert.ok(rev.social.target > 0.8);
  assert.ok(rev.social.weight > 0.4);
  assert.equal(rev.adventure, undefined, 'no difference, no preference');
  // And it moves the ranking: an outgoing stranger now beats a quiet one.
  const a = person(store, { social: 0.85 }, { gender: 'man' });
  const b = person(store, { social: 0.15 }, { gender: 'man' });
  assert.ok(signalBoost(store, me, a) > signalBoost(store, me, b));
});

test('like chance follows what they react to, e.g. photos', () => {
  const store = new Store(null);
  const me = person(store);
  const withPhoto = person(store, {}, { gender: 'man' });
  withPhoto.photos = [{ id: 'p' }];
  const without = person(store, {}, { gender: 'man' });
  for (let i = 0; i < 3; i++) {
    noteDecision(store, me, withPhoto, { liked: true });
    noteDecision(store, me, without, { liked: false });
  }
  const sig = signalsOf(store, me.id);
  assert.ok(likeChance(sig, me, withPhoto) > likeChance(sig, me, without));
});

test('responsiveness: people who never answer their matches rank lower', () => {
  const store = new Store(null);
  const me = person(store);
  const ghost = person(store, {}, { gender: 'man' });
  const talker = person(store, {}, { gender: 'man' });
  noteCheckin(store, ghost, [{ from: 'x', at: '2026-01-01T00:00:00Z' }]);
  noteCheckin(store, ghost, [{ from: 'y', at: '2026-01-01T00:00:00Z' }]);
  const t = [{ from: 'x', at: '2026-01-01T00:00:00Z' }, { from: talker.id, at: '2026-01-01T00:30:00Z' }];
  noteMessage(store, talker, t);
  noteMessage(store, talker, t);
  assert.equal(responsiveness(signalsOf(store, ghost.id)), 0);
  assert.equal(responsiveness(signalsOf(store, talker.id)), 1);
  assert.ok(signalBoost(store, me, talker) > signalBoost(store, me, ghost));
});

test('active hours count once per hour and overlap is 0..1', () => {
  const store = new Store(null);
  const a = person(store);
  const b = person(store);
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + i, 20, 5));
    noteActive(store, a, d);
    noteActive(store, a, d); // same hour again: ignored
    noteActive(store, b, d);
  }
  assert.equal(signalsOf(store, a.id).activeHours[20], 12);
  assert.equal(hoursOverlap(signalsOf(store, a.id), signalsOf(store, b.id)), 1);
});

test('answers: words, quick replies, skips and pace are recorded', () => {
  const store = new Store(null);
  const u = person(store);
  noteAnswer(store, u, { text: 'one two three', askedAt: new Date(Date.now() - 20000).toISOString() });
  noteAnswer(store, u, { text: 'Yes', quickReply: true });
  noteAnswer(store, u, { text: 'Skip', skipped: true });
  const s = summarizeSignals(signalsOf(store, u.id));
  assert.equal(s.answers, 2);
  assert.equal(s.averageWordsPerTypedAnswer, 3);
  assert.equal(s.skipped, 1);
  assert.ok(s.averageSecondsToAnswer >= 19 && s.averageSecondsToAnswer <= 25);
});

test('observations from the engine go to the signals, never into the profiles', async () => {
  const store = new Store(null);
  const u = newUser(store, { name: 'O', email: 'o@x.co', password: null });
  const convo = store.data.conversations[u.id];
  opening(u, convo);
  const engine = { name: 'fake', turn: async () => ({ reply: 'Thanks. Next?', update: { observations: ['Talks about her sister in every answer.'] } }) };
  await respond(u, convo, 'Woman', engine); // a basic: no engine call
  for (const a of ['Men', '31', 'London']) await respond(u, convo, a, engine);
  await respond(u, convo, 'My sister and I run every Sunday.', engine, (obs) => noteObservations(store, u, obs));
  assert.deepEqual(signalsOf(store, u.id).observations.map((o) => o.text), ['Talks about her sister in every answer.']);
  assert.ok(!JSON.stringify(u).includes('sister in every answer'));
});
