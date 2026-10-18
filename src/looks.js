// Looks: which styles someone tends to go for, learned from the photos of people they
// like and pass on. Part of Pishi Plus, because describing photos needs an AI model.
//
// Each photo is described once, by Claude vision, in the fixed style words below
// (store.data.photoLooks). The words were chosen so nothing sensitive can be recorded:
// no ethnicity or skin colour, body shape or size, attractiveness, age, health or religion.
// What a person goes for is kept with their matching signals (signals.js), so it is
// never shown in the app either, and it only nudges the ranking a little.
import { signalsOf } from './signals.js';
import { mimeFor } from './photos.js';
import { now } from './clock.js';

export const LOOKS = {
  hair: ['short-hair', 'medium-hair', 'long-hair', 'curly-hair', 'shaved-head', 'dyed-hair'],
  face: ['beard', 'stubble', 'clean-shaven', 'glasses'],
  style: ['casual-style', 'smart-style', 'sporty-style', 'alternative-style', 'bohemian-style', 'minimal-style', 'colourful-clothes'],
  details: ['visible-tattoos', 'piercings', 'hat'],
  expression: ['big-smile', 'soft-smile', 'serious-look', 'playful'],
  setting: ['outdoors', 'nature', 'city', 'at-home', 'travel', 'at-event', 'with-pet', 'doing-sport', 'making-music', 'with-food'],
  photo: ['selfie', 'candid', 'posed-portrait'],
};
export const LOOK_TAGS = Object.values(LOOKS).flat();
const ABOUT_THE_SCENE = new Set([...LOOKS.setting, ...LOOKS.photo]);

// Looks only count once there is enough behaviour to go on.
export const MIN_LOOK_DECISIONS = 4;
const MAX_BOOST = 0.06;

// Pishi Plus. There is no billing yet: moderators set it, or PISHI_PLUS_ALL=1 gives it to everyone.
export function isPlus(user) {
  return Boolean(user) && (user.plan === 'plus' || process.env.PISHI_PLUS_ALL === '1');
}

// Only allowed words, each once. People are described only when one person is clearly in
// the photo; otherwise the photo still says something about the scene.
export function cleanLooks(raw) {
  const people = Number(raw?.people) || 0;
  const tags = [...new Set((raw?.tags || []).filter((t) => LOOK_TAGS.includes(t)))];
  return people === 1 ? tags : tags.filter((t) => ABOUT_THE_SCENE.has(t));
}

// Every word in this person's described photos.
export function looksOf(store, user) {
  const all = new Set();
  for (const p of user.photos || []) for (const t of store.data.photoLooks?.[p.id]?.tags || []) all.add(t);
  return [...all];
}

export function noteLooks(store, user, tags, liked) {
  const l = signalsOf(store, user.id).looks;
  if (!tags.length) return;
  l[liked ? 'nLiked' : 'nPassed'] += 1;
  const side = l[liked ? 'liked' : 'passed'];
  for (const t of tags) side[t] = (side[t] || 0) + 1;
}

// Per word, how much more often it shows up in people they liked than in people they
// passed on, from -1 to 1. Smoothed, so one decision never means much.
export function lookLeanings(sig) {
  const l = sig?.looks;
  if (!l || l.nLiked + l.nPassed < MIN_LOOK_DECISIONS || !l.nLiked) return {};
  const out = {};
  for (const t of new Set([...Object.keys(l.liked), ...Object.keys(l.passed)])) {
    const lean = ((l.liked[t] || 0) + 0.5) / (l.nLiked + 1) - ((l.passed[t] || 0) + 0.5) / (l.nPassed + 1);
    if (Math.abs(lean) >= 0.1) out[t] = Math.round(lean * 100) / 100;
  }
  return out;
}

// How well b's photos fit what a goes for. Zero unless a has Plus and enough history.
export function lookBoost(store, a, b) {
  if (!isPlus(a)) return 0;
  const sig = store.data.signals?.[a.id];
  const lean = lookLeanings(sig);
  const tags = looksOf(store, b).filter((t) => t in lean);
  if (!tags.length) return 0;
  const avg = tags.reduce((s, t) => s + lean[t], 0) / tags.length;
  const sure = Math.min(1, (sig.looks.nLiked + sig.looks.nPassed) / 10);
  return Math.max(-MAX_BOOST, Math.min(MAX_BOOST, avg * 0.15 * sure));
}

// The background side: describing photos (one Claude call each, cached) and learning from
// decisions. Nothing waits on it; a failed call just means that photo is not described.
export function createLooks({ store, photos, vision }) {
  const running = new Set();
  const inflight = new Map();
  store.data.photoLooks ||= {};

  const track = (p) => {
    running.add(p);
    p.finally(() => running.delete(p));
    return p;
  };

  function describe(photoId, ownerId) {
    if (!vision) return Promise.resolve(null);
    if (store.data.photoLooks[photoId]) return Promise.resolve(store.data.photoLooks[photoId]);
    if (inflight.has(photoId)) return inflight.get(photoId);
    const job = (async () => {
      const buf = photos.read(photoId);
      if (!buf) return null;
      try {
        const tags = cleanLooks(await vision.describe({ buf, mime: mimeFor(photoId) }));
        // The photo may have been removed while Claude was looking at it.
        const owner = store.data.users[ownerId];
        if (!owner?.photos?.some((p) => p.id === photoId)) return null;
        store.data.photoLooks[photoId] = { owner: ownerId, tags, at: now().toISOString() };
        store.save();
        return store.data.photoLooks[photoId];
      } catch (err) {
        console.error(`Could not describe a photo: ${err.message}`);
        return null;
      }
    })();
    inflight.set(photoId, job);
    job.finally(() => inflight.delete(photoId));
    return track(job);
  }

  return {
    enabled: Boolean(vision),
    describe,
    // A Plus member liked or passed on someone whose photos they could see.
    learn(user, other, liked) {
      if (!vision || !isPlus(user) || !(other.photos || []).length) return Promise.resolve();
      return track((async () => {
        await Promise.all(other.photos.map((p) => describe(p.id, other.id)));
        if (!store.data.users[user.id]) return;
        noteLooks(store, user, looksOf(store, other), liked);
        store.save();
      })());
    },
    forgetPhoto(photoId) {
      delete store.data.photoLooks[photoId];
    },
    // For tests and shutdown: wait for everything started so far.
    idle: () => Promise.all([...running]),
  };
}
