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
