// Photo verification: a live selfie in a pose, on the "You" page; and the moderators' queue.
import { h, api, toast, ago } from './core.js';
import { toDataUrl } from './profile.js';

// A video frame as a JPEG, at most `max` px on its long side.
function grab(video, max = 1280) {
  const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function verifyBlock(v, photoCount, reload) {
  const body = h('div', { class: 'stack' });
  const card = h('section', { class: 'card stack verify', id: 'verification' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Photo verification'), v.verified ? h('span', { class: 'verified' }, 'Verified') : null),
    body);
  const act = (fn) => async () => {
    try {
      await fn();
    } catch (ex) {
      toast(ex.message);
    }
  };
  const start = act(async () => {
    const { verification } = await api('POST', '/api/verification/start');
    camera(verification.pose);
  });
  const startBtn = (label) => h('button', { class: 'btn small accent', type: 'button', onclick: start, disabled: !photoCount }, label);
  const remove = h('button', { class: 'link small', type: 'button', onclick: act(async () => { await api('DELETE', '/api/verification'); toast('Verification removed.'); reload(); }) }, 'Remove my verification and selfie');

  if (v.status === 'verified' && v.verified) {
    body.append(h('p', {}, 'Your selfie matched your photos, so your profile shows a Verified badge.'),
      v.checkingNew ? h('p', { class: 'small muted' }, 'Checking your new photo against your selfie…') : null, remove);
  } else if (v.status === 'verified') {
    body.append(h('p', {}, v.checkingNew ? 'Checking your new photo against your selfie…' : `${v.unchecked === 1 ? 'One photo has' : `${v.unchecked} photos have`} not been checked against your selfie yet, so your badge is hidden until ${v.unchecked === 1 ? 'it is' : 'they are'}.`),
      v.checkingNew ? null : h('div', { class: 'row wrap' }, startBtn('Verify again'), remove));
  } else if (v.status === 'pending') {
    body.append(h('p', {}, 'Thanks. A moderator is comparing your selfie with your photos. I will let you know.'));
  } else {
    body.append(
      v.status === 'failed' ? h('p', { class: 'nudge small' }, v.reason) : h('p', {}, 'Show people your photos are really you. Take a quick selfie in a pose I pick, and I compare it with your photos. Verified profiles get a badge.'),
      h('p', { class: 'hint' }, 'Your selfie is never shown on your profile. Only a moderator may see it, and only if the check is unsure.'),
      h('div', { class: 'row wrap' },
        startBtn(v.status === 'failed' ? 'Try again' : 'Verify my photos'),
        v.canAskModerator ? h('button', { class: 'btn small ghost', type: 'button', onclick: act(async () => { await api('POST', '/api/verification/review'); toast('Sent to a moderator.'); reload(); }) }, 'Ask a moderator') : null),
      photoCount ? null : h('p', { class: 'small muted' }, 'Add a photo first.'));
  }

  // The pose, a live camera view and a shutter; a camera file picker where live video is not available.
  async function camera(pose) {
    let stream = null;
    const stop = () => stream?.getTracks().forEach((t) => t.stop());
    window.addEventListener('hashchange', stop, { once: true });
    const video = h('video', { autoplay: true, playsinline: true, muted: true, class: 'selfie-live', 'aria-label': 'Camera preview' });
    const preview = h('img', { class: 'selfie-shot', alt: 'Your selfie', hidden: true });
    const file = h('input', { type: 'file', accept: 'image/*', capture: 'user', hidden: true, 'aria-label': 'Take a selfie' });
    const shoot = h('button', { class: 'btn accent', type: 'button' }, 'Take selfie');
    const send = h('button', { class: 'btn accent', type: 'button', hidden: true }, 'Send');
    const retake = h('button', { class: 'btn ghost', type: 'button', hidden: true }, 'Retake');
    const cancel = h('button', { class: 'link small', type: 'button', onclick: () => { stop(); reload(); } }, 'Cancel');
    let shot = null;
    const showShot = (dataUrl) => {
      shot = dataUrl;
      preview.src = dataUrl;
      preview.hidden = false;
      video.hidden = true;
      shoot.hidden = true;
      send.hidden = false;
      retake.hidden = false;
    };
    retake.onclick = () => {
      shot = null;
      preview.hidden = true;
      send.hidden = true;
      retake.hidden = true;
      shoot.hidden = false;
      if (stream) video.hidden = false;
    };
    file.onchange = act(async () => file.files[0] && showShot(await toDataUrl(file.files[0])));
    shoot.onclick = () => (stream && video.videoWidth ? showShot(grab(video)) : file.click());
    send.onclick = act(async () => {
      send.disabled = retake.disabled = true;
      send.textContent = 'Checking…';
      try {
        const { verification } = await api('POST', '/api/verification/selfie', { data: shot });
        stop();
        toast(verification.verified ? 'Verified. Your profile now shows a badge.' : verification.status === 'pending' ? 'Sent to a moderator.' : 'That did not work. See why below.');
        reload();
      } finally {
        send.disabled = retake.disabled = false;
        send.textContent = 'Send';
      }
    });
    body.replaceChildren(
      h('p', { class: 'pose' }, h('span', { class: 'small muted' }, 'Your pose'), h('strong', {}, pose.text)),
      h('p', { class: 'small muted' }, 'Face the camera in good light, with your face and hand in the picture.'),
      video, preview, file,
      h('div', { class: 'row wrap' }, retake, shoot, send),
      cancel);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      video.srcObject = stream;
    } catch {
      video.hidden = true; // no camera access: the button opens the phone's camera instead
    }
  }
  return card;
}

// The moderators' queue: the selfie next to the profile photos, approve or reject.
export function verificationQueue() {
  const section = h('section', { class: 'card' }, h('h2', {}, 'Photo verification'), h('p', { class: 'muted' }, 'Loading…'));
  const load = async () => {
    const { verifications } = await api('GET', '/api/admin/verifications');
    const decide = (item, action) => async () => {
      try {
        await api('POST', `/api/admin/verifications/${encodeURIComponent(item.id)}`, { action });
        toast('Done.');
        load();
      } catch (ex) {
        toast(ex.message);
      }
    };
    section.replaceChildren(h('h2', {}, 'Photo verification'),
      ...(verifications.length ? verifications.map((item) => h('div', { class: 'report' },
        h('div', { class: 'section-head' },
          h('strong', {}, item.name),
          h('span', { class: 'small muted' }, `${item.newPhotos ? 'new photo' : 'selfie'} · ${ago(item.since)}`)),
        h('p', { class: 'small' }, `Pose asked: ${item.pose || 'none'}`),
        item.note ? h('p', { class: 'small muted' }, `Automatic check: ${item.note}`) : null,
        h('div', { class: 'verify-compare' },
          h('figure', {}, h('img', { src: item.selfie, alt: `Selfie of ${item.name}` }), h('figcaption', { class: 'small muted' }, 'Selfie')),
          item.photos.map((p, i) => h('figure', {}, h('img', { src: p.url, alt: `Profile photo ${i + 1} of ${item.name}` }), h('figcaption', { class: 'small muted' }, p.checked ? 'Checked' : 'Not checked')))),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn small ghost', type: 'button', onclick: decide(item, 'reject') }, 'Does not match'),
          h('button', { class: 'btn small accent', type: 'button', onclick: decide(item, 'approve') }, 'Same person'))))
        : [h('p', { class: 'muted' }, 'Nothing to check.')]));
  };
  load().catch((ex) => section.replaceChildren(h('h2', {}, 'Photo verification'), h('p', { class: 'muted' }, ex.message)));
  return section;
}
