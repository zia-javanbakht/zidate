// After a match: did you meet, and would you see them again? (Hinge's "We Met".)
// The answer is private. It teaches the matchmaker what works for this person in real life,
// and, counted across everyone someone met, gives matching a small push either way.
import { matchId } from './matching.js';
import { learnFromLike, MET_CAP } from './social.js';
import { signalsOf } from './signals.js';
import { now } from './clock.js';
import crypto from 'node:crypto';

// Reviews are filed under a one-way key, so the record about someone never names who met them.
const reviewer = (id) => crypto.createHash('sha256').update(`pishi-review:${id}`).digest('base64url').slice(0, 16);

export const MET = {
  again: 'We met, and I want to see them again',
  once: 'We met, but once was enough',
  talking: 'We are talking, not met yet',
  quiet: 'We did not really talk',
};

// Asked again after this long when two people were still talking at the first check-in.
export const ASK_AGAIN_DAYS = 14;

// One person's answer about one match. Returns the match, or null when it is gone.
export function recordMet(store, user, other, answer) {
  const m = store.data.matches[matchId(user.id, other.id)];
  if (!m || !MET[answer]) return null;
  const before = m.met?.[user.id]?.answer;
  m.met = { ...m.met, [user.id]: { answer, at: now().toISOString() } };
  // Kept with the matching signals, never shown to the other person.
  signalsOf(store, user.id).dates[other.id] = answer;
  if (!other.demo) {
    const r = signalsOf(store, other.id).dateReviews;
    r[reviewer(user.id)] = { ...r[reviewer(user.id)], answer };
  }
  if (answer === 'again' && before !== 'again') learnFromLike(user, other, { weight: 0.2, cap: MET_CAP });
  // Still talking: ask once more later instead of guessing.
  if (answer === 'talking' && !m.askAgainAt) m.askAgainAt = new Date(Date.parse(m.met[user.id].at) + ASK_AGAIN_DAYS * 864e5).toISOString();
  return m;
}

// Why once was enough. Some reasons are about the other person and count, privately,
// against them in matching ("did not look like their photos"); "I did not feel safe" is
// also a report to moderators.
export function recordMetReason(store, user, other, reason) {
  if (!other) return;
  if (!other.demo) {
    const r = signalsOf(store, other.id).dateReviews;
    r[reviewer(user.id)] = { ...r[reviewer(user.id)], reason };
  }
  if (reason === 'unsafe') {
    store.data.reports.push({ id: store.id('r'), by: user.id, about: other.id, reason: 'Said they did not feel safe on a date.', at: now().toISOString(), status: 'open', source: 'date' });
  }
}

// How real-life meetings with this person went, from everyone who met them. 0..1 or null.
export function dateRating(sig) {
  const reviews = Object.values(sig?.dateReviews || {}).filter((r) => r.answer === 'again' || r.answer === 'once');
  if (reviews.length < 2) return null;
  const good = reviews.filter((r) => r.answer === 'again').length;
  return good / reviews.length;
}

// People who said someone did not look like their photos.
export function photoMismatches(sig) {
  return Object.values(sig?.dateReviews || {}).filter((r) => r.reason === 'photos').length;
}
