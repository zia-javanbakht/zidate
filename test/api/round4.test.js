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

// Skip whatever the matchmaker asks until a question matching re comes up.
async function untilAsked(c, re, max = 12) {
  let q = (await c.get('/api/chat')).data.messages.at(-1);
  for (let i = 0; i < max && !re.test(q.text); i++) q = (await c.post('/api/chat', { text: 'skip' })).data.message;
  assert.match(q.text, re);
  return q;
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

test('"did you meet?": a week on, quick replies teach matching, and still talking is asked again', async () => {
  const { s, a, b, A, B, match } = await matched();
  await a.post(`/api/matches/${encodeURIComponent(match.id)}`, { text: 'Hi Ben!' });
  await b.post(`/api/matches/${encodeURIComponent(match.id)}`, { text: 'Hi Ana!' });
  clock.advance(8 * 864e5);
  tick(s.store, s.ctx);
  // Ana answers in the conversation with the matchmaker.
  let q = await untilAsked(a, /Did you meet/);
  assert.ok(q.choices.includes('Yes, and I want to see them again'));
  const before = JSON.stringify(s.store.data.users[A.id].hidden.preference);
  await a.post('/api/chat', { text: 'Yes, and I want to see them again' });
  assert.notEqual(JSON.stringify(s.store.data.users[A.id].hidden.preference), before, 'preferences move toward Ben');
  assert.equal(s.store.data.signals[A.id].dates[B.id], 'again');
  const reviews = Object.values(s.store.data.signals[B.id].dateReviews);
  assert.deepEqual(reviews, [{ answer: 'again' }]);
  assert.ok(!JSON.stringify(s.store.data.signals[B.id].dateReviews).includes(A.id), 'never names who said it');
  // Ben is still talking, and is asked again two weeks later; Ana is not.
  await untilAsked(b, /Did you meet/);
  await b.post('/api/chat', { text: 'Not yet, we are talking' });
  clock.advance(15 * 864e5);
  tick(s.store, s.ctx);
  await untilAsked(b, /still talking/);
  assert.ok(!s.store.data.conversations[A.id].events.some((e) => e.type === 'checkin'), 'Ana is not asked again');
  clock.reset();
  await s.close();
});

test('"once was enough" from the conversation: the matchmaker asks why, and "not safe" is reported', async () => {
  const { s, a, A, B, mid } = await matched();
  assert.equal((await a.post(`/api/matches/${mid}/met`, { answer: 'nope' })).status, 400);
  const r = await a.post(`/api/matches/${mid}/met`, { answer: 'once' });
  assert.deepEqual(r.data, { met: 'once', ask: true });
  assert.equal((await a.get(`/api/matches/${mid}`)).data.met, 'once');
  const q = (await a.get('/api/chat')).data.messages.at(-1);
  assert.match(q.text, /once enough with Ben/);
  await a.post('/api/chat', { text: 'I did not feel safe' });
  const report = s.store.data.reports.find((x) => x.about === B.id && x.by === A.id);
  assert.equal(report.source, 'date');
  assert.equal(Object.values(s.store.data.signals[B.id].dateReviews)[0].reason, 'unsafe');
  await s.close();
});
