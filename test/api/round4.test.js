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

test('close a conversation kindly: a last message, then the thread is read-only and nobody is blocked', async () => {
  const { s, a, b, A, B, mid } = await matched();
  await b.post(`/api/matches/${mid}`, { text: 'Hey Ana, how is your week?' });
  const r = await a.post(`/api/matches/${mid}/close`, { line: 1 });
  assert.equal(r.status, 200);
  assert.match(r.data.message.text, /not feel this is going anywhere/);
  assert.equal(r.data.message.closing, true);
  assert.equal((await a.post(`/api/matches/${mid}/close`, {})).status, 409);
  assert.equal((await b.post(`/api/matches/${mid}`, { text: 'Oh. Okay.' })).status, 409);
  const seen = (await b.get(`/api/matches/${mid}`)).data;
  assert.deepEqual([seen.closed.byMe, seen.messages.at(-1).closing], [false, true]);
  assert.ok(s.store.data.notifications[B.id].some((n) => /closed your conversation kindly/.test(n.text)));
  const list = (await a.get('/api/matches')).data.matches;
  assert.equal(list[0].closed, true);
  assert.equal(s.store.data.blocks[`${A.id}>${B.id}`], undefined);
  // Hurtful closings are refused like any message.
  const t = await matched();
  assert.equal((await t.a.post(`/api/matches/${t.mid}/close`, { text: 'Bye, ugly cow' })).status, 422);
  await s.close();
  await t.s.close();
});

test('your turn: next week waits for the people waiting on you, and a reply releases it', async () => {
  const { s, a, b, A, mid } = await matched();
  await b.post(`/api/matches/${mid}`, { text: 'Hi Ana, fancy a coffee this week?' });
  // Next week, two days later or more.
  clock.advance(7 * 864e5);
  let wk = (await a.get('/api/week')).data;
  assert.equal(wk.held, true);
  assert.deepEqual(wk.owed.map((o) => o.name), ['Ben']);
  assert.equal((await a.post('/api/week/widen')).status, 409);
  // Ben is not held: it is Ana's turn, not his.
  assert.notEqual((await b.get('/api/week')).data.held, true);
  // The weekly job says why, once.
  tick(s.store, s.ctx);
  tick(s.store, s.ctx);
  const held = s.store.data.notifications[A.id].filter((n) => /waiting\. Answer Ben first/.test(n.text));
  assert.equal(held.length, 1);
  await a.post(`/api/matches/${mid}`, { text: 'Yes! Thursday?' });
  wk = (await a.get('/api/week')).data;
  assert.equal(wk.held, undefined);
  assert.equal(wk.ready, true);
  clock.reset();
  await s.close();
});

test('closing kindly also releases the week, and reminders go out once per waiting message', async () => {
  const { s, a, b, A, B, mid } = await matched();
  clock.advance(4 * 864e5);
  tick(s.store, s.ctx);
  const hello = (id) => s.store.data.notifications[id].filter((n) => /Say hello/.test(n.text)).length;
  assert.deepEqual([hello(A.id), hello(B.id)], [1, 1]);
  tick(s.store, s.ctx);
  assert.deepEqual([hello(A.id), hello(B.id)], [1, 1], 'only once');
  await b.post(`/api/matches/${mid}`, { text: 'Hi Ana!' });
  clock.advance(4 * 864e5);
  tick(s.store, s.ctx);
  tick(s.store, s.ctx);
  const waiting = s.store.data.notifications[A.id].filter((n) => /Ben is waiting for your reply/.test(n.text));
  assert.equal(waiting.length, 1);
  assert.equal((await a.get('/api/week')).data.held, true);
  await a.post(`/api/matches/${mid}/close`, {});
  assert.notEqual((await a.get('/api/week')).data.held, true);
  clock.reset();
  await s.close();
});

test('the day before a week ends, people who have not decided get one reminder', async () => {
  const { s, a, A } = await two();
  const next = Date.parse((await a.get('/api/week')).data.next);
  tick(s.store, s.ctx);
  const last = () => s.store.data.notifications[A.id]?.filter((n) => /Last day to decide on Ben/.test(n.text)).length || 0;
  if (next - Date.now() > 864e5) {
    assert.equal(last(), 0, 'not yet');
    clock.advance(next - Date.now() - 12 * 3600e3);
  }
  tick(s.store, s.ctx);
  tick(s.store, s.ctx);
  assert.equal(last(), 1);
  // Someone who decided is not reminded.
  const t = await two();
  await t.b.post(`/api/week/${t.A.id}`, { decision: 'pass' });
  tick(t.s.store, t.s.ctx);
  assert.ok(!(t.s.store.data.notifications[t.B.id] || []).some((n) => /Last day/.test(n.text)));
  clock.reset();
  await s.close();
  await t.s.close();
});

test('share date: plans go to a trusted contact, then "home safe", or an alert when there is no answer', async () => {
  const { s, a, A, mid } = await matched();
  const when = new Date(Date.now() + 2 * 864e5).toISOString();
  const plan = { when, place: 'Coffee at Monmouth, Borough Market' };
  assert.equal((await a.post(`/api/matches/${mid}/date`, plan)).status, 400, 'needs a contact');
  assert.equal((await a.put('/api/settings', { trustedContact: { name: 'Sara', email: 'nope' } })).status, 400);
  assert.equal((await a.put('/api/settings', { trustedContact: { name: 'Sara', email: s.store.data.users[A.id].email } })).status, 400, 'not yourself');
  assert.equal((await a.put('/api/settings', { trustedContact: { name: 'Sara', email: 'sara@friend.co' } })).status, 200);
  assert.equal((await a.post(`/api/matches/${mid}/date`, plan)).status, 403, 'needs a confirmed email');
  s.store.data.users[A.id].emailVerified = true;
  assert.equal((await a.post(`/api/matches/${mid}/date`, { ...plan, when: new Date(Date.now() + 90 * 864e5).toISOString() })).status, 400);
  assert.equal((await a.post(`/api/matches/${mid}/date`, { when, place: ' ' })).status, 400);
  const r = await a.post(`/api/matches/${mid}/date`, plan);
  assert.equal(r.status, 201);
  const mail = s.mailer.sent.at(-1);
  assert.equal(mail.to, 'sara@friend.co');
  assert.match(mail.text, /Who: Ben, 31, from London/);
  assert.match(mail.text, /Where: Coffee at Monmouth/);
  assert.match(mail.text, /does not contact emergency services/);
  assert.equal((await a.get(`/api/matches/${mid}`)).data.date.place, 'Coffee at Monmouth, Borough Market');
  // Changing the time updates the same plan.
  const r2 = await a.post(`/api/matches/${mid}/date`, { ...plan, when: new Date(Date.parse(when) + 3600e3).toISOString() });
  assert.equal(r2.status, 200);
  assert.equal(r2.data.date.id, r.data.date.id);
  assert.match(s.mailer.sent.at(-1).subject, /changed their date plans/);
  // A third share is fine; a fourth in one day is not.
  await a.post(`/api/matches/${mid}/date`, plan);
  assert.equal((await a.post(`/api/matches/${mid}/date`, plan)).status, 429);

  // Three hours after: "are you home safe?"; five hours after: the contact hears.
  clock.advance(2 * 864e5 + 3.5 * 3600e3);
  tick(s.store, s.ctx);
  assert.ok(s.store.data.notifications[A.id].some((n) => /Are you home safe\? Tap to let Sara know/.test(n.text)));
  assert.ok(!s.mailer.sent.some((m) => /have not heard/.test(m.subject)));
  clock.advance(2 * 3600e3);
  tick(s.store, s.ctx);
  tick(s.store, s.ctx);
  assert.equal(s.mailer.sent.filter((m) => /have not heard from Ana/.test(m.subject)).length, 1);
  // Late is still better than never.
  const safe = await a.post(`/api/dates/${r.data.date.id}/safe`, {});
  assert.equal(safe.data.date.status, 'safe');
  assert.match(s.mailer.sent.at(-1).subject, /Ana is home safe/);
  assert.equal((await a.post(`/api/dates/${r.data.date.id}/cancel`, {})).status, 409);
  clock.reset();
  await s.close();
});

test('share date: only your own plans, and cancelling tells the contact', async () => {
  const { s, a, b, A, mid } = await matched();
  s.store.data.users[A.id].emailVerified = true;
  await a.put('/api/settings', { trustedContact: { name: 'Sara', email: 'sara@friend.co' } });
  const { date } = (await a.post(`/api/matches/${mid}/date`, { when: new Date(Date.now() + 864e5).toISOString(), place: 'The park' })).data;
  assert.equal((await b.post(`/api/dates/${date.id}/safe`, {})).status, 404);
  assert.equal((await b.get(`/api/matches/${mid}`)).data.date, null, 'Ben never sees Ana\'s plans');
  assert.equal((await a.post(`/api/dates/${date.id}/cancel`, {})).data.date.status, 'cancelled');
  assert.match(s.mailer.sent.at(-1).subject, /called off/);
  assert.equal((await a.get(`/api/matches/${mid}`)).data.date, null);
  await a.put('/api/settings', { trustedContact: null });
  assert.equal((await a.get('/api/me')).data.user.settings.trustedContact, undefined);
  await s.close();
});

test('share date review: "home safe" survives an unmatch, and a long-past date never alarms anyone', async () => {
  const { s, a, A, mid } = await matched();
  s.store.data.users[A.id].emailVerified = true;
  await a.put('/api/settings', { trustedContact: { name: 'Sara', email: 'sara@friend.co' } });
  await a.post(`/api/matches/${mid}/date`, { when: new Date(Date.now() + 3600e3).toISOString(), place: 'The park' });
  await a.post(`/api/matches/${mid}/unmatch`, {});
  const { dates } = (await a.get('/api/dates')).data;
  assert.equal(dates.length, 1);
  assert.equal(dates[0].with, 'Ben');
  assert.equal(dates[0].matchId, null);
  // The server was down for three days: no late alarm.
  clock.advance(3 * 864e5);
  tick(s.store, s.ctx);
  assert.ok(!s.mailer.sent.some((m) => /have not heard/.test(m.subject)));
  assert.equal((await a.get('/api/dates')).data.dates.length, 0);
  clock.reset();
  await s.close();
});
