// Matching signals: a record per person that the app keeps for matchmaking only.
// It is learned from behaviour (how someone answers, who they like and pass on, how
// conversations go) and from the matchmaker's private observations. It is never shown
// in the app, to the person or to anyone else, and never sent to the client except in
// the person's own data export, which the law requires.
//
// Kept apart from the user record (store.data.signals) so no profile or "me" view can
// leak it by accident. Nothing here may record health, ethnicity, sexuality beyond what
// the person chose in the basics, finances, or judgements of how attractive anyone is.
// The looks part (Pishi Plus, see looks.js) only counts fixed style words.
import { TRAIT_KEYS } from './traits.js';
import { normalizeCity } from './cities.js';
import { cleanText } from './profile.js';
import { now } from './clock.js';
import { lookLeanings } from './looks.js';

const MAX_OBSERVATIONS = 30;
// Revealed preferences only count once there is enough behaviour to go on.
export const MIN_DECISIONS = 4;

function blank() {
  return {
    activeHours: Array(24).fill(0),
    chat: { answers: 0, words: 0, skips: 0, quickReplies: 0, latencySec: 0, timed: 0 },
    decisions: {
      likes: 0, passes: 0, decideSec: 0, timed: 0,
      // Liked/passed counts by what the other person showed.
      photos: { with: [0, 0], without: [0, 0] },
      detail: { rich: [0, 0], sparse: [0, 0] },
      distance: { local: [0, 0], away: [0, 0] },
      ageGap: { closer: [0, 0], wider: [0, 0] },
    },
    // Per trait: running mean of the trait in people they liked and in people they passed on.
    revealed: {},
    // How other people react when this person is suggested to them.
    received: { shown: 0, liked: 0 },
    matches: { started: 0, replied: 0, firstMessages: 0, ghosted: 0, replyMin: 0, timed: 0 },
    observations: [],
    // Style words in the photos of people they liked and passed on (looks.js, Plus only).
    looks: { nLiked: 0, nPassed: 0, liked: {}, passed: {} },
  };
}

export function signalsOf(store, userId) {
  store.data.signals ||= {};
  const s = (store.data.signals[userId] ||= blank());
  // Fill in parts added in later versions.
  for (const [k, v] of Object.entries(blank())) s[k] ??= v;
  return s;
}

export function forget(store, userId) {
  delete store.data.signals?.[userId];
}

const mean = (sum, n) => (n ? sum / n : null);

export function noteActive(store, user, date = now()) {
  if (!user || user.demo) return;
  const s = signalsOf(store, user.id);
  // At most once per hour, so a busy session counts the same as a quick look.
  const hour = date.toISOString().slice(0, 13);
  if (s.lastActive === hour) return;
  s.lastActive = hour;
  s.activeHours[date.getUTCHours()] += 1;
}

// One answer in the conversation with the matchmaker.
export function noteAnswer(store, user, { text, askedAt, skipped, quickReply }) {
  const c = signalsOf(store, user.id).chat;
  if (skipped) {
    c.skips += 1;
    return;
  }
  c.answers += 1;
  if (quickReply) c.quickReplies += 1;
  else c.words += String(text).split(/\s+/).filter(Boolean).length;
  const sec = askedAt ? (Date.parse(now().toISOString()) - Date.parse(askedAt)) / 1000 : null;
  // Only count answers given in the same sitting; a reply the next day says nothing about pace.
  if (sec != null && sec >= 0 && sec < 1800) {
    c.latencySec += sec;
    c.timed += 1;
  }
}

function richness(u) {
  const facts = Object.values(u.shared.facts || {}).filter((f) => f.status === 'approved').length;
  return u.shared.items.filter((i) => i.status === 'approved').length + (u.shared.bio ? 1 : 0) + Math.floor(facts / 3);
}

function bump(pair, liked) {
  pair[liked ? 0 : 1] += 1;
}

// A like or pass on a weekly suggestion.
export function noteDecision(store, user, other, { liked, shownAt }) {
  const s = signalsOf(store, user.id);
  const d = s.decisions;
  d[liked ? 'likes' : 'passes'] += 1;
  const sec = shownAt ? (Date.parse(now().toISOString()) - Date.parse(shownAt)) / 1000 : null;
  if (sec != null && sec >= 0 && sec < 7 * 86400) {
    d.decideSec += sec;
    d.timed += 1;
  }
  bump((other.photos || []).length ? d.photos.with : d.photos.without, liked);
  bump(richness(other) >= 3 ? d.detail.rich : d.detail.sparse, liked);
  bump(normalizeCity(user.basics.city) === normalizeCity(other.basics.city) ? d.distance.local : d.distance.away, liked);
  const gap = Math.abs((user.basics.age || 0) - (other.basics.age || 0));
  bump(gap <= 3 ? d.ageGap.closer : d.ageGap.wider, liked);
  for (const k of TRAIT_KEYS) {
    const t = other.hidden.traits[k];
    if (t.confidence < 0.2) continue;
    const r = (s.revealed[k] ||= { liked: 0, nLiked: 0, passed: 0, nPassed: 0 });
    if (liked) {
      r.liked += t.value;
      r.nLiked += 1;
    } else {
      r.passed += t.value;
      r.nPassed += 1;
    }
  }
  if (!other.demo) {
    const o = signalsOf(store, other.id).received;
    if (liked) o.liked += 1;
  }
}

// This person was shown to someone as one of their two.
export function noteShown(store, other) {
  if (other.demo) return;
  signalsOf(store, other.id).received.shown += 1;
}

// A message in a match. Tracks who starts, who answers and how fast.
export function noteMessage(store, user, thread) {
  const m = signalsOf(store, user.id).matches;
  const mine = thread.filter((x) => x.from === user.id);
  if (mine.length !== 1) return;
  const before = thread.slice(0, -1);
  if (!before.length) {
    m.firstMessages += 1;
    return;
  }
  // Their first answer in this match.
  m.replied += 1;
  const min = (Date.parse(thread.at(-1).at) - Date.parse(before.at(-1).at)) / 60000;
  if (min >= 0 && min < 7 * 1440) {
    m.replyMin += min;
    m.timed += 1;
  }
}

export function noteMatch(store, user) {
  if (!user.demo) signalsOf(store, user.id).matches.started += 1;
}

// A week after matching: did this person ever answer?
export function noteCheckin(store, user, thread) {
  const s = signalsOf(store, user.id).matches;
  const theirs = thread.filter((x) => x.from !== user.id).length;
  const mine = thread.filter((x) => x.from === user.id).length;
  if (theirs > 0 && mine === 0) s.ghosted += 1;
}

// Reports that still stand, counted once per reporter: one angry person reporting three
// times is one report, and a report a moderator dismissed no longer counts.
export function reportCounts(store) {
  const by = new Map();
  for (const r of store.data.reports || []) {
    if (r.status === 'dismissed') continue;
    if (!by.has(r.about)) by.set(r.about, new Set());
    by.get(r.about).add(r.by);
  }
  return new Map([...by].map(([id, set]) => [id, set.size]));
}

// The matchmaker's private observations from the conversation (Claude only).
export function noteObservations(store, user, list) {
  const s = signalsOf(store, user.id);
  for (const raw of list || []) {
    const text = cleanText(raw, 240);
    if (!text) continue;
    s.observations.push({ text, at: now().toISOString() });
  }
  s.observations = s.observations.slice(-MAX_OBSERVATIONS);
}

// --- reading the signals for matching ---

// Per trait, which way this person's likes lean compared with their passes.
// Returns { trait: { target, weight } } once there is enough behaviour.
export function revealedPreferences(sig) {
  const out = {};
  if (!sig || sig.decisions.likes + sig.decisions.passes < MIN_DECISIONS) return out;
  for (const [k, r] of Object.entries(sig.revealed)) {
    if (!r.nLiked) continue;
    const liked = r.liked / r.nLiked;
    const passed = r.nPassed ? r.passed / r.nPassed : 0.5;
    const n = Math.min(r.nLiked, r.nPassed || 1);
    // A clear, repeated difference between who they like and who they pass on.
    const weight = Math.min(1, Math.abs(liked - passed) * 2) * Math.min(1, n / 4);
    if (weight > 0.05) out[k] = { target: liked, weight };
  }
  return out;
}

const rate = ([yes, no]) => (yes + no >= 3 ? yes / (yes + no) : null);

// How likely `a` is to like `b`, from how `a` has reacted to people like `b`. 0..1, or null.
export function likeChance(sig, a, b) {
  if (!sig) return null;
  const d = sig.decisions;
  if (d.likes + d.passes < MIN_DECISIONS) return null;
  const parts = [
    rate((b.photos || []).length ? d.photos.with : d.photos.without),
    rate(richness(b) >= 3 ? d.detail.rich : d.detail.sparse),
    rate(normalizeCity(a.basics.city) === normalizeCity(b.basics.city) ? d.distance.local : d.distance.away),
    rate(Math.abs((a.basics.age || 0) - (b.basics.age || 0)) <= 3 ? d.ageGap.closer : d.ageGap.wider),
  ].filter((x) => x != null);
  return parts.length ? parts.reduce((x, y) => x + y, 0) / parts.length : null;
}

// Does this person answer their matches? 0..1 (1 = always), or null when unknown.
export function responsiveness(sig) {
  if (!sig) return null;
  const m = sig.matches;
  const chances = m.replied + m.ghosted;
  return chances >= 2 ? m.replied / chances : null;
}

// How often people who see this person like them, smoothed toward the middle.
export function popularity(sig) {
  if (!sig) return 0.5;
  const { shown, liked } = sig.received;
  return (liked + 1) / (shown + 2);
}

// How much two people's active hours overlap, 0..1, or null when either is unknown.
export function hoursOverlap(a, b) {
  if (!a || !b) return null;
  const ta = a.activeHours.reduce((x, y) => x + y, 0);
  const tb = b.activeHours.reduce((x, y) => x + y, 0);
  if (ta < 10 || tb < 10) return null;
  let o = 0;
  for (let h = 0; h < 24; h++) o += Math.min(a.activeHours[h] / ta, b.activeHours[h] / tb);
  return o;
}

// Plain summary for the data export and for tests. Never shown in the app.
export function summarizeSignals(sig) {
  const c = sig.chat;
  const d = sig.decisions;
  return {
    answers: c.answers,
    averageWordsPerTypedAnswer: c.answers - c.quickReplies > 0 ? Math.round(c.words / (c.answers - c.quickReplies)) : null,
    skipped: c.skips,
    averageSecondsToAnswer: c.timed ? Math.round(mean(c.latencySec, c.timed)) : null,
    likes: d.likes,
    passes: d.passes,
    averageHoursToDecide: d.timed ? Math.round(mean(d.decideSec, d.timed) / 360) / 10 : null,
    revealedPreferences: revealedPreferences(sig),
    responsiveness: responsiveness(sig),
    activeHoursUtc: sig.activeHours,
    observations: sig.observations.map((o) => o.text),
    looksFromPhotos: { decisions: sig.looks.nLiked + sig.looks.nPassed, leanings: lookLeanings(sig) },
  };
}
