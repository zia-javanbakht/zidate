import test from 'node:test';
import assert from 'node:assert/strict';
import { eligible, compatibility, fit, weeklyPicks, PER_WEEK } from '../../src/matching.js';
import { Store } from '../../src/db.js';
import { seedDemo } from '../../src/seed.js';
import { newUser } from '../../src/app.js';
import { TRAIT_KEYS } from '../../src/traits.js';
import * as clock from '../../src/clock.js';

function person(store, basics, traitValue = 0.5) {
  const u = newUser(store, { name: 'P', email: `${Math.random()}@x.com`, password: null });
  u.basics = { ...basics };
  for (const k of TRAIT_KEYS) u.hidden.traits[k] = { value: traitValue, confidence: 0.7 };
  return u;
}

test('eligibility respects who each person wants to meet, both ways', () => {
  const s = new Store(null);
  const a = person(s, { gender: 'woman', seeking: 'men', age: 30, city: 'London' });
  const b = person(s, { gender: 'man', seeking: 'women', age: 32, city: 'London' });
  const c = person(s, { gender: 'man', seeking: 'men', age: 32, city: 'London' });
  assert.equal(eligible(a, b), true);
  assert.equal(eligible(a, c), false);
});

test('age gaps and dealbreakers exclude', () => {
  const s = new Store(null);
  const a = person(s, { gender: 'woman', seeking: 'men', age: 25, city: 'London' });
  const old = person(s, { gender: 'man', seeking: 'women', age: 45, city: 'London' });
  assert.equal(eligible(a, old), false);
  const tight = person(s, { gender: 'man', seeking: 'women', age: 27, city: 'London', ageRange: 3 });
  assert.equal(eligible(a, tight), true);
  a.basics.ageRange = 3;
  const four = person(s, { gender: 'man', seeking: 'women', age: 29, city: 'London' });
  assert.equal(eligible(a, four), false, 'outside her chosen range');
  const b = person(s, { gender: 'man', seeking: 'women', age: 27, city: 'London' });
  b.hidden.tags.push('smoker');
  a.hidden.dealbreakers.push('smoker');
  assert.equal(eligible(a, b), false);
});

test('similar people score higher than opposites', () => {
  const s = new Store(null);
  const a = person(s, { gender: 'woman', seeking: 'men', age: 30, city: 'London' }, 0.8);
  const near = person(s, { gender: 'man', seeking: 'women', age: 31, city: 'London' }, 0.75);
  const far = person(s, { gender: 'man', seeking: 'women', age: 31, city: 'London' }, 0.1);
  assert.ok(compatibility(a, near) > compatibility(a, far));
});

test('learned preferences shift who fits', () => {
  const s = new Store(null);
  const a = person(s, { gender: 'woman', seeking: 'men', age: 30, city: 'London' }, 0.5);
  const social = person(s, { gender: 'man', seeking: 'women', age: 31, city: 'London' });
  social.hidden.traits.social.value = 0.95;
  const before = fit(a, social);
  a.hidden.preference.social = { value: 0.95, confidence: 0.6 };
  assert.ok(fit(a, social) > before);
});

test('two picks a week, stable within the week, fresh the next', () => {
  clock.reset();
  const s = new Store(null);
  seedDemo(s);
  const a = person(s, { gender: 'woman', seeking: 'men', age: 30, city: 'London' }, 0.6);
  const w1 = weeklyPicks(s, a);
  assert.equal(w1.picks.length, PER_WEEK);
  assert.deepEqual(weeklyPicks(s, a).picks.map((p) => p.id), w1.picks.map((p) => p.id));
  clock.advance(7 * 864e5);
  const w2 = weeklyPicks(s, a);
  assert.equal(w2.picks.length, PER_WEEK);
  assert.ok(w2.picks.every((p) => !w1.picks.some((q) => q.id === p.id)));
  clock.reset();
});

test('not ready means no picks', () => {
  const s = new Store(null);
  seedDemo(s);
  const a = newUser(s, { name: 'New', email: 'n@x.com', password: null });
  assert.equal(weeklyPicks(s, a).ready, false);
});

test('people in the same city come first; others are labelled as further away', () => {
  clock.reset();
  const s = new Store(null);
  seedDemo(s);
  const a = person(s, { gender: 'woman', seeking: 'men', age: 30, city: 'Berlin' }, 0.6);
  const w = weeklyPicks(s, a);
  assert.ok(w.picks.every((p) => p.city === 'Berlin'), JSON.stringify(w.picks.map((p) => p.city)));
  const far = person(s, { gender: 'woman', seeking: 'men', age: 30, city: 'Lisbon' }, 0.6);
  const w2 = weeklyPicks(s, far);
  assert.equal(w2.picks.length, 2);
  assert.ok(w2.picks.every((p) => p.reason.includes('further away')));
});
