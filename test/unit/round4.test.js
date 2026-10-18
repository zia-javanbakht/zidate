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

import { lineFeedback } from '../../src/feedback.js';

test('line feedback: short, clichéd and negative lines get a tip; specific ones are praised', () => {
  assert.equal(lineFeedback('My ideal Sunday', 'Brunch.').level, 'deeper');
  const c = lineFeedback('What makes me laugh', 'I love to laugh and I am pretty easy going really.');
  assert.equal(c.level, 'tweak');
  assert.match(c.tip, /^Loving to laugh is on a lot of profiles/);
  assert.equal(lineFeedback('The way to win me over', 'No drama please, and if you can’t hold a conversation do not bother.').level, 'tweak');
  assert.equal(lineFeedback('A trip I still think about', 'Getting lost in Lisbon for 3 days and finding the best custard tart of my life.').level, 'great');
  assert.equal(lineFeedback('A trip I still think about', 'I love to travel, last year I finally went to Japan with my sister.').level, 'great', 'a cliché with a real detail is fine');
  assert.equal(lineFeedback('My ideal Sunday', 'Sleeping in and then going for a nice walk.').level, 'deeper');
});

import { reason } from '../../src/matching.js';

test('why we picked them: facts both chose to show, never hidden ones', () => {
  const store = new Store(null);
  const a = person(store);
  const b = person(store, { gender: 'man', seeking: 'women' });
  assert.equal(reason(a, b), 'Our conversations suggest you would get on.');
  a.hidden.tags.push('wants-kids');
  b.hidden.tags.push('wants-kids');
  assert.equal(reason(a, b), 'Our conversations suggest you would get on.', 'hidden tags are never named');
  a.shared.facts.kids = { value: 'Wants kids', status: 'approved' };
  b.shared.facts.kids = { value: 'Wants kids', status: 'suggested' };
  assert.equal(reason(a, b), 'Our conversations suggest you would get on.', 'only approved facts');
  b.shared.facts.kids.status = 'approved';
  assert.equal(reason(a, b), 'You both want kids one day.');
  a.shared.interests = ['films'];
  b.shared.interests = ['films'];
  assert.equal(reason(a, b), 'You both like films. You both want kids one day.');
  delete a.shared.facts.kids;
  a.shared.facts.languages = { value: 'English, Farsi', status: 'approved' };
  b.shared.facts.languages = { value: 'farsi and French', status: 'approved' };
  assert.equal(reason(a, b), 'You both like films. You both speak Farsi.');
});

import { eligible } from '../../src/matching.js';
import { respond, opening } from '../../src/agent/index.js';

test('identities: non-binary people can be sought on their own or with women or men', async () => {
  const store = new Store(null);
  const nb = person(store, { gender: 'nonbinary', seeking: 'women-nb' });
  const w = person(store, { gender: 'woman', seeking: 'men-nb' });
  const m = person(store, { gender: 'man', seeking: 'women' });
  const w2 = person(store, { gender: 'woman', seeking: 'nonbinary' });
  assert.equal(eligible(nb, w), true);
  assert.equal(eligible(nb, w2), true);
  assert.equal(eligible(w, m), true);
  assert.equal(eligible(nb, m), false, 'he wants women only');
  assert.equal(eligible(w2, m), false);
  // Typed answers in the conversation.
  const u = newUser(store, { name: 'T', email: 't@x.co', password: null });
  const convo = store.data.conversations[u.id];
  opening(u, convo);
  await respond(u, convo, 'Non-binary');
  await respond(u, convo, 'Women and non-binary people');
  assert.equal(u.basics.seeking, 'women-nb');
});
