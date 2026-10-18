import test from 'node:test';
import assert from 'node:assert/strict';
import { pishiFit, fitWeight, TEMPERAMENT_ITEMS, TEMPERAMENT_KEYS } from '../../src/temperament.js';
import { nextQuestion, newConversation, respond, opening } from '../../src/agent/index.js';
import { mockEngine } from '../../src/agent/mock.js';
import { makeClaudeEngine } from '../../src/agent/claude.js';
import { emptyHidden } from '../../src/traits.js';
import { describeHidden, publicProfile, upgradeUser, isReady } from '../../src/profile.js';
import { compatibility } from '../../src/matching.js';

function user(id = 'u1') {
  return { id, name: 'A', basics: { gender: 'woman', seeking: 'men', age: 30, city: 'London' }, hidden: emptyHidden(), shared: { bio: '', bioDraft: '', interests: [], items: [], facts: {} }, photos: [] };
}

function withTemper(t, confidence = 0.6) {
  const u = user();
  for (const k of TEMPERAMENT_KEYS) u.hidden.temperament[k] = { value: t[k] ?? 0.5, confidence };
  return u;
}

test('every questionnaire option nudges known scales with values in range', () => {
  const ids = new Set();
  for (const q of TEMPERAMENT_ITEMS) {
    assert.ok(!ids.has(q.id) && q.id.startsWith('t_'));
    ids.add(q.id);
    assert.ok(q.choices.length >= 3);
    for (const c of q.choices) {
      assert.ok(Object.keys(c.temper).length);
      for (const [k, v] of Object.entries(c.temper)) assert.ok(TEMPERAMENT_KEYS.includes(k) && v >= 0 && v <= 1, `${q.id}: ${k}`);
    }
  }
  // Each scale is the main pull of at least three questions.
  for (const k of TEMPERAMENT_KEYS) {
    assert.ok(TEMPERAMENT_ITEMS.filter((q) => q.choices.some((c) => c.temper[k] >= 0.8)).length >= 3, k);
  }
});

test('Pishi Fit is symmetric, neutral for strangers, and follows its rules', () => {
  const unknown = [user('a'), user('b')];
  assert.equal(fitWeight(...unknown), 0, 'no weight until both have answered');
  const neutral = pishiFit(...unknown);
  assert.ok(neutral > 0.6 && neutral < 0.8);

  const sparkA = withTemper({ spark: 0.9, anchor: 0.2 });
  const sparkB = withTemper({ spark: 0.85, anchor: 0.25 });
  const anchor = withTemper({ spark: 0.15, anchor: 0.9 });
  assert.equal(pishiFit(sparkA, anchor), pishiFit(anchor, sparkA));
  assert.ok(pishiFit(sparkA, sparkB) > pishiFit(sparkA, anchor) + 0.2, 'similar tempo wins');

  const head = withTemper({ compass: 0.95, hearth: 0.3 });
  const heart = withTemper({ compass: 0.3, hearth: 0.95 });
  const head2 = withTemper({ compass: 0.95, hearth: 0.3 });
  assert.ok(pishiFit(head, heart) > pishiFit(head, head2) + 0.15, 'a head and a heart beat two heads');

  // Low confidence pulls scores to neutral.
  const faint = withTemper({ spark: 0.9, anchor: 0.2 }, 0.05);
  assert.ok(Math.abs(pishiFit(faint, anchor) - neutral) < Math.abs(pishiFit(sparkA, anchor) - neutral));
  for (const [a, b] of [[sparkA, anchor], [head, head2], [heart, heart]]) {
    const f = pishiFit(a, b);
    assert.ok(f >= 0 && f <= 1);
  }
});

test('temperament moves the match score by at most a fifth', () => {
  const a = withTemper({ compass: 0.95, hearth: 0.3, spark: 0.9, anchor: 0.1 });
  const good = withTemper({ compass: 0.3, hearth: 0.95, spark: 0.9, anchor: 0.1 });
  const bad = withTemper({ compass: 0.95, hearth: 0.1, spark: 0.1, anchor: 0.95 });
  assert.equal(fitWeight(a, good), 0.2);
  const diff = compatibility(a, good) - compatibility(a, bad);
  assert.ok(diff > 0.05 && diff <= 0.2, String(diff));
});

test('the questionnaire starts once matching has, and quick replies fill it in', async () => {
  const u = user();
  const convo = newConversation();
  opening(u, convo);
  const asked = [];
  let readyAt = null;
  for (let i = 0; i < 30; i++) {
    const q = convo.pending;
    asked.push(q.id);
    if (readyAt == null && isReady(u)) readyAt = asked.length - 1;
    const answer = q.choices ? (typeof q.choices[0] === 'string' ? q.choices[0] : q.choices[0].label) : 'I love long walks, cooking for friends and trying new places with people I care about.';
    await respond(u, convo, answer, mockEngine);
  }
  const t = asked.filter((id) => id.startsWith('t_'));
  assert.ok(readyAt != null && t.length >= 3, asked.join());
  assert.ok(asked.indexOf(t[0]) >= readyAt, 'never before the first picks');
  assert.ok(TEMPERAMENT_KEYS.every((k) => u.hidden.temperament[k].confidence > 0), JSON.stringify(u.hidden.temperament));
  // Never two questionnaire items back to back while there is still interview left.
  for (let i = 1; i < asked.length; i++) assert.ok(!(asked[i].startsWith('t_') && asked[i - 1].startsWith('t_')), asked.join());
});

test('temperament is never shown, not even to the person', () => {
  const u = withTemper({ spark: 0.9 });
  assert.ok(!JSON.stringify(describeHidden(u)).includes('temperament'));
  assert.ok(!JSON.stringify(publicProfile(u)).match(/temperament|spark/));
});

test('older profiles gain an empty temperament', () => {
  const u = user();
  delete u.hidden.temperament;
  upgradeUser(u);
  assert.deepEqual(Object.keys(u.hidden.temperament), TEMPERAMENT_KEYS);
});

test('Claude may only hint at temperament from open answers', async () => {
  const payload = {
    reply: 'Nice. Next one.', traitUpdates: [], preferenceUpdates: [], tags: [], dealbreakers: [], interests: [], values: [],
    sharedSuggestions: [], privateNote: '', bio: '', aspects: { loveLanguage: '', pace: '' },
    facts: { work: '', education: '', languages: '', height: '', lookingFor: '', kids: '', drinking: '', smoking: '', diet: '', pets: '' },
    observations: [], temperamentUpdates: [{ scale: 'hearth', value: 0.9, confidence: 0.9 }],
  };
  const engine = makeClaudeEngine(() => ({ beta: { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(payload) }] }) } } }));
  const res = await engine.turn({ user: user(), convo: newConversation(), pending: null, answer: 'x', next: null });
  assert.equal(res.update.temperamentUpdates[0].confidence, 0.3);
});
