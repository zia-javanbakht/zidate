import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../src/db.js';
import { seedDemo } from '../../src/seed.js';
import { newUser } from '../../src/app.js';
import { weeklyPicks, eligible } from '../../src/matching.js';
import { respond, opening } from '../../src/agent/index.js';
import { mockEngine } from '../../src/agent/mock.js';
import { feedbackQuestion } from '../../src/agent/questions.js';
import { TRAIT_KEYS, CORE_TRAITS } from '../../src/traits.js';
import { completeness, describeHidden, publicProfile, upgradeUser, applyUpdate } from '../../src/profile.js';
import * as clock from '../../src/clock.js';

function makePerson(store, basics = {}) {
  const u = newUser(store, { name: 'Zia', email: `${Math.random()}@x.co`, password: null });
  u.basics = { gender: 'woman', seeking: 'men', age: 33, city: 'London', ageRange: 12, ...basics };
  for (const k of TRAIT_KEYS) u.hidden.traits[k] = { value: 0.5, confidence: 0.6 };
  return u;
}

// Put a pass event in front of the conversation and reach its first question.
async function startPass(u, convo, event) {
  opening(u, convo);
  convo.events.push({ type: 'pass', candidateId: 'u_x', name: 'Sam', ...event });
  return respond(u, convo, 'Skip', mockEngine);
}

test('passing asks for the main reason, offering only reasons that fit', () => {
  const plain = feedbackQuestion({ type: 'pass', candidateId: 'u_x', name: 'Sam' });
  assert.deepEqual(plain.choices.map((c) => c.label), ['No spark', 'Something else']);
  const full = feedbackQuestion({ type: 'pass', candidateId: 'u_x', name: 'Sam', aspects: [{ trait: 'social', value: 0.9 }], away: true, age: 40, older: true, thin: true });
  assert.deepEqual(full.choices.map((c) => c.label), ['No spark', 'Our lives seem different', 'A bit too old for me', 'Too far away', 'Their profile said too little', 'Something else']);
});

test('"our lives seem different" asks which part, and steers preferences away from it', async () => {
  const store = new Store(null);
  const u = makePerson(store);
  const convo = store.data.conversations[u.id];
  await startPass(u, convo, { aspects: [{ trait: 'social', value: 0.9, gap: 0.4 }, { trait: 'tidiness', value: 0.2, gap: 0.3 }, { trait: 'family', value: 0.5, gap: 0 }] });
  const which = await respond(u, convo, 'Our lives seem different', mockEngine);
  assert.match(which.text, /Which part of Sam's life/);
  // Always the same list, whatever Sam's hidden profile says.
  assert.deepEqual(which.choices, ['Social life', 'Family plans', 'Where work fits', 'Routine versus new things', 'Faith', 'How active they are', 'A bit of everything']);
  // Neutral labels only: nothing from Sam's hidden profile shows.
  assert.ok(!/0\.9|energised|recharges/.test(JSON.stringify(which)));
  await respond(u, convo, 'Social life', mockEngine);
  assert.ok(u.hidden.preference.social.value < 0.3, 'wants someone less social than Sam');
  assert.equal(u.hidden.preference.tidiness, undefined);
  assert.deepEqual(u.hidden.passReasons.map(({ reason, detail }) => ({ reason, detail })), [{ reason: 'lifestyle', detail: 'social' }]);
});

test('"too old" offers an age limit that matching then respects, and widening lifts it', async () => {
  const store = new Store(null);
  const u = makePerson(store);
  const convo = store.data.conversations[u.id];
  await startPass(u, convo, { age: 40, older: true });
  const confirm = await respond(u, convo, 'A bit too old for me', mockEngine);
  assert.match(confirm.text, /younger than 40/);
  await respond(u, convo, 'Yes, please', mockEngine);
  assert.equal(u.hidden.limits.ageMax, 39);
  assert.deepEqual(describeHidden(u).limits, [{ key: 'age', text: 'Younger than 40' }]);
  const older = makePerson(store, { gender: 'man', seeking: 'women', age: 41 });
  const younger = makePerson(store, { gender: 'man', seeking: 'women', age: 36 });
  assert.equal(eligible(u, older), false);
  assert.equal(eligible(u, younger), true);
});

test('"no, it was more than age" moves on to an open question instead', async () => {
  const store = new Store(null);
  const u = makePerson(store);
  const convo = store.data.conversations[u.id];
  await startPass(u, convo, { age: 25, older: false });
  await respond(u, convo, 'A bit too young for me', mockEngine);
  const open = await respond(u, convo, 'No, it was more than age', mockEngine);
  assert.match(open.text, /didn't feel right about Sam/);
  assert.equal(u.hidden.limits.ageMin, undefined);
});

test('"no spark" follows up with what does spark it, which shapes preferences', async () => {
  const store = new Store(null);
  const u = makePerson(store);
  const convo = store.data.conversations[u.id];
  await startPass(u, convo, {});
  const q = await respond(u, convo, 'No spark', mockEngine);
  assert.match(q.text, /clicked with straight away/);
  await respond(u, convo, 'They were funny, always joking, and loved going out with friends to parties.', mockEngine);
  assert.ok(u.hidden.preference.social.value > 0.6);
  assert.ok(u.hidden.preference.humour.value > 0.6);
});

test('"too far away" keeps future suggestions in their city', async () => {
  clock.reset();
  const store = new Store(null);
  seedDemo(store, { count: 200 });
  const u = makePerson(store);
  const convo = store.data.conversations[u.id];
  await startPass(u, convo, { away: true });
  await respond(u, convo, 'Too far away', mockEngine);
  assert.equal(u.hidden.limits.localOnly, true);
  for (let w = 0; w < 3; w++) {
    for (const p of weeklyPicks(store, u).picks) assert.equal(p.city, 'London');
    clock.advance(7 * 864e5);
  }
  clock.reset();
});

test('new traits deepen the profile without delaying readiness', () => {
  const store = new Store(null);
  const u = makePerson(store);
  for (const k of TRAIT_KEYS) u.hidden.traits[k] = { value: 0.5, confidence: 0 };
  for (const k of CORE_TRAITS) u.hidden.traits[k].confidence = 0.6;
  assert.equal(completeness(u), 0.7);
  assert.ok(TRAIT_KEYS.length > CORE_TRAITS.length);
});

test('older stored people gain the new profile parts', () => {
  const old = { hidden: { traits: { social: { value: 0.7, confidence: 0.5 } }, tags: [], dealbreakers: [], values: [], notes: [], preference: {} }, shared: { interests: [], items: [] } };
  upgradeUser(old);
  assert.equal(old.hidden.traits.social.value, 0.7);
  assert.deepEqual(old.hidden.traits.humour, { value: 0.5, confidence: 0 });
  assert.deepEqual(old.hidden.limits, {});
  assert.deepEqual(old.shared.facts, {});
});

test('facts are suggested from what someone says, and shown only once approved', () => {
  const store = new Store(null);
  const u = makePerson(store);
  applyUpdate(u, { tags: ['non-smoker', 'vegan'], facts: { languages: 'English, Farsi', kids: 'not an option' } });
  assert.deepEqual(u.shared.facts.smoking, { value: "Doesn't smoke", status: 'suggested' });
  assert.equal(u.shared.facts.diet.value, 'Vegan');
  assert.equal(u.shared.facts.languages.value, 'English, Farsi');
  assert.equal(u.shared.facts.kids, undefined, 'invalid option dropped');
  assert.deepEqual(publicProfile(u).facts, []);
  u.shared.facts.diet.status = 'approved';
  // A suggestion never overrides what the person approved.
  applyUpdate(u, { tags: ['vegetarian'] });
  assert.equal(u.shared.facts.diet.value, 'Vegan');
  assert.deepEqual(publicProfile(u).facts, [{ key: 'diet', label: 'Diet', value: 'Vegan' }]);
});
