// Photo verification: start (get a pose), send the selfie, ask a moderator, remove it;
// and the moderators' queue. The selfie is private: only moderators reviewing it can see it.
import { decodeUpload, mimeFor } from '../photos.js';
import { now } from '../clock.js';
import { verificationOf, verificationView, pickPose, decide, POSE_MINUTES, ATTEMPTS_PER_DAY } from '../verification.js';

export default function verification(ctx) {
  const { store, route, HttpError, photos, serial, notify } = ctx;
  const stamp = () => now().toISOString();
  const recent = (v) => (v.attempts = v.attempts.filter((a) => Date.parse(a) > Date.parse(stamp()) - 864e5));
  const imageOf = (id) => {
    const buf = id && photos.read(id);
    return buf ? { buf, mime: mimeFor(id) } : null;
  };
  const queue = (v, newPhotos = false) => {
    v.review = { since: stamp(), newPhotos };
  };

  async function runCheck({ pose, selfieId, photoIds }) {
    const checker = ctx.selfieChecker(); // read at call time so tests can swap it
    const selfie = imageOf(selfieId);
    const images = photoIds.map(imageOf).filter(Boolean);
    if (!checker || !selfie || !images.length) return null;
    try {
      return await checker.check({ pose, selfie, photos: images });
    } catch (err) {
      console.error('[verification] check failed, sending to a moderator:', err.message);
      return null;
    }
  }

  route('POST', '/api/verification/start', async ({ user }) => {
    const v = verificationOf(user);
    if (!(user.photos || []).length) throw new HttpError(400, 'Add a photo first, then verify it.');
    if (v.status === 'pending') throw new HttpError(400, 'A moderator is already looking at your selfie.');
    if (recent(v).length >= ATTEMPTS_PER_DAY) throw new HttpError(429, 'That is enough tries for today. Try again tomorrow.');
    v.pose = { text: pickPose(v.pose?.text), until: new Date(Date.parse(stamp()) + POSE_MINUTES * 60e3).toISOString() };
    return { body: { verification: verificationView(user) } };
  });

  route('POST', '/api/verification/selfie', async ({ user, body }) => serial(user.id, async () => {
    const v = verificationOf(user);
    const pose = v.pose && Date.parse(v.pose.until) > Date.parse(stamp()) ? v.pose.text : null;
    if (!pose) throw new HttpError(400, 'That pose has expired. Start again for a new one.');
    if (recent(v).length >= ATTEMPTS_PER_DAY) throw new HttpError(429, 'That is enough tries for today. Try again tomorrow.');
    const { buf, type, error } = decodeUpload(body.data);
    if (error) throw new HttpError(400, error);
    v.attempts.push(stamp());
    delete v.pose; // one selfie per pose
    if (v.selfieId) photos.remove(v.selfieId);
    v.selfieId = photos.save(buf, type);
    v.selfiePose = pose;
    const photoIds = (user.photos || []).map((p) => p.id);
    const result = await runCheck({ pose, selfieId: v.selfieId, photoIds });
    const out = decide(result);
    Object.assign(v, { status: out.status, reason: out.reason || '', verdict: out.verdict || '', at: stamp(), check: result });
    delete v.review;
    if (out.status === 'verified') Object.assign(v, { photoIds, by: 'claude' });
    else v.photoIds = [];
    if (out.status === 'pending') queue(v);
    return { body: { verification: verificationView(user) } };
  }), { bodyLimit: 4.5 * 1024 * 1024 });

  // After a "did not match", a person can ask for a human look at the same selfie.
  route('POST', '/api/verification/review', async ({ user }) => {
    const v = verificationOf(user);
    if (!verificationView(user).canAskModerator) throw new HttpError(400, 'Take a selfie first.');
    Object.assign(v, { status: 'pending', reason: '' });
    queue(v);
    return { body: { verification: verificationView(user) } };
  });

  route('DELETE', '/api/verification', async ({ user }) => {
    const v = verificationOf(user);
    if (v.selfieId) photos.remove(v.selfieId);
    user.verification = { status: 'none', photoIds: [], attempts: v.attempts };
    return { body: { verification: verificationView(user) } };
  });

  // A photo added after verifying is compared with the same selfie; a moderator looks when unsure.
  ctx.onPhotoAdded = (user, photoId) => {
    const v = verificationOf(user);
    if (v.status !== 'verified' || !v.selfieId) return;
    v.checkingNew = true;
    runCheck({ pose: null, selfieId: v.selfieId, photoIds: [photoId] }).then((result) => {
      delete v.checkingNew;
      if (!store.data.users[user.id] || !(user.photos || []).some((p) => p.id === photoId)) return;
      if (result?.samePerson === 'yes') v.photoIds.push(photoId);
      else if (result?.samePerson !== 'no') queue(v, true);
      store.save();
    });
  };

  // --- moderators ---
  route('GET', '/api/admin/verifications', async () => {
    const items = Object.values(store.data.users)
      .filter((u) => u.verification?.review)
      .sort((a, b) => a.verification.review.since.localeCompare(b.verification.review.since))
      .map((u) => {
        const v = u.verification;
        const img = (id) => `/api/admin/verifications/${u.id}/image/${id}`;
        return {
          id: u.id,
          name: u.name,
          since: v.review.since,
          newPhotos: v.review.newPhotos,
          pose: v.selfiePose || '',
          note: v.check?.reason || '',
          selfie: img(v.selfieId),
          photos: (u.photos || []).map((p) => ({ url: img(p.id), checked: v.photoIds.includes(p.id) })),
        };
      });
    return { body: { verifications: items } };
  }, { admin: true });

  route('GET', '/api/admin/verifications/:uid/image/:id', async ({ params, res }) => {
    const u = store.data.users[params.uid];
    const v = u?.verification;
    const ok = v?.review && (params.id === v.selfieId || (u.photos || []).some((p) => p.id === params.id));
    const buf = ok ? photos.read(params.id) : null;
    if (!buf) throw new HttpError(404, 'Not found.');
    res.writeHead(200, { 'Content-Type': mimeFor(params.id), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
    return { handled: true };
  }, { admin: true });

  route('POST', '/api/admin/verifications/:uid', async ({ params, body }) => {
    const u = store.data.users[params.uid];
    const v = u?.verification;
    if (!v?.review) throw new HttpError(404, 'Not found.');
    const { newPhotos } = v.review;
    if (body.action === 'approve') {
      Object.assign(v, { status: 'verified', photoIds: (u.photos || []).map((p) => p.id), by: 'moderator', at: stamp(), reason: '' });
      notify(u, { type: 'verification', text: newPhotos ? 'Your new photo is verified.' : 'Your photos are verified. Your profile now shows a badge.', link: '#/profile/verification' });
    } else if (body.action === 'reject') {
      if (!newPhotos) Object.assign(v, { status: 'failed', verdict: 'moderator', photoIds: [], at: stamp(), reason: 'A moderator could not match your selfie to your photos. Try again with a clear, well-lit selfie.' });
      notify(u, { type: 'verification', text: newPhotos ? 'Your new photo did not match your selfie. Verify again to keep your badge.' : 'Your selfie could not be verified. You can try again.', link: '#/profile/verification' });
    } else throw new HttpError(400, 'Choose approve or reject.');
    delete v.review;
    return { body: { ok: true } };
  }, { admin: true });
}
