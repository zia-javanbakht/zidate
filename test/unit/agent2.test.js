import test from 'node:test';
import assert from 'node:assert/strict';
import { nextQuestion, newConversation, respond, opening, resume } from '../../src/agent/index.js';
import { QUESTIONS, DEEPER } from '../../src/agent/questions.js';
import { mockEngine } from '../../src/agent/mock.js';
import { emptyHidden } from '../../src/traits.js';
import { normalizeCity } from '../../src/cities.js';
import { TEMPERAMENT_ITEMS } from '../../src/temperament.js';
import { summarize } from '../../src/profile.js';
import * as clock from '../../src/clock.js';

function user() {
  return { id: 'u1', name: 'A', basics: { gender: 'woman', seeking: 'men', age: 30, city: 'London' }, hidden: emptyHidden(), shared: { bio: '', bioDraft: '', interests: [], items: [] } };
}

test('after the core interview, the matchmaker keeps going deeper where it knows least', () => {
  const u = user();
  const convo = newConversation();
  convo.asked = [...QUESTIONS, ...TEMPERAMENT_ITEMS].map((q) => q.id);
  for (const k of Object.keys(u.hidden.traits)) u.hidden.traits[k].confidence = 0.8;
  u.hidden.traits.spirituality.confidence = 0.1;
  const q = nextQuestion(u, convo);
  assert.ok(DEEPER.some((d) => d.id === q.id));
  assert.deepEqual(q.traits, ['spirituality']);
});

test('a clear contradiction triggers a direct check instead of silent averaging', async () => {
  const u = user();
  u.hidden.traits.social = { value: 0.1, confidence: 0.7 };
  const convo = newConversation();
  opening(u, convo);
  convo.pending = { id: 'q_x', kind: 'interview', mode: 'self', text: 'Tell me about your weekends.' };
  await respond(u, convo, 'I live for parties, crowds, festivals and going out with all my friends.', mockEngine);
  const msg = await respond(u, convo, 'Skip', mockEngine);
  assert.match(msg.text, /which sounds more like you/);
});

test('coming back after a day gets a greeting and the open question again', () => {
  const u = user();
  const convo = newConversation();
  opening(u, convo);
  assert.equal(resume(u, convo), null, 'not straight away');
  clock.advance(2 * 864e5);
  const msg = resume(u, convo);
  clock.reset();
  assert.match(msg.text, /^Welcome back, A\./);
  assert.equal(msg.qid, convo.pending.id);
});

test('city names people type are normalised', () => {
  assert.equal(normalizeCity('nyc'), 'New York');
  assert.equal(normalizeCity('paris, france'), 'Paris');
  assert.equal(normalizeCity('  são paulo '), 'São Paulo');
  assert.equal(normalizeCity('München'), 'Munich');
});

test('a plain-language summary of the hidden profile', () => {
  const u = user();
  assert.match(summarize(u), /Still getting to know you/);
  u.hidden.traits.social = { value: 0.9, confidence: 0.6 };
  u.hidden.preference.adventure = { value: 0.9, confidence: 0.4 };
  u.hidden.dealbreakers = ['smoker'];
  const s = summarize(u);
  assert.match(s, /energised by people/);
  assert.match(s, /chases novelty/);
  assert.match(s, /Dealbreakers: smoker/);
});
