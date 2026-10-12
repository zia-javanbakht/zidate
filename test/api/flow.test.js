import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client, onboard } from '../helpers.js';
import * as clock from '../../src/clock.js';

let srv;
test.before(async () => { srv = await startServer(); });
test.after(async () => { await srv.close(); clock.reset(); });

test('signup validation and duplicate email', async () => {
  const c = client(srv.base);
  assert.equal((await c.post('/api/signup', { name: '', email: 'a@b.co', password: 'password1' })).status, 400);
  assert.equal((await c.post('/api/signup', { name: 'A', email: 'nope', password: 'password1' })).status, 400);
  assert.equal((await c.post('/api/signup', { name: 'A', email: 'a@b.co', password: 'short' })).status, 400);
  assert.equal((await c.post('/api/signup', { name: 'A', email: 'dup@b.co', password: 'password1' })).status, 201);
  assert.equal((await client(srv.base).post('/api/signup', { name: 'B', email: 'DUP@b.co', password: 'password1' })).status, 409);
});

test('login, logout, and auth required', async () => {
  const c = client(srv.base);
  assert.equal((await c.get('/api/me')).data.user, null);
  assert.equal((await c.get('/api/profile')).status, 401);
  await c.post('/api/signup', { name: 'L', email: 'l@b.co', password: 'password1' });
  assert.equal((await c.post('/api/logout')).status, 200);
  assert.equal((await c.get('/api/me')).data.user, null);
  assert.equal((await c.post('/api/login', { email: 'l@b.co', password: 'wrong-pass' })).status, 401);
  assert.equal((await c.post('/api/login', { email: 'L@b.co', password: 'password1' })).status, 200);
  assert.equal((await c.get('/api/me')).data.user.name, 'L');
});

test('the interview fills both profiles and unlocks matching', async () => {
  const c = client(srv.base);
  const last = await onboard(c);
  assert.ok(last.me.ready, `expected ready, completeness ${last.me.completeness}`);
  const { data } = await c.get('/api/profile');
  assert.ok(data.shared.items.length >= 2, 'agent suggested shared lines');
  assert.ok(data.shared.items.every((i) => i.status === 'suggested'));
  assert.ok(data.shared.interests.length >= 2);
  assert.ok(data.hidden.traits.filter((t) => t.confidence > 0.2).length >= 5);
  assert.ok(data.hidden.tags.includes('wants-kids') || data.hidden.tags.includes('non-smoker'));
  assert.equal(data.preview.items.length, 0, 'nothing public until approved');
});

test('the chat mentions when matching unlocks, once', async () => {
  const c = client(srv.base);
  await onboard(c);
  const { data } = await c.get('/api/chat');
  const hits = data.messages.filter((m) => m.role === 'agent' && m.text.includes('first two people'));
  assert.equal(hits.length, 1);
});

test('approving a suggestion makes it public; editing works', async () => {
  const c = client(srv.base);
  await onboard(c);
  const { data } = await c.get('/api/profile');
  const item = data.shared.items[0];
  await c.patch(`/api/profile/items/${item.id}`, { status: 'approved', text: 'Edited line.' });
  const after = await c.get('/api/profile');
  assert.deepEqual(after.data.preview.items.map((i) => i.text), ['Edited line.']);
  await c.put('/api/profile/bio', { useDraft: true });
  assert.ok((await c.get('/api/profile')).data.preview.bio.length > 0);
});

test('exactly two suggestions a week, and they reveal nothing hidden', async () => {
  const c = client(srv.base);
  await onboard(c);
  const { data } = await c.get('/api/week');
  assert.equal(data.ready, true);
  assert.equal(data.picks.length, 2);
  const json = JSON.stringify(data);
  for (const leak of ['traits', 'hidden', 'dealbreakers', 'notes', 'email', 'password', 'score', 'preference']) {
    assert.ok(!json.includes(`"${leak}"`), `leaked ${leak}`);
  }
  assert.deepEqual((await c.get('/api/week')).data.picks.map((p) => p.id), data.picks.map((p) => p.id));
});

test('deciding: like/pass once, pass triggers a follow-up question that updates preferences', async () => {
  const c = client(srv.base);
  const { me } = await onboard(c);
  const { data } = await c.get('/api/week');
  const [a, b] = data.picks;
  assert.equal((await c.post(`/api/week/${a.id}`, { decision: 'maybe' })).status, 400);
  assert.equal((await c.post('/api/week/u_nobody', { decision: 'like' })).status, 404);
  const r = await c.post(`/api/week/${b.id}`, { decision: 'pass' });
  assert.equal(r.status, 200);
  assert.equal((await c.post(`/api/week/${b.id}`, { decision: 'like' })).status, 409);

  const before = (await c.get('/api/profile')).data;
  const reply = await c.post('/api/chat', { text: 'Tell me more' });
  assert.match(reply.data.message.text, new RegExp(`passed on ${b.name}`));
  await c.post('/api/chat', { text: 'They seemed too quiet, I want someone who loves parties and going out.' });
  const userObj = srv.store.data.users[me.id];
  assert.ok(userObj.hidden.preference.social.value > 0.6, 'learned they want someone more social');
  assert.ok(before);
});

test('mutual like creates a match and both sides can message', async () => {
  const c = client(srv.base);
  const { me } = await onboard(c);
  // The first suggestion already liked this person, so a like is mutual.
  const { data } = await c.get('/api/week');
  srv.store.data.likes[`${data.picks[0].id}>${me.id}`] = new Date().toISOString();
  const r = await c.post(`/api/week/${data.picks[0].id}`, { decision: 'like' });
  assert.ok(r.data.match);
  const list = (await c.get('/api/matches')).data.matches;
  assert.equal(list.length, 1);
  const sent = await c.post(`/api/matches/${encodeURIComponent(r.data.match.id)}`, { text: 'Hello!' });
  assert.equal(sent.status, 201);
  const thread = await c.get(`/api/matches/${encodeURIComponent(r.data.match.id)}`);
  assert.equal(thread.data.messages[0].text, 'Hello!');
  assert.ok(!JSON.stringify(thread.data).includes('"traits"'));
  // A stranger cannot read it.
  const other = client(srv.base);
  await other.post('/api/signup', { name: 'X', email: 'x@spy.co', password: 'password1' });
  assert.equal((await other.get(`/api/matches/${encodeURIComponent(r.data.match.id)}`)).status, 404);
});

test('next week brings two new people', async () => {
  const c = client(srv.base);
  await onboard(c);
  const w1 = (await c.get('/api/week')).data.picks.map((p) => p.id);
  clock.advance(7 * 864e5);
  const w2 = (await c.get('/api/week')).data.picks.map((p) => p.id);
  clock.reset();
  assert.equal(w2.length, 2);
  assert.ok(w2.every((id) => !w1.includes(id)));
});

test('under-18s are stopped', async () => {
  const c = client(srv.base);
  await c.post('/api/signup', { name: 'Kid', email: 'kid@x.co', password: 'password1' });
  await c.get('/api/chat');
  await c.post('/api/chat', { text: 'Man' });
  await c.post('/api/chat', { text: 'Women' });
  const r = await c.post('/api/chat', { text: '16' });
  assert.match(r.data.message.text, /only for adults/);
  assert.equal((await c.post('/api/chat', { text: 'hi' })).status, 403);
});

test('deleting an account removes everything', async () => {
  const c = client(srv.base);
  await onboard(c, { email: 'gone@x.co' });
  assert.equal((await c.del('/api/me')).status, 200);
  assert.ok(!Object.values(srv.store.data.users).some((u) => u.email === 'gone@x.co'));
  assert.equal((await c.get('/api/me')).data.user, null);
});

test('bad input is handled', async () => {
  const res = await fetch(`${srv.base}/api/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
  assert.equal(res.status, 400);
  const big = await fetch(`${srv.base}/api/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(50000) }) }).catch(() => ({ status: 413 }));
  assert.equal(big.status, 413);
  assert.equal((await fetch(`${srv.base}/api/nope`)).status, 404);
  const page = await fetch(`${srv.base}/../../etc/passwd`);
  assert.ok(!(await page.text()).includes('root:'));
});

test('people cannot put contact details on their profile by editing', async () => {
  const c = client(srv.base);
  await onboard(c);
  const item = (await c.get('/api/profile')).data.shared.items[0];
  const r = await c.patch(`/api/profile/items/${item.id}`, { text: 'Message me: me@example.com' });
  assert.equal(r.status, 400);
  assert.equal((await c.put('/api/profile/bio', { text: 'Snapchat: zzz' })).status, 400);
});

test('a like is remembered: the other person sees them sooner, and both learn it is mutual', async () => {
  const s2 = await startServer({ seed: false });
  const a = client(s2.base);
  const b = client(s2.base);
  const answersA = (await import('../helpers.js')).ANSWERS;
  const meA = (await onboard(a, { name: 'Ana', answers: { ...answersA, b_gender: 'Woman', b_seeking: 'Men' } })).me;
  const meB = (await onboard(b, { name: 'Ben', answers: { ...answersA, b_gender: 'Man', b_seeking: 'Women', b_age: '32' } })).me;
  const weekA = (await a.get('/api/week')).data;
  assert.ok(weekA.picks.some((p) => p.id === meB.id));
  await a.post(`/api/week/${meB.id}`, { decision: 'like' });
  const weekB = (await b.get('/api/week')).data;
  assert.ok(weekB.picks.some((p) => p.id === meA.id));
  const res = await b.post(`/api/week/${meA.id}`, { decision: 'like' });
  assert.ok(res.data.match);
  assert.equal((await a.get('/api/me')).data.user.unread, 1, 'Ana is told about the new match');
  assert.equal((await b.get('/api/me')).data.user.unread, 0, 'Ben just made it, nothing new for him');
  assert.ok((await a.get('/api/week')).data.picks.find((p) => p.id === meB.id).matchId);
  await s2.close();
});

test('someone who passed on you, or unmatched you, is never suggested to you', async () => {
  const s3 = await startServer({ seed: false });
  const { ANSWERS } = await import('../helpers.js');
  const a = client(s3.base);
  const b = client(s3.base);
  const meA = (await onboard(a, { name: 'Ana', answers: { ...ANSWERS, b_gender: 'Woman', b_seeking: 'Men' } })).me;
  const meB = (await onboard(b, { name: 'Ben', answers: { ...ANSWERS, b_gender: 'Man', b_seeking: 'Women' } })).me;
  await a.get('/api/week');
  await a.post(`/api/week/${meB.id}`, { decision: 'pass' });
  assert.equal((await b.get('/api/week')).data.picks.length, 0, 'Ben is not shown Ana');
  assert.ok(meA);
  await s3.close();
});

test('"Not me" on a trait makes the interviewer ask about it directly', async () => {
  const c = client(srv.base);
  const { me } = await onboard(c);
  const u = srv.store.data.users[me.id];
  const before = u.hidden.traits.social.confidence;
  assert.equal((await c.post('/api/profile/traits/social/recheck')).status, 200);
  assert.ok(u.hidden.traits.social.confidence < before);
  const q = (await c.get('/api/chat')).data.messages.at(-1);
  assert.match(q.text, /which sounds more like you/);
  assert.deepEqual(q.choices, ['Recharges alone', 'Somewhere in between', 'Energised by people']);
  await c.post('/api/chat', { text: 'Recharges alone' });
  assert.ok(u.hidden.traits.social.value < 0.3);
  assert.equal((await c.post('/api/profile/traits/nope/recheck')).status, 404);
});

test('approve all suggestions at once', async () => {
  const c = client(srv.base);
  await onboard(c);
  const n = (await c.get('/api/profile')).data.shared.items.length;
  assert.equal((await c.post('/api/profile/items/approve-all')).data.approved, n);
  assert.equal((await c.get('/api/profile')).data.preview.items.length, n);
});
