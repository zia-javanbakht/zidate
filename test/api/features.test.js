import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client, onboard, linkToken, ANSWERS } from '../helpers.js';
import * as clock from '../../src/clock.js';
import { tick } from '../../src/scheduler.js';

// A tiny valid PNG (1x1).
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

let srv;
test.before(async () => { srv = await startServer(); });
test.after(async () => { await srv.close(); clock.reset(); });

async function pair() {
  const s = await startServer({ seed: false });
  const a = client(s.base);
  const b = client(s.base);
  const A = (await onboard(a, { name: 'Ana', email: `ana${Math.random()}@x.co`, answers: { ...ANSWERS, b_gender: 'Woman', b_seeking: 'Men' } })).me;
  const B = (await onboard(b, { name: 'Ben', email: `ben${Math.random()}@x.co`, answers: { ...ANSWERS, b_gender: 'Man', b_seeking: 'Women' } })).me;
  await a.get('/api/week');
  await b.get('/api/week');
  await a.post(`/api/week/${B.id}`, { decision: 'like' });
  const { match } = (await b.post(`/api/week/${A.id}`, { decision: 'like' })).data;
  return { s, a, b, A, B, match };
}

test('email verification by link', async () => {
  const c = client(srv.base);
  await c.post('/api/signup', { name: 'V', email: 'v@x.co', password: 'password1' });
  assert.equal((await c.get('/api/me')).data.user.emailVerified, false);
  const token = linkToken(srv.mailer, 'v@x.co', 'verify');
  assert.ok(token);
  assert.equal((await c.post('/api/verify', { token: 'nope' })).status, 400);
  assert.equal((await c.post('/api/verify', { token })).status, 200);
  assert.equal((await c.get('/api/me')).data.user.emailVerified, true);
  assert.equal((await c.post('/api/verify', { token })).status, 400, 'links work once');
});

test('change password signs out other sessions', async () => {
  const a = client(srv.base);
  const b = client(srv.base);
  await a.post('/api/signup', { name: 'P', email: 'p@x.co', password: 'password1' });
  await b.post('/api/login', { email: 'p@x.co', password: 'password1' });
  assert.equal((await a.post('/api/password/change', { current: 'wrong', password: 'newpassword' })).status, 400);
  assert.equal((await a.post('/api/password/change', { current: 'password1', password: 'newpassword' })).status, 200);
  assert.equal((await b.get('/api/me')).data.user, null, 'the other device is signed out');
  assert.equal((await a.get('/api/me')).data.user.name, 'P', 'this device stays in');
  assert.equal((await client(srv.base).post('/api/login', { email: 'p@x.co', password: 'newpassword' })).status, 200);
});

test('forgot password: same answer for unknown emails, working one-hour link for real ones', async () => {
  const c = client(srv.base);
  await c.post('/api/signup', { name: 'F', email: 'f@x.co', password: 'password1' });
  const sentBefore = srv.mailer.sent.length;
  assert.equal((await c.post('/api/password/forgot', { email: 'nobody@x.co' })).status, 200);
  assert.equal(srv.mailer.sent.length, sentBefore, 'no email for unknown accounts');
  await c.post('/api/password/forgot', { email: 'F@x.co' });
  const token = linkToken(srv.mailer, 'f@x.co', 'reset');
  const fresh = client(srv.base);
  assert.equal((await fresh.post('/api/password/reset', { token, password: 'short' })).status, 400);
  assert.equal((await fresh.post('/api/password/reset', { token, password: 'brand-new-pass' })).status, 200);
  assert.equal((await fresh.get('/api/me')).data.user.name, 'F');
  assert.equal((await c.get('/api/me')).data.user, null, 'old sessions end');
});

test('repeated wrong passwords lock that account for a while', async () => {
  const c = client(srv.base);
  await c.post('/api/signup', { name: 'L', email: 'lock@x.co', password: 'password1' });
  const codes = [];
  for (let i = 0; i < 10; i++) codes.push((await client(srv.base).post('/api/login', { email: 'lock@x.co', password: 'guess' + i })).status);
  assert.equal(codes.filter((x) => x === 401).length, 8);
  assert.equal(codes.at(-1), 429);
  assert.equal((await client(srv.base).post('/api/login', { email: 'lock@x.co', password: 'password1' })).status, 429, 'even the right one waits');
});

test('settings: edit basics with validation, pause hides you', async () => {
  const c = client(srv.base);
  const { me } = await onboard(c);
  assert.equal((await c.put('/api/settings', { basics: { age: 12 } })).status, 400);
  assert.equal((await c.put('/api/settings', { basics: { seeking: 'aliens' } })).status, 400);
  const r = await c.put('/api/settings', { basics: { city: 'nyc', ageRange: 10, name: 'Zia J' } });
  assert.equal(r.data.user.basics.city, 'New York');
  assert.equal(r.data.user.name, 'Zia J');
  await c.put('/api/settings', { paused: true });
  const w = (await c.get('/api/week')).data;
  assert.equal(w.paused, true);
  const someone = client(srv.base);
  const S = (await onboard(someone, { answers: { ...ANSWERS, b_gender: 'Man', b_seeking: 'Women', b_city: 'New York' } })).me;
  const sw = (await someone.get('/api/week')).data;
  assert.ok(!sw.picks.some((p) => p.id === me.id), 'paused people are not suggested');
  assert.ok(S);
});

test('export gives you all your data as a download', async () => {
  const c = client(srv.base);
  await onboard(c, { email: 'exp@x.co' });
  const res = await fetch(`${srv.base}/api/me/export`, { headers: { cookie: (await loginCookie('exp@x.co')) } });
  assert.match(res.headers.get('content-disposition'), /attachment/);
  const data = await res.json();
  assert.equal(data.account.email, 'exp@x.co');
  assert.ok(data.hiddenProfile.traits.length === 13);
  assert.ok(data.conversationWithMatchmaker.length > 5);
});

async function loginCookie(email) {
  const res = await fetch(`${srv.base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'password123' }) });
  return res.headers.get('set-cookie').split(';')[0];
}

test('photos: validated by content, private until a match by default', async () => {
  const { s, a, b, A, B } = await pair();
  assert.equal((await a.post('/api/photos', { data: 'data:image/png;base64,aGVsbG8gd29ybGQgdGhpcyBpcyBub3QgYW4gaW1hZ2U=' })).status, 400);
  const up = await a.post('/api/photos', { data: PNG });
  assert.equal(up.status, 201);
  const url = up.data.photo.url;
  assert.equal((await a.get(url)).status, 200);
  // Ben matched with Ana, so he can see it; a stranger cannot.
  assert.equal((await b.get(url)).status, 200);
  const stranger = client(s.base);
  await stranger.post('/api/signup', { name: 'X', email: 'x@x.co', password: 'password1' });
  assert.equal((await stranger.get(url)).status, 404);
  for (let i = 0; i < 3; i++) await a.post('/api/photos', { data: PNG });
  assert.equal((await a.post('/api/photos', { data: PNG })).status, 400, 'four is the limit');
  const prof = (await a.get('/api/profile')).data;
  await a.post(`/api/photos/${prof.photos[2].id}/main`);
  assert.equal((await a.get('/api/profile')).data.photos[0].id, prof.photos[2].id);
  assert.equal((await a.del(`/api/photos/${prof.photos[0].id}`)).status, 200);
  assert.ok(A && B);
  await s.close();
});

test('suggested people show photos only when the owner allows it before a match', async () => {
  const s = await startServer({ seed: false });
  const a = client(s.base);
  const b = client(s.base);
  await onboard(a, { name: 'Ana', answers: { ...ANSWERS, b_gender: 'Woman', b_seeking: 'Men' } });
  await a.post('/api/photos', { data: PNG });
  await onboard(b, { name: 'Ben', answers: { ...ANSWERS, b_gender: 'Man', b_seeking: 'Women' } });
  let pick = (await b.get('/api/week')).data.picks[0];
  assert.equal(pick.photos.length, 0);
  assert.equal(pick.photosHidden, true);
  await a.put('/api/settings', { photosAfterMatch: false });
  pick = (await b.get('/api/week')).data.picks[0];
  assert.equal(pick.photos.length, 1);
  assert.equal((await b.get(pick.photos[0])).status, 200);
  await s.close();
});

test('your own lines, interests and dealbreakers', async () => {
  const c = client(srv.base);
  await onboard(c);
  assert.equal((await c.post('/api/profile/items', { prompt: 'Made up prompt', text: 'x' })).status, 400);
  assert.equal((await c.post('/api/profile/items', { prompt: 'The way to win me over', text: 'Call 07700 900123' })).status, 400);
  const r = await c.post('/api/profile/items', { prompt: 'The way to win me over', text: 'Good coffee and better questions.' });
  assert.equal(r.status, 201);
  assert.ok((await c.get('/api/profile')).data.preview.items.some((i) => i.text === 'Good coffee and better questions.'));
  assert.equal((await c.post('/api/profile/interests', { name: 'underwater basket weaving' })).status, 400);
  assert.ok((await c.post('/api/profile/interests', { name: 'climbing' })).data.interests.includes('climbing'));
  assert.ok((await c.post('/api/profile/dealbreakers', { tag: 'smoker' })).data.dealbreakers.includes('smoker'));
  assert.ok(!(await c.del('/api/profile/dealbreakers/smoker')).data.dealbreakers.includes('smoker'));
});

test('live messages, notifications, read receipts and icebreakers', async () => {
  const { s, a, b, match } = await pair();
  const mid = encodeURIComponent(match.id);
  const first = (await a.get(`/api/matches/${mid}`)).data;
  assert.ok(first.icebreakers.length >= 1, 'something to say first');
  // Ana is told about the match by notification (Ben completed it).
  const notes = (await a.get('/api/notifications')).data.notifications;
  assert.ok(notes.some((n) => n.type === 'match'));
  // Ana has the app open: she gets Ben's message live.
  const anaStream = await openStream(s, a);
  await b.post(`/api/matches/${mid}`, { text: 'Hi Ana!' });
  const ev = await anaStream.next('message');
  assert.equal(ev.message.text, 'Hi Ana!');
  anaStream.close();
  // Ana reads it; Ben sees "Seen".
  await a.get(`/api/matches/${mid}`);
  const bt = (await b.get(`/api/matches/${mid}`)).data;
  assert.ok(bt.seenByThem >= bt.messages.at(-1).at);
  await s.close();
});

test('messages while offline become one notification and one email', async () => {
  const { s, a, b, A, match } = await pair();
  const mid = encodeURIComponent(match.id);
  const before = s.mailer.sent.filter((m) => m.to === A.email).length;
  await b.post(`/api/matches/${mid}`, { text: 'One' });
  await b.post(`/api/matches/${mid}`, { text: 'Two' });
  const notes = (await a.get('/api/notifications')).data.notifications.filter((n) => n.type === 'message');
  assert.equal(notes.length, 1);
  assert.equal(s.mailer.sent.filter((m) => m.to === A.email).length, before + 1);
  await a.put('/api/settings', { email: { message: false } });
  await a.get(`/api/matches/${mid}`);
  await b.post(`/api/matches/${mid}`, { text: 'Three' });
  assert.equal(s.mailer.sent.filter((m) => m.to === A.email).length, before + 1, 'email turned off');
  await s.close();
});

// Read a server-sent event stream with the client's cookie.
async function openStream(s, c) {
  const me = (await c.get('/api/me')).data.user;
  const token = Object.entries(s.store.data.sessions).filter(([, v]) => v.userId === me.id).at(-1)[0];
  const ctrl = new AbortController();
  const res = await fetch(`${s.base}/api/events`, { headers: { cookie: `sid=${token}` }, signal: ctrl.signal });
  const reader = res.body.getReader();
  let buf = '';
  return {
    async next(type) {
      for (;;) {
        const m = buf.match(new RegExp(`event: ${type}\\ndata: (.*)\\n\\n`));
        if (m) { buf = buf.slice(m.index + m[0].length); return JSON.parse(m[1]); }
        const { value, done } = await reader.read();
        if (done) throw new Error('stream ended');
        buf += new TextDecoder().decode(value);
      }
    },
    close: () => ctrl.abort(),
  };
}

test('abusive messages are blocked, and repeat offenders are reported automatically', async () => {
  const { s, a, match } = await pair();
  const mid = encodeURIComponent(match.id);
  for (let i = 0; i < 3; i++) assert.equal((await a.post(`/api/matches/${mid}`, { text: 'kys' })).status, 422);
  assert.equal((await a.post(`/api/matches/${mid}`, { text: 'Sorry, that was not me. Coffee?' })).status, 201);
  assert.ok(s.store.data.reports.some((r) => r.source === 'filter'));
  await s.close();
});

test('moderators review reports with context and can suspend', async () => {
  const { s, a, b, B, match } = await pair();
  const mid = encodeURIComponent(match.id);
  await b.post(`/api/matches/${mid}`, { text: 'You are rude' });
  await a.post(`/api/matches/${mid}/unmatch`, { report: true, reason: 'Rude' });
  const mod = client(s.base);
  await mod.post('/api/signup', { name: 'Mod', email: 'admin@x.co', password: 'password1' });
  assert.equal((await b.get('/api/admin/reports')).status, 403);
  const reports = (await mod.get('/api/admin/reports')).data.reports;
  const r = reports.find((x) => x.about.id === B.id);
  assert.equal(r.context.at(-1).text, 'You are rude');
  assert.equal((await mod.post(`/api/admin/reports/${r.id}`, { action: 'suspend' })).status, 200);
  assert.equal((await b.get('/api/me')).data.user, null, 'suspended people are signed out');
  assert.equal((await client(s.base).post('/api/login', { email: B.email, password: 'password123' })).status, 403);
  const stats = (await mod.get('/api/admin/stats')).data;
  assert.equal(stats.suspended, 1);
  assert.equal(stats.openReports, 0);
  await s.close();
});

test('report someone straight from a suggestion', async () => {
  const c = client(srv.base);
  await onboard(c);
  const p = (await c.get('/api/week')).data.picks[0];
  assert.equal((await c.post(`/api/week/${p.id}/report`, { reason: 'Fake' })).status, 200);
  // Gone from the week straight away, and they cannot be liked any more.
  assert.equal((await c.get('/api/week')).data.picks.find((x) => x.id === p.id), undefined);
  assert.equal((await c.post(`/api/week/${p.id}`, { decision: 'like' })).status, 404);
});

test('someone suspended mid-week drops out of the picks', async () => {
  const c = client(srv.base);
  await onboard(c);
  const p = (await c.get('/api/week')).data.picks[0];
  srv.store.data.users[p.id].suspended = true;
  assert.equal((await c.get('/api/week')).data.picks.find((x) => x.id === p.id), undefined);
  assert.equal((await c.post(`/api/week/${p.id}`, { decision: 'like' })).status, 404);
  delete srv.store.data.users[p.id].suspended;
});

test('an empty week offers to widen the age range', async () => {
  const s = await startServer({ seed: false });
  const a = client(s.base);
  await onboard(a, { name: 'Ana', answers: { ...ANSWERS, b_gender: 'Woman', b_seeking: 'Men', b_age: '30' } });
  const b = client(s.base);
  await onboard(b, { name: 'Ben', answers: { ...ANSWERS, b_gender: 'Man', b_seeking: 'Women', b_age: '41' } });
  const w = (await a.get('/api/week')).data;
  assert.equal(w.picks.length, 0);
  assert.equal(w.widen, true);
  s.store.data.users[Object.keys(s.store.data.users).find((id) => s.store.data.users[id].name === 'Ben')].basics.ageRange = 15;
  const r = (await a.post('/api/week/widen')).data;
  assert.equal(r.ageRange, 10);
  const r2 = (await a.post('/api/week/widen')).data;
  assert.equal(r2.ageRange, 15);
  assert.equal(r2.picks.length, 1);
  await s.close();
});

test('the weekly job prepares picks, notifies once, and checks in a week after a match', async () => {
  const { s, A, B } = await pair();
  clock.advance(8 * 864e5);
  const res = tick(s.store, s.ctx);
  assert.ok(res.checkins >= 2);
  assert.ok(s.store.data.notifications[A.id].some((n) => n.type === 'checkin'));
  const again = tick(s.store, s.ctx);
  assert.equal(again.checkins, 0);
  const picksNotes = s.store.data.notifications[B.id].filter((n) => n.type === 'picks').length;
  tick(s.store, s.ctx);
  assert.equal(s.store.data.notifications[B.id].filter((n) => n.type === 'picks').length, picksNotes);
  clock.reset();
  await s.close();
});

test('notifications can be marked read', async () => {
  const { s, a } = await pair();
  assert.ok((await a.get('/api/me')).data.user.notifications >= 1);
  await a.post('/api/notifications/read', {});
  assert.equal((await a.get('/api/me')).data.user.notifications, 0);
  await s.close();
});

test('each person picks the day their two arrive', async () => {
  const fresh = client(srv.base);
  await fresh.post('/api/signup', { name: 'Day', email: `day${Math.random()}@x.co`, password: 'password1', timeZone: 'Europe/London' });
  let s = (await fresh.get('/api/me')).data.user.settings;
  assert.equal(s.matchDay, 1);
  assert.equal(s.timeZone, 'Europe/London');
  const c = client(srv.base);
  await onboard(c);
  const before = (await c.get('/api/week')).data;
  assert.equal((await c.put('/api/settings', { matchDay: 7 })).status, 400);
  assert.equal((await c.put('/api/settings', { timeZone: 'Mars/Olympus' })).status, 400);
  const day = (new Date().getUTCDay() + 3) % 7;
  s = (await c.put('/api/settings', { matchDay: day, timeZone: 'Asia/Tokyo' })).data.user.settings;
  assert.equal(s.matchDay, day);
  assert.equal(s.timeZone, 'Asia/Tokyo');
  // The current pair stays; the next one comes on the new day.
  const after = (await c.get('/api/week')).data;
  assert.deepEqual(after.picks.map((p) => p.id), before.picks.map((p) => p.id));
  const next = new Date(after.next);
  assert.equal(new Date(next.getTime() + 9 * 3600e3).getUTCDay(), day);
  assert.equal(new Date(next.getTime() + 9 * 3600e3).getUTCHours(), 0);
});

test('facts: set, validate, hide and show on the shared profile', async () => {
  const c = client(srv.base);
  const { me } = await onboard(c, { email: 'facts@x.co' });
  assert.equal((await c.put('/api/profile/facts', { facts: { star: 'Leo' } })).status, 400);
  assert.equal((await c.put('/api/profile/facts', { facts: { kids: 'Maybe one day' } })).status, 400);
  assert.equal((await c.put('/api/profile/facts', { facts: { work: 'DM me @nurse_jo' } })).status, 400);
  const r = await c.put('/api/profile/facts', { facts: { work: 'Nurse', languages: 'English, Farsi', kids: 'wants kids' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.facts.kids.value, 'Wants kids');
  let preview = (await c.get('/api/profile')).data.preview;
  assert.deepEqual(preview.facts.map((f) => f.key), ['work', 'languages', 'kids']);
  await c.patch('/api/profile/facts/work', { status: 'hidden' });
  await c.put('/api/profile/facts', { facts: { languages: '' } });
  preview = (await c.get('/api/profile')).data.preview;
  assert.deepEqual(preview.facts.map((f) => f.key), ['kids']);
  assert.ok(srv.store.data.users[me.id].shared.facts.work, 'hidden facts are kept');
});

test('limits learned from passes can be lifted from the hidden profile', async () => {
  const c = client(srv.base);
  const { me } = await onboard(c, { email: 'limits@x.co' });
  Object.assign(srv.store.data.users[me.id].hidden.limits, { localOnly: true, ageMax: 39 });
  let hidden = (await c.get('/api/profile')).data.hidden;
  assert.deepEqual(hidden.limits.map((l) => l.key), ['localOnly', 'age']);
  assert.equal((await c.del('/api/profile/limits/nope')).status, 404);
  await c.del('/api/profile/limits/age');
  hidden = (await c.get('/api/profile')).data.hidden;
  assert.deepEqual(hidden.limits.map((l) => l.key), ['localOnly']);
});

test('matching signals stay on the server: never in app responses, only in the export', async () => {
  const c = client(srv.base);
  const { me } = await onboard(c, { email: `sig${Math.random()}@x.co` });
  const sig = srv.store.data.signals[me.id];
  assert.ok(sig && sig.chat.answers > 0, 'answers were recorded');
  sig.observations.push({ text: 'MARKER-only-for-matching', at: new Date().toISOString() });
  for (const url of ['/api/me', '/api/profile', '/api/chat', '/api/week', '/api/matches']) {
    const r = await c.get(url);
    assert.ok(!JSON.stringify(r.data).includes('MARKER-only-for-matching'), `${url} leaks signals`);
    assert.ok(!JSON.stringify(r.data).includes('activeHours'), `${url} leaks signals`);
  }
  const res = await c.get('/api/me/export');
  assert.deepEqual(res.data.matchingSignals.summary.observations, ['MARKER-only-for-matching']);
  assert.ok(res.data.matchingSignals.raw.decisions, 'the raw record is included too');
  await c.del('/api/me');
  assert.equal(srv.store.data.signals[me.id], undefined, 'deleted with the account');
});

test('the profile guide comes with the profile, and "no dealbreakers" ticks that step', async () => {
  const c = client(srv.base);
  await onboard(c, { email: `guide${Math.random()}@x.co`, answers: { ...ANSWERS, q_dealbreakers: 'Skip' } });
  let { guide } = (await c.get('/api/profile')).data;
  assert.ok(guide.shared.steps.length && guide.hidden.steps.length);
  assert.equal(guide.next.id, 'photo');
  const step = (g) => g.hidden.steps.find((s) => s.id === 'dealbreakers');
  if (!step(guide).done) {
    guide = (await c.post('/api/profile/dealbreakers/none')).data.guide;
    assert.equal(step(guide).done, true);
  }
});

test('per-person requests that wait on the matchmaker run one at a time', async () => {
  const order = [];
  const slow = (name, ms) => srv.ctx.serial('u_lock', async () => {
    order.push(`${name}:start`);
    await new Promise((r) => setTimeout(r, ms));
    order.push(`${name}:end`);
  });
  await Promise.all([slow('answer', 30), slow('pass', 1)]);
  assert.deepEqual(order, ['answer:start', 'answer:end', 'pass:start', 'pass:end']);
  // A failure does not jam the queue.
  await assert.rejects(srv.ctx.serial('u_lock', async () => { throw new Error('boom'); }));
  assert.equal(await srv.ctx.serial('u_lock', async () => 'ok'), 'ok');
});

test('plain reads do not rewrite the store', async () => {
  const c = client(srv.base);
  await onboard(c);
  let saves = 0;
  const orig = srv.store.save.bind(srv.store);
  srv.store.save = () => { saves++; orig(); };
  await c.get('/api/profile');
  await c.get('/api/notifications');
  await c.get('/api/matches');
  assert.equal(saves, 0);
  await c.get('/api/week');
  assert.ok(saves > 0, 'a read that creates the week still saves');
  srv.store.save = orig;
});
