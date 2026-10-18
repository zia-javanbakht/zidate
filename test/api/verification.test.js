import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client } from '../helpers.js';
import { decide, makeSelfieChecker, isVerified, POSES } from '../../src/verification.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const pass = { liveCapture: true, poseMatches: true, samePerson: 'yes', reason: 'Same face, pose shown.' };

async function person(s, email = `v${Math.random()}@x.co`) {
  const c = client(s.base);
  await c.post('/api/signup', { name: 'Vee', email, password: 'password123' });
  return c;
}
const view = async (c) => (await c.get('/api/profile')).data;

test('decide: pose and liveness first, then the same person; unsure goes to a moderator', () => {
  assert.equal(decide(null).status, 'pending');
  assert.equal(decide(pass).status, 'verified');
  assert.equal(decide({ ...pass, liveCapture: false }).verdict, 'live');
  assert.equal(decide({ ...pass, poseMatches: false }).verdict, 'pose');
  assert.equal(decide({ ...pass, samePerson: 'no' }).verdict, 'person');
  assert.equal(decide({ ...pass, samePerson: 'unsure' }).status, 'pending');
});

test('the Claude checker sends the pose, the selfie and the photos, and parses the answer', async () => {
  let sent;
  const fake = { beta: { messages: { create: async (req) => { sent = req; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(pass) }] }; } } } };
  const img = { buf: Buffer.from('x'), mime: 'image/png' };
  const out = await makeSelfieChecker(() => fake).check({ pose: POSES[0], selfie: img, photos: [img, img] });
  assert.equal(out.samePerson, 'yes');
  const content = sent.messages[0].content;
  assert.equal(content.filter((b) => b.type === 'image').length, 3);
  assert.match(content[0].text, new RegExp(POSES[0]));
  const bad = { beta: { messages: { create: async () => ({ content: [{ type: 'text', text: '{"samePerson":"maybe"}' }] }) } } };
  await assert.rejects(makeSelfieChecker(() => bad).check({ pose: 'x', selfie: img, photos: [img] }));
});

test('without Claude a selfie waits for a moderator, who can approve it; the badge shows on the profile', async () => {
  const s = await startServer({ seed: false });
  const a = await person(s);
  assert.equal((await a.post('/api/verification/start')).status, 400, 'needs a photo first');
  await a.post('/api/photos', { data: PNG });
  assert.equal((await a.post('/api/verification/selfie', { data: PNG })).status, 400, 'needs a pose first');
  const start = await a.post('/api/verification/start');
  assert.ok(POSES.includes(start.data.verification.pose.text));
  const sent = await a.post('/api/verification/selfie', { data: PNG });
  assert.equal(sent.data.verification.status, 'pending');
  assert.equal((await a.post('/api/verification/start')).status, 400, 'already waiting');

  const mod = await person(s, 'admin@x.co');
  assert.equal((await a.get('/api/admin/verifications')).status, 403);
  const { verifications } = (await mod.get('/api/admin/verifications')).data;
  assert.equal(verifications.length, 1);
  assert.equal((await mod.get(verifications[0].selfie)).status, 200);
  assert.equal((await mod.get(verifications[0].photos[0].url)).status, 200);
  const selfieId = verifications[0].selfie.split('/').pop();
  assert.equal((await a.get(`/api/photos/${selfieId}`)).status, 404, 'the selfie is not a profile photo');
  await mod.post(`/api/admin/verifications/${verifications[0].id}`, { action: 'approve' });
  const v = await view(a);
  assert.equal(v.verification.verified, true);
  assert.equal(v.preview.verified, true);
  assert.equal((await mod.get(verifications[0].selfie)).status, 404, 'closed reviews are not viewable');
  const notes = (await a.get('/api/notifications')).data;
  assert.ok(JSON.stringify(notes).includes('verified'));

  // A new photo is unchecked: no Claude, so the badge waits for a moderator.
  await a.post('/api/photos', { data: PNG });
  assert.equal((await view(a)).preview.verified, undefined);
  assert.equal((await mod.get('/api/admin/verifications')).data.verifications[0].newPhotos, true);
  await mod.post(`/api/admin/verifications/${verifications[0].id}`, { action: 'approve' });
  assert.equal((await view(a)).preview.verified, true);

  // Removing it takes the badge and the selfie away.
  await a.del('/api/verification');
  assert.equal((await view(a)).verification.status, 'none');
  assert.equal(s.ctx.photos.read(selfieId), null);
  await s.close();
});

test('with Claude: a match verifies straight away, a wrong pose asks for another try, a mismatch can go to a moderator', async () => {
  const s = await startServer({ seed: false });
  let answer = pass;
  const calls = [];
  s.ctx.selfieChecker = () => ({ check: async (req) => (calls.push(req), answer) });
  const a = await person(s);
  await a.post('/api/photos', { data: PNG });
  await a.post('/api/verification/start');
  const ok = (await a.post('/api/verification/selfie', { data: PNG })).data.verification;
  assert.equal(ok.verified, true);
  assert.equal(calls[0].photos.length, 1);

  // A new photo is compared with the stored selfie in the background.
  await a.post('/api/photos', { data: PNG });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].pose, null);
  assert.equal((await view(a)).verification.verified, true);

  const b = await person(s);
  await b.post('/api/photos', { data: PNG });
  answer = { ...pass, poseMatches: false };
  await b.post('/api/verification/start');
  const wrongPose = (await b.post('/api/verification/selfie', { data: PNG })).data.verification;
  assert.equal(wrongPose.status, 'failed');
  assert.equal(wrongPose.canAskModerator, false);
  assert.equal((await b.post('/api/verification/selfie', { data: PNG })).status, 400, 'one selfie per pose');

  answer = { ...pass, samePerson: 'no' };
  await b.post('/api/verification/start');
  const mismatch = (await b.post('/api/verification/selfie', { data: PNG })).data.verification;
  assert.equal(mismatch.canAskModerator, true);
  assert.equal((await b.post('/api/verification/review')).data.verification.status, 'pending');
  const mod = await person(s, 'admin@x.co');
  const item = (await mod.get('/api/admin/verifications')).data.verifications[0];
  await mod.post(`/api/admin/verifications/${item.id}`, { action: 'reject' });
  const after = (await view(b)).verification;
  assert.equal(after.status, 'failed');
  assert.equal(after.canAskModerator, false, 'no asking twice');

  // A broken check falls back to a moderator rather than failing the person.
  s.ctx.selfieChecker = () => ({ check: async () => { throw new Error('down'); } });
  await b.post('/api/verification/start');
  assert.equal((await b.post('/api/verification/selfie', { data: PNG })).data.verification.status, 'pending');
  await s.close();
});

test('tries are limited per day, and the badge needs every photo checked', async () => {
  const s = await startServer({ seed: false });
  s.ctx.selfieChecker = () => ({ check: async () => ({ ...pass, poseMatches: false }) });
  const a = await person(s);
  await a.post('/api/photos', { data: PNG });
  for (let i = 0; i < 5; i++) {
    await a.post('/api/verification/start');
    await a.post('/api/verification/selfie', { data: PNG });
  }
  assert.equal((await a.post('/api/verification/start')).status, 429);
  assert.equal(isVerified({ photos: [{ id: 'p1' }, { id: 'p2' }], verification: { status: 'verified', photoIds: ['p1'] } }), false);
  assert.equal(isVerified({ photos: [{ id: 'p1' }], verification: { status: 'verified', photoIds: ['p1', 'p0'] } }), true);
  assert.equal(isVerified({ photos: [], verification: { status: 'verified', photoIds: ['p1'] } }), false);
  await s.close();
});
