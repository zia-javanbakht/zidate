// Weekly suggestions: exactly two people per week, picked from hidden profiles.
import { TRAIT_KEYS, CORE_TRAITS, TOPICS } from './traits.js';
import { basicsDone } from './profile.js';
import { isReady, publicProfile, settingsOf } from './profile.js';
import { normalizeCity } from './cities.js';
import { weekKey, nextWeekStart, now } from './clock.js';
import { revealedPreferences, likeChance, responsiveness, popularity, hoursOverlap, noteShown } from './signals.js';

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
  // Limits someone set after passing on a person who was too old or too young for them.
  const within = (p, age) => (p.hidden.limits?.ageMin ?? 0) <= age && age <= (p.hidden.limits?.ageMax ?? 999);
  if (!within(a, y) || !within(b, x)) return false;
  return Math.min(x, y) >= Math.max(x, y) / 2 + 7;
}

function sameCity(a, b) {
  return normalizeCity(a.basics.city) === normalizeCity(b.basics.city);
}

// Out of the pool: paused, suspended, or stopped (e.g. under 18).
export function inactive(u) {
  return Boolean(u.blocked || u.suspended || settingsOf(u).paused);
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
  if (a.id === b.id || inactive(a) || inactive(b)) return false;
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
    // Stated preferences about partners count for more than our guess that like attracts like.
    const pw = pref ? Math.min(0.85, pref.confidence * 2.2) : 0;
    const target = ta.value * (1 - pw) + (pref ? pref.value * pw : 0);
    // A trait they told us they care about in a partner also matters more overall.
    const w = (0.2 + ta.confidence) * (0.2 + tb.confidence) * (1 + 4 * pw);
    num += w * (1 - Math.abs(target - tb.value));
    den += w;
  }
  let score = den ? num / den : 0.5;
  // Shared values and interests are a modest bonus.
  const overlap = (x, y) => (x.length && y.length ? x.filter((v) => y.includes(v)).length / Math.min(x.length, y.length) : 0);
  score = score * 0.8 + overlap(a.hidden.values, b.hidden.values) * 0.1 + overlap(a.shared.interests, b.shared.interests) * 0.1;
  if (sameCity(a, b)) score += 0.05;
  // Small nudges from the categorical parts of the hidden profile.
  const [la, lb] = [a.hidden.aspects?.loveLanguage, b.hidden.aspects?.loveLanguage];
  if (la && la === lb) score += 0.03;
  const pace = [a.hidden.aspects?.pace, b.hidden.aspects?.pace].sort().join();
  if (pace === 'fast,slow') score -= 0.05;
  if (a.hidden.limits?.prefersDetail) score += richness(b) >= 2 ? 0.04 : -0.04;
  return Math.max(0, Math.min(1, score));
}

// How much someone shares on their profile: approved lines, a bio, and shown facts.
function richness(u) {
  const facts = Object.values(u.shared.facts || {}).filter((f) => f.status === 'approved').length;
  return u.shared.items.filter((i) => i.status === 'approved').length + (u.shared.bio ? 1 : 0) + Math.floor(facts / 3);
}

// Mutual score: both people should be glad to see each other.
export function compatibility(a, b) {
  const x = fit(a, b);
  const y = fit(b, a);
  // Geometric mean punishes one-sided matches.
  return Math.sqrt(x * y);
}

// Adjustment from what people do rather than what they say (see signals.js).
// Small on purpose: behaviour refines the picks, it never overrides the conversation.
export function signalBoost(store, a, b) {
  if (!store.data.signals) return 0;
  const [sa, sb] = [store.data.signals[a.id], store.data.signals[b.id]];
  let boost = 0;
  // a has tended to like people like b (and b people like a).
  for (const [sig, x, y] of [[sa, a, b], [sb, b, a]]) {
    const rev = revealedPreferences(sig);
    let num = 0;
    let den = 0;
    for (const [k, { target, weight }] of Object.entries(rev)) {
      const t = y.hidden.traits[k];
      if (t.confidence < 0.2) continue;
      num += weight * (1 - Math.abs(target - t.value));
      den += weight;
    }
    if (den) boost += (num / den - 0.5) * 0.16;
    const chance = likeChance(sig, x, y);
    if (chance != null) boost += (chance - 0.5) * 0.08;
  }
  // People who leave their matches unanswered, or who have been reported, come later.
  const r = responsiveness(sb);
  if (r != null) boost += (r - 0.7) * 0.12;
  boost -= Math.min(0.15, (sb?.reportsAgainst || 0) * 0.05);
  // Spread attention: someone almost everyone likes does not need to be in every pair.
  boost -= (popularity(sb) - 0.5) * 0.06;
  const hours = hoursOverlap(sa, sb);
  if (hours != null) boost += (hours - 0.5) * 0.04;
  return boost;
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

// Someone who already said no, or an unmatched/reported pair, is never suggested.
function closed(store, a, b) {
  const d = store.data;
  return Boolean(d.passes[`${b.id}>${a.id}`] || d.blocks[`${a.id}>${b.id}`] || d.blocks[`${b.id}>${a.id}`]);
}

// Each person picks the day their two arrive, at midnight in their own time zone.
function schedule(user) {
  const s = settingsOf(user);
  return { day: s.matchDay, tz: s.timeZone };
}

// This person's current week. A change of day never repeats or skips a week:
// the key never goes back past the week that was current when the day changed.
export function currentWeek(user, date = now()) {
  const sch = schedule(user);
  const floor = settingsOf(user).weekFloor;
  const wk = weekKey(date, sch);
  return floor && floor > wk ? floor : wk;
}

export function nextWeek(user, date = now()) {
  const sch = schedule(user);
  const cur = currentWeek(user, date);
  let next = nextWeekStart(date, sch);
  while (weekKey(next, sch) <= cur) next = nextWeekStart(next, sch);
  return next;
}

// Get (or create, once per week) this person's suggestions.
export function weeklyPicks(store, user) {
  const wk = currentWeek(user);
  const key = `${user.id}:${wk}`;
  const nextAt = nextWeek(user).toISOString();
  // Paused people see that state instead of suggestions; anything already decided this week is kept.
  if (settingsOf(user).paused) return { week: wk, ready: isReady(user), paused: true, picks: [], next: nextAt };
  let week = store.data.weeks[key];
  if (!week) {
    if (!isReady(user)) {
      // Tell the person what is still missing, in plain words.
      const missing = basicsDone(user)
        ? CORE_TRAITS.filter((k) => user.hidden.traits[k].confidence < 0.25).slice(0, 3).map((k) => TOPICS[k])
        : ['a few basics (who you are looking for, your age and city)'];
      return { week: wk, ready: false, missing, picks: [], next: nextAt };
    }
    const seen = everSuggested(store, user.id);
    const ranked = Object.values(store.data.users)
      .filter((o) => !seen.has(o.id) && isReady(o) && eligible(user, o) && !closed(store, user, o))
      // Either person may have asked to only meet people in their own city.
      .filter((o) => sameCity(user, o) || !(user.hidden.limits?.localOnly || o.hidden.limits?.localOnly))
      // Someone who already liked this person is a likely mutual match: give them a lift.
      .map((o) => ({ o, s: compatibility(user, o) + signalBoost(store, user, o) + (store.data.likes[`${o.id}>${user.id}`] ? 0.15 : 0), local: sameCity(user, o) }))
      // People nearby come first; only widen the search when the city runs out.
      .sort((p, q) => q.local - p.local || q.s - p.s || p.o.id.localeCompare(q.o.id));
    week = { createdAt: now().toISOString(), picks: ranked.slice(0, PER_WEEK).map(({ o, s }) => ({ id: o.id, score: Math.round(s * 100) / 100, decision: null })) };
    store.data.weeks[key] = week;
    for (const p of week.picks) noteShown(store, store.data.users[p.id]);
    store.save();
  }
  return {
    week: wk,
    ready: true,
    next: nextAt,
    picks: week.picks
      .filter((p) => store.data.users[p.id])
      .map((p) => {
        const other = store.data.users[p.id];
        const matched = Boolean(store.data.matches[matchId(user.id, other.id)]);
        const showPhotos = matched || !settingsOf(other).photosAfterMatch;
        return { ...publicProfile(other, { showPhotos }), reason: reason(user, other), decision: p.decision, matchId: matched ? matchId(user.id, other.id) : null };
      }),
    // Offer to widen the search when this week came up short.
    widen: week.picks.length < PER_WEEK && (user.basics.ageRange ?? DEFAULT_AGE_RANGE) < 15,
  };
}

export function matchId(a, b) {
  return [a, b].sort().join('~');
}

// Make sure every active person has this week's picks, and tell them once.
export function runWeekly(store, notify) {
  let made = 0;
  for (const u of Object.values(store.data.users)) {
    if (u.demo || inactive(u) || !isReady(u)) continue;
    const key = `${u.id}:${currentWeek(u)}`;
    if (store.data.weeks[key]) continue;
    const res = weeklyPicks(store, u);
    if (res.picks.length) {
      made++;
      notify?.(u, { type: 'picks', text: 'Your two people for this week are here.', link: '#/week' });
    }
  }
  return made;
}
