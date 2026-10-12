import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../src/db.js';
import { seedDemo } from '../../src/seed.js';
import { newUser } from '../../src/app.js';
import { weeklyPicks } from '../../src/matching.js';
import { respond, opening } from '../../src/agent/index.js';
import { mockEngine } from '../../src/agent/mock.js';
import { TRAIT_KEYS } from '../../src/traits.js';
import * as clock from '../../src/clock.js';

function makePerson(store) {
  const u = newUser(store, { name: 'Zia', email: `${Math.random()}@x.co`, password: null });
  u.basics = { gender: 'woman', seeking: 'men', age: 33, city: 'London', ageRange: 12 };
  for (const k of TRAIT_KEYS) u.hidden.traits[k] = { value: 0.5, confidence: 0.6 };
  return u;
}

function avgSocial(store, picks) {
  return picks.reduce((a, p) => a + store.data.users[p.id].hidden.traits.social.value, 0) / picks.length;
}

test('saying why you passed changes who you meet over the following weeks', async () => {
  clock.reset();
  const run = async (giveFeedback) => {
    const store = new Store(null);
    seedDemo(store, { count: 200 });
    const u = makePerson(store);
    const convo = store.data.conversations[u.id];
    opening(u, convo);
    if (giveFeedback) {
      convo.events.push({ type: 'pass', candidateId: 'x', name: 'Sam' });
      await respond(u, convo, 'Skip', mockEngine); // moves on to the feedback question
      await respond(u, convo, 'Too quiet. I want someone outgoing who loves parties, going out and big groups of friends.', mockEngine);
    }
    const socials = [];
    for (let w = 0; w < 2; w++) {
      const wp = weeklyPicks(store, u);
      socials.push(avgSocial(store, wp.picks));
      clock.advance(7 * 864e5);
    }
    clock.reset();
    return socials.reduce((a, b) => a + b, 0) / socials.length;
  };
  const without = await run(false);
  const withFeedback = await run(true);
  assert.ok(withFeedback > without + 0.1, `social of suggestions: ${without.toFixed(2)} -> ${withFeedback.toFixed(2)}`);
});
