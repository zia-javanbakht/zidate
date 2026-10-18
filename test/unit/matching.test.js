import test from 'node:test';
import assert from 'node:assert/strict';
import { eligible, compatibility, fit, weeklyPicks, PER_WEEK, reason, maxDistance } from '../../src/matching.js';
import { distanceKm, nearby } from '../../src/cities.js';
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

test('people nearby come first; others are told how far away they are', () => {
  clock.reset();
  const s = new Store(null);
  seedDemo(s);
  const a = person(s, { gender: 'woman', seeking: 'men', age: 30, city: 'Berlin' }, 0.6);
  const w = weeklyPicks(s, a);
  assert.ok(w.picks.every((p) => nearby(p.city, 'Berlin')), JSON.stringify(w.picks.map((p) => p.city)));
  const far = person(s, { gender: 'woman', seeking: 'men', age: 30, city: 'Lisbon' }, 0.6);
  const w2 = weeklyPicks(s, far);
  assert.equal(w2.picks.length, 2);
  // Lisbon is on the map, so the reason says how far rather than "further away".
  assert.ok(w2.picks.every((p) => /About [\d,]+ km away, in /.test(p.reason)), JSON.stringify(w2.picks.map((p) => p.reason)));
});

test('distances between cities: same city, the next town, another country, unknown', () => {
  assert.equal(distanceKm('London', 'london'), 0);
  assert.equal(distanceKm('NYC', 'Jersey City') < 10, true);
  assert.ok(Math.abs(distanceKm('London', 'Berlin') - 930) < 20);
  assert.equal(distanceKm('London', 'Atlantis'), null);
  assert.equal(distanceKm('Atlantis', 'Atlantis'), 0, 'an unknown city still matches itself');
  assert.equal(nearby('Toronto', 'Mississauga'), true);
  assert.equal(nearby('London', 'Manchester'), false);
});

test('how far each person would go decides who can be suggested, both ways', () => {
  const s = new Store(null);
  const base = { age: 30, ageRange: 10 };
  const her = (distance, city = 'London') => person(s, { gender: 'woman', seeking: 'men', city, distance, ...base });
  const him = (distance, city) => person(s, { gender: 'man', seeking: 'women', city, distance, ...base });
  // Not chosen yet: anywhere is possible, as before.
  assert.equal(eligible(her(null), him(null, 'Berlin')), true);
  // Near: same city or the next town only.
  assert.equal(eligible(her('near'), him('any', 'London')), true);
  assert.equal(eligible(her('near'), him('any', 'Reading')), true, 'about 60 km');
  assert.equal(eligible(her('near'), him('any', 'Bristol')), false);
  // A few hours: Bristol yes, Berlin no.
  assert.equal(eligible(her('hours'), him('any', 'Bristol')), true);
  assert.equal(eligible(her('hours'), him('any', 'Berlin')), false);
  // Open to long distance, but the other person is not: no.
  assert.equal(eligible(her('any'), him('near', 'Berlin')), false);
  assert.equal(eligible(her('any'), him('any', 'Berlin')), true);
  // Someone who wants a person close by, and a city we cannot place: only the same city counts.
  assert.equal(eligible(her('hours'), him('any', 'Atlantis')), false);
  assert.equal(eligible(her('hours', 'Atlantis'), him('any', 'Atlantis')), true);
  // "Too far away" on a pass narrows anyone to their own area.
  const narrowed = her('any');
  narrowed.hidden.limits.localOnly = true;
  assert.equal(maxDistance(narrowed), 60);
});

test('closer people rank first unless the person is open to long distance', () => {
  clock.reset();
  const s = new Store(null);
  const base = { gender: 'man', seeking: 'women', age: 31, ageRange: 10 };
  const local = person(s, { ...base, city: 'London', distance: 'any' }, 0.2);
  const few = person(s, { ...base, city: 'Bristol', distance: 'any' }, 0.5);
  const far = person(s, { ...base, city: 'Berlin', distance: 'any' }, 0.5);
  for (const u of [local, few, far]) u.hidden.traits.social = { value: 0.5, confidence: 0.7 };
  const ids = (u) => weeklyPicks(s, u).picks.map((p) => p.id);
  // Prefers a few hours at most: the closest two, in that order, even though London fits worse.
  const a = person(s, { gender: 'woman', seeking: 'men', age: 30, ageRange: 10, city: 'London', distance: 'hours' }, 0.5);
  assert.deepEqual(ids(a), [local.id, few.id]);
  // Distance is no problem: the best fits, wherever they are.
  const b = person(s, { gender: 'woman', seeking: 'men', age: 30, ageRange: 10, city: 'London', distance: 'any' }, 0.5);
  assert.deepEqual(new Set(ids(b)), new Set([few.id, far.id]));
});

test('the reason mentions distance from the cities on both profiles', () => {
  const s = new Store(null);
  const a = person(s, { gender: 'woman', seeking: 'men', age: 30, city: 'London' });
  const at = (city) => reason(a, person(s, { gender: 'man', seeking: 'women', age: 30, city }));
  assert.doesNotMatch(at('London'), /away|close/i);
  assert.match(at('Reading'), /Close by, in Reading\./);
  assert.match(at('Berlin'), /About 9\d0 km away, in Berlin\./);
  assert.match(at('Atlantis'), /A little further away, in Atlantis\./);
});
