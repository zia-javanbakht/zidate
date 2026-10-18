// Round 4 unit tests: dates, turns, line feedback, reasons, identities.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../src/db.js';
import { newUser } from '../../src/app.js';
import { TRAIT_KEYS } from '../../src/traits.js';
import { signalBoost } from '../../src/matching.js';
import { recordMet, recordMetReason, dateRating, photoMismatches } from '../../src/dates.js';
import { signalsOf } from '../../src/signals.js';

function person(store, basics = {}) {
  const u = newUser(store, { name: 'P', email: `${Math.random()}@x.co`, password: null });
  u.basics = { gender: 'woman', seeking: 'men', age: 33, city: 'London', ...basics };
  for (const k of TRAIT_KEYS) u.hidden.traits[k] = { value: 0.5, confidence: 0.6 };
  return u;
}

function match(store, a, b) {
  const id = [a.id, b.id].sort().join('~');
  store.data.matches[id] = { id, users: [a.id, b.id], createdAt: new Date().toISOString(), seen: {} };
  store.data.messages[id] = [];
  return store.data.matches[id];
}

test('date reviews: one is never enough to move matching; several are, and photo complaints count against', () => {
  const store = new Store(null);
  const viewer = person(store);
  const ben = person(store, { gender: 'man', seeking: 'women' });
  const base = signalBoost(store, viewer, ben);
  const dates = [0, 1, 2].map(() => person(store));
  for (const d of dates) match(store, d, ben);
  recordMet(store, dates[0], ben, 'once');
  recordMetReason(store, dates[0], ben, 'photos');
  assert.equal(dateRating(signalsOf(store, ben.id)), null, 'one review is not a rating');
  assert.equal(signalBoost(store, viewer, ben), base, 'and one photo complaint does nothing');
  recordMet(store, dates[1], ben, 'once');
  recordMetReason(store, dates[1], ben, 'photos');
  recordMet(store, dates[2], ben, 'once');
  assert.equal(dateRating(signalsOf(store, ben.id)), 0);
  assert.equal(photoMismatches(signalsOf(store, ben.id)), 2);
  assert.ok(signalBoost(store, viewer, ben) < base - 0.05);
  // Changing an answer replaces it rather than counting twice.
  recordMet(store, dates[2], ben, 'again');
  recordMet(store, dates[2], ben, 'again');
  assert.equal(Object.keys(signalsOf(store, ben.id).dateReviews).length, 3);
  assert.equal(dateRating(signalsOf(store, ben.id)), 1 / 3);
});

test('recordMet ignores unknown answers and pairs who are not matched', () => {
  const store = new Store(null);
  const a = person(store);
  const b = person(store);
  assert.equal(recordMet(store, a, b, 'again'), null);
  match(store, a, b);
  assert.equal(recordMet(store, a, b, 'maybe'), null);
  assert.ok(recordMet(store, a, b, 'talking').askAgainAt);
});
