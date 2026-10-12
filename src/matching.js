// Weekly suggestions: exactly two people per week, picked from hidden profiles.
import { TRAIT_KEYS } from './traits.js';
import { isReady, publicProfile } from './profile.js';
import { weekKey, nextWeekStart, now } from './clock.js';

export const PER_WEEK = 2;

function wants(seeker, other) {
  const s = seeker.basics.seeking;
  const g = other.basics.gender;
  if (s === 'everyone') return true;
  if (s === 'women') return g === 'woman';
  if (s === 'men') return g === 'man';
  return false;
}

export const DEFAULT_AGE_RANGE = 8;

function ageOk(a, b) {
  // Each person's own range must hold, plus "half your age plus seven" as a floor.
  const [x, y] = [a.basics.age, b.basics.age];
  if (!x || !y) return false;
  const gap = Math.abs(x - y);
  if (gap > (a.basics.ageRange ?? DEFAULT_AGE_RANGE) || gap > (b.basics.ageRange ?? DEFAULT_AGE_RANGE)) return false;
  return Math.min(x, y) >= Math.max(x, y) / 2 + 7;
}

function sameCity(a, b) {
  return String(a.basics.city || '').toLowerCase() === String(b.basics.city || '').toLowerCase();
}

function kidsConflict(a, b) {
  const ta = a.hidden.tags;
  const tb = b.hidden.tags;
  return (ta.includes('wants-kids') && tb.includes('no-kids')) || (ta.includes('no-kids') && tb.includes('wants-kids'));
}

function dealbreaker(a, b) {
  return a.hidden.dealbreakers.some((d) => b.hidden.tags.includes(d));
}

// Can these two be suggested to each other at all? Symmetric.
export function eligible(a, b) {
  if (a.id === b.id || a.blocked || b.blocked) return false;
  if (!wants(a, b) || !wants(b, a)) return false;
  if (!ageOk(a, b)) return false;
  if (kidsConflict(a, b)) return false;
  if (dealbreaker(a, b) || dealbreaker(b, a)) return false;
  return true;
}

// How well b fits what a is looking for, 0..1. Not symmetric: a's learned preferences apply.
export function fit(a, b) {
  let num = 0;
  let den = 0;
  for (const k of TRAIT_KEYS) {
    const ta = a.hidden.traits[k];
    const tb = b.hidden.traits[k];
    const pref = a.hidden.preference[k];
    // Target: similar to a, nudged toward what a has told us they like in others.
    const pw = pref ? Math.min(0.7, pref.confidence) : 0;
    const target = ta.value * (1 - pw) + (pref ? pref.value * pw : 0);
    const w = (0.2 + ta.confidence) * (0.2 + tb.confidence);
    num += w * (1 - Math.abs(target - tb.value));
    den += w;
  }
  let score = den ? num / den : 0.5;
  // Shared values and interests are a modest bonus.
  const overlap = (x, y) => (x.length && y.length ? x.filter((v) => y.includes(v)).length / Math.min(x.length, y.length) : 0);
  score = score * 0.8 + overlap(a.hidden.values, b.hidden.values) * 0.1 + overlap(a.shared.interests, b.shared.interests) * 0.1;
  if (sameCity(a, b)) score += 0.05;
  return Math.min(1, score);
}

// Mutual score: both people should be glad to see each other.
export function compatibility(a, b) {
  const x = fit(a, b);
  const y = fit(b, a);
  // Geometric mean punishes one-sided matches.
  return Math.sqrt(x * y);
}

// A reason shown to the person. Built only from shared information, never hidden traits.
export function reason(a, b) {
  const away = sameCity(a, b) ? '' : ` A little further away, in ${b.basics.city}.`;
  return sharedReason(a, b) + away;
}

function sharedReason(a, b) {
  const common = a.shared.interests.filter((i) => b.shared.interests.includes(i));
  if (common.length >= 2) return `You both like ${common[0]} and ${common[1]}.`;
  if (common.length === 1) return `You both like ${common[0]}.`;
  return 'Our conversations suggest you would get on.';
}

function everSuggested(store, userId) {
  const seen = new Set();
  for (const [key, week] of Object.entries(store.data.weeks)) {
    if (!key.startsWith(`${userId}:`)) continue;
    for (const p of week.picks) seen.add(p.id);
  }
  return seen;
}

// Get (or create, once per week) this person's suggestions.
export function weeklyPicks(store, user) {
  const wk = weekKey();
  const key = `${user.id}:${wk}`;
  let week = store.data.weeks[key];
  if (!week) {
    if (!isReady(user)) return { week: wk, ready: false, picks: [], next: nextWeekStart().toISOString() };
    const seen = everSuggested(store, user.id);
    const ranked = Object.values(store.data.users)
      .filter((o) => !seen.has(o.id) && isReady(o) && eligible(user, o))
      .map((o) => ({ o, s: compatibility(user, o), local: sameCity(user, o) }))
      // People nearby come first; only widen the search when the city runs out.
      .sort((p, q) => q.local - p.local || q.s - p.s || p.o.id.localeCompare(q.o.id));
    week = { createdAt: now().toISOString(), picks: ranked.slice(0, PER_WEEK).map(({ o, s }) => ({ id: o.id, score: Math.round(s * 100) / 100, decision: null })) };
    store.data.weeks[key] = week;
    store.save();
  }
  return {
    week: wk,
    ready: true,
    next: nextWeekStart().toISOString(),
    picks: week.picks
      .filter((p) => store.data.users[p.id])
      .map((p) => {
        const other = store.data.users[p.id];
        return { ...publicProfile(other), reason: reason(user, other), decision: p.decision };
      }),
  };
}

export function matchId(a, b) {
  return [a, b].sort().join('~');
}
