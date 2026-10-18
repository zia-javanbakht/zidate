import test from 'node:test';
import assert from 'node:assert/strict';
import { nextQuestion, newConversation, respond } from '../../src/agent/index.js';
import { mockEngine } from '../../src/agent/mock.js';
import { emptyHidden } from '../../src/traits.js';

function user() {
  return { id: 'u1', name: 'A', basics: { gender: 'woman', seeking: 'men', age: 30, city: 'London' }, hidden: emptyHidden(), shared: { bio: '', bioDraft: '', interests: [], items: [] } };
}

test('interview alternates quick replies with open questions', () => {
  const u = user();
  const convo = newConversation();
  const kinds = [];
  for (let i = 0; i < 6; i++) {
    const q = nextQuestion(u, convo);
    convo.asked.push(q.id);
    kinds.push(Boolean(q.choices));
  }
  for (let i = 1; i < kinds.length; i++) assert.notEqual(kinds[i], kinds[i - 1], `questions ${i - 1} and ${i}: ${kinds}`);
});

test('partner questions wait until we know the person a bit', () => {
  const u = user();
  const convo = newConversation();
  for (let i = 0; i < 3; i++) {
    const q = nextQuestion(u, convo);
    assert.equal(q.mode, 'self');
    convo.asked.push(q.id);
  }
});

export { user, mockEngine, respond };

test('replies never open the same way twice in a row, and quick replies get their own reaction', async () => {
  const u = user();
  const convo = newConversation();
  const { opening } = await import('../../src/agent/index.js');
  opening(u, convo);
  const openers = [];
  for (let i = 0; i < 8; i++) {
    const pending = convo.messages.at(-1);
    const text = pending.choices ? pending.choices[0] : 'Something thoughtful about my life and the people in it.';
    const msg = await respond(u, convo, text, mockEngine);
    openers.push(msg.text.split(/[.!]/)[0]);
  }
  for (let i = 1; i < openers.length; i++) assert.notEqual(openers[i], openers[i - 1]);
});

test('any interview question can be skipped, without guessing from the word "skip"', async () => {
  const u = user();
  const convo = newConversation();
  const { opening } = await import('../../src/agent/index.js');
  opening(u, convo);
  const before = JSON.stringify(u.hidden);
  const first = convo.pending.id;
  const msg = await respond(u, convo, 'Skip', mockEngine);
  assert.match(msg.text, /skip that/);
  assert.notEqual(convo.pending.id, first);
  assert.equal(JSON.stringify(u.hidden), before);
});

test('basics cannot be skipped', async () => {
  const u = user();
  u.basics.city = null;
  const convo = newConversation();
  const { opening } = await import('../../src/agent/index.js');
  opening(u, convo);
  const msg = await respond(u, convo, 'skip', mockEngine);
  assert.match(msg.text, /city/i);
});

test('the matchmaker asks how far they would go, early, and remembers the answer', async () => {
  const u = user();
  const convo = newConversation();
  const order = [];
  for (let i = 0; i < 4; i++) {
    const q = nextQuestion(u, convo);
    convo.asked.push(q.id);
    order.push(q.id);
  }
  assert.equal(order[2], 'q_distance', order.join());
  // Tapping a quick reply sets it.
  const v = user();
  const c2 = newConversation();
  const { QUESTIONS } = await import('../../src/agent/questions.js');
  const q = QUESTIONS.find((x) => x.id === 'q_distance');
  for (const [label, want] of [['Only someone near me', 'near'], ['Up to a few hours away', 'hours'], ['Distance is no problem', 'any']]) {
    c2.pending = { id: q.id, kind: 'interview', mode: 'self', choices: q.choices };
    await respond(v, c2, label, mockEngine);
    assert.equal(v.basics.distance, want, label);
  }
});

test('a typed answer to the distance question is understood too', async () => {
  const { parseDistance } = await import('../../src/agent/index.js');
  assert.equal(parseDistance('No, I want someone in my city'), 'near');
  assert.equal(parseDistance('Yes, distance is no problem'), 'any');
  assert.equal(parseDistance('Maybe a couple of hours by train'), 'hours');
  assert.equal(parseDistance('hmm'), null);
  const u = user();
  const convo = newConversation();
  convo.pending = { id: 'q_distance', kind: 'interview', mode: 'self' };
  await respond(u, convo, 'I would rather keep it local', mockEngine);
  assert.equal(u.basics.distance, 'near');
});

test('the distance question is skipped once it is set in settings', () => {
  const u = user();
  u.basics.distance = 'any';
  const convo = newConversation();
  for (let i = 0; i < 12; i++) {
    const q = nextQuestion(u, convo);
    assert.notEqual(q.id, 'q_distance');
    convo.asked.push(q.id);
  }
});
