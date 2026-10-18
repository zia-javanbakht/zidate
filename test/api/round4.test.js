// Round 4: features from the comparison with Hinge, Coffee Meets Bagel, Tinder, OkCupid and Bumble.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client, onboard, ANSWERS } from '../helpers.js';
import * as clock from '../../src/clock.js';
import { tick } from '../../src/scheduler.js';

test.after(() => clock.reset());

// Two real people who are each other's suggestions this week, before anyone decides.
async function two({ seed = false } = {}) {
  const s = await startServer({ seed });
  const a = client(s.base);
  const b = client(s.base);
  const A = (await onboard(a, { name: 'Ana', email: `ana${Math.random()}@x.co`, answers: { ...ANSWERS, b_gender: 'Woman', b_seeking: 'Men' } })).me;
  const B = (await onboard(b, { name: 'Ben', email: `ben${Math.random()}@x.co`, answers: { ...ANSWERS, b_gender: 'Man', b_seeking: 'Women' } })).me;
  // Ben shares a line of his own, so there is something to like.
  await b.post('/api/profile/items', { prompt: 'My ideal Sunday', text: 'Market, long lunch, a nap I will deny taking.' });
  await a.get('/api/week');
  await b.get('/api/week');
  return { s, a, b, A, B };
}

async function matched() {
  const t = await two();
  await t.a.post(`/api/week/${t.B.id}`, { decision: 'like' });
  const { match } = (await t.b.post(`/api/week/${t.A.id}`, { decision: 'like' })).data;
  return { ...t, match, mid: encodeURIComponent(match.id) };
}

test('like one line with a note: they see it on their card, and it opens the conversation', async () => {
  const { s, a, b, A, B } = await two();
  const week = (await a.get('/api/week')).data;
  const ben = week.picks.find((p) => p.id === B.id);
  const index = ben.items.findIndex((i) => i.text.startsWith('Market'));
  assert.ok(index >= 0);
  // Bad input is refused and leaves the decision open.
  assert.equal((await a.post(`/api/week/${B.id}`, { decision: 'like', on: { kind: 'item', index: 99 } })).status, 400);
  assert.equal((await a.post(`/api/week/${B.id}`, { decision: 'like', on: { kind: 'item', index }, note: 'Text me on whatsapp 07700 900123' })).status, 422);
  assert.equal((await a.post(`/api/week/${B.id}`, { decision: 'like', on: { kind: 'photo', index: 0 } })).status, 400, 'no photo to like');
  const r = await a.post(`/api/week/${B.id}`, { decision: 'like', on: { kind: 'item', index }, note: 'The nap you will deny taking. Respect.' });
  assert.equal(r.status, 200);
  assert.equal(r.data.match, null);

  const card = (await b.get('/api/week')).data.picks.find((p) => p.id === A.id);
  assert.equal(card.likedYou.note, 'The nap you will deny taking. Respect.');
  assert.match(card.likedYou.on.text, /^Market/);

  const { match } = (await b.post(`/api/week/${A.id}`, { decision: 'like' })).data;
  const thread = (await b.get(`/api/matches/${encodeURIComponent(match.id)}`)).data;
  assert.equal(thread.messages.length, 1);
  assert.equal(thread.messages[0].text, 'The nap you will deny taking. Respect.');
  assert.equal(thread.messages[0].mine, false);
  assert.match(thread.messages[0].about.text, /^Market/);
  assert.equal(s.store.data.likeNotes[`${A.id}>${B.id}`], undefined, 'used up once matched');
  await s.close();
});

test('a note is dropped when they pass, and a plain like stays private', async () => {
  const { s, a, b, A, B } = await two();
  await a.post(`/api/week/${B.id}`, { decision: 'like', note: 'Hello from the plain like test' });
  await b.post(`/api/week/${A.id}`, { decision: 'pass' });
  assert.equal(s.store.data.likeNotes[`${A.id}>${B.id}`], undefined);
  const t2 = await two();
  await t2.a.post(`/api/week/${t2.B.id}`, { decision: 'like' });
  assert.equal((await t2.b.get('/api/week')).data.picks[0].likedYou, null);
  await s.close();
  await t2.s.close();
});
