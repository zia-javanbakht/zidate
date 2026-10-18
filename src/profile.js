// Applying what the interviewer learned to a person's two profiles.
//   hidden: traits, tags, dealbreakers, private notes. Never leaves the server for anyone else.
//   shared: what potential matches see. The agent only *suggests* items; the person approves them.
import { TRAITS, TRAIT_KEYS, CORE_TRAITS, TAGS, INTERESTS, ASPECTS, FACTS, FACT_KEYS, TAG_FACTS, clamp01, upgradeHidden } from './traits.js';
import { now } from './clock.js';
import { isVerified } from './verification.js';

const MAX_NOTES = 40;
const MAX_SHARED = 30;

// Blend a new observation into a trait. Confidence-weighted, so one strong answer
// moves an unknown trait a lot and a well-established trait only a little.
export function blendTrait(trait, value, confidence) {
  const v = clamp01(Number(value));
  const c = clamp01(Number(confidence));
  if (!Number.isFinite(v) || !Number.isFinite(c) || c === 0) return trait;
  const total = trait.confidence + c;
  return {
    value: (trait.value * trait.confidence + v * c) / total,
    // Confidence grows with evidence but saturates below 1.
    confidence: clamp01(1 - (1 - trait.confidence) * (1 - c * 0.6)),
  };
}

function addUnique(list, items, allowed) {
  for (const raw of items || []) {
    const item = String(raw).toLowerCase().trim();
    if (!item || (allowed && !allowed.includes(item))) continue;
    if (!list.includes(item)) list.push(item);
  }
}

const CONFLICTS = [
  ['smoker', 'non-smoker'], ['drinks', 'sober'], ['wants-kids', 'no-kids'],
  ['pets', 'no-pets'], ['long-term', 'casual'], ['night-owl', 'early-bird'], ['wants-marriage', 'no-marriage'],
];

function removeConflicting(tags, added) {
  for (const [a, b] of CONFLICTS) {
    if (added.includes(a)) tags.splice(0, tags.length, ...tags.filter((t) => t !== b));
    if (added.includes(b)) tags.splice(0, tags.length, ...tags.filter((t) => t !== a));
  }
}

// Contact details do not belong on a public profile: they let people skip consent.
const CONTACT = [
  /[^\s@]+@[^\s@]+\.[a-z]{2,}/i, // email
  /(\+?\d[\d\s().-]{7,}\d)/, // phone-ish
  /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(com|net|org|io|me|co)\b/i, // links
  /(^|\s)@[a-z0-9_.]{2,}/i, // social handles
  /\b(insta(gram)?|snap(chat)?|whats ?app|telegram|tiktok|onlyfans)\b/i,
];

export function hasContactInfo(text) {
  return CONTACT.some((re) => re.test(String(text)));
}

export function cleanText(text, max = 280) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// update: the structured result of one interviewer turn (see agent/schema.js).
export function applyUpdate(user, update) {
  const hidden = user.hidden;
  for (const t of update.traitUpdates || []) {
    if (!TRAIT_KEYS.includes(t.trait)) continue;
    hidden.traits[t.trait] = blendTrait(hidden.traits[t.trait], t.value, t.confidence);
  }
  for (const p of update.preferenceUpdates || []) {
    if (!TRAIT_KEYS.includes(p.trait)) continue;
    hidden.preference[p.trait] = blendTrait(hidden.preference[p.trait] || { value: 0.5, confidence: 0 }, p.value, p.confidence);
  }
  const newTags = (update.tags || []).map((t) => String(t).toLowerCase());
  removeConflicting(hidden.tags, newTags);
  addUnique(hidden.tags, newTags, TAGS);
  addUnique(hidden.dealbreakers, update.dealbreakers, TAGS);
  for (const [k, v] of Object.entries(update.aspects || {})) {
    if (ASPECTS[k]?.[v]) hidden.aspects[k] = v;
  }
  addUnique(hidden.values, update.values);
  hidden.values = hidden.values.slice(-12);
  if (update.privateNote) {
    hidden.notes.push({ text: cleanText(update.privateNote, 400), at: now().toISOString() });
    hidden.notes = hidden.notes.slice(-MAX_NOTES);
  }

  const shared = user.shared;
  // Interests heard in the conversation are suggestions too: they only go public once approved.
  shared.suggestedInterests ||= [];
  addUnique(shared.suggestedInterests, (update.interests || []).filter((i) => !shared.interests.includes(String(i).toLowerCase())), INTERESTS);
  shared.suggestedInterests = shared.suggestedInterests.slice(-12);
  for (const s of update.sharedSuggestions || []) {
    const text = cleanText(s.text, 300);
    if (!text || hasContactInfo(text)) continue;
    const prompt = cleanText(s.prompt, 80) || null;
    const dupe = shared.items.find((i) => i.text.toLowerCase() === text.toLowerCase());
    if (dupe) continue;
    // A newer answer to the same prompt replaces an older suggestion that was never approved.
    if (prompt) {
      shared.items = shared.items.filter((i) => !(i.prompt === prompt && i.status === 'suggested'));
    }
    shared.items.push({ id: `it_${Math.random().toString(36).slice(2, 10)}`, prompt, text, status: 'suggested' });
  }
  if (shared.items.length > MAX_SHARED) {
    // Drop the oldest unapproved suggestions first.
    const extra = shared.items.length - MAX_SHARED;
    let dropped = 0;
    shared.items = shared.items.filter((i) => !(i.status === 'suggested' && dropped++ < extra));
  }
  const facts = { ...update.facts };
  for (const tag of newTags) if (TAG_FACTS[tag] && !facts[TAG_FACTS[tag][0]]) facts[TAG_FACTS[tag][0]] = TAG_FACTS[tag][1];
  suggestFacts(user, facts);
  // The bio is also only a draft until the person accepts it.
  if (update.bio && !hasContactInfo(update.bio)) shared.bioDraft = cleanText(update.bio, 400);
}

// A fact's value, tidied, or null when it is not a valid one.
export function cleanFact(key, value) {
  const def = FACTS[key];
  if (!def) return null;
  const v = cleanText(value, 60);
  if (!v) return null;
  if (def.options) return def.options.find((o) => o.toLowerCase() === v.toLowerCase()) || null;
  return hasContactInfo(v) ? null : v;
}

// Suggest facts for the shared profile. Never overrides one the person set or approved.
export function suggestFacts(user, facts) {
  user.shared.facts ||= {};
  for (const [key, raw] of Object.entries(facts || {})) {
    const value = cleanFact(key, raw);
    const cur = user.shared.facts[key];
    if (!value || (cur && cur.status !== 'suggested')) continue;
    user.shared.facts[key] = { value, status: 'suggested' };
  }
}

export function upgradeUser(user) {
  upgradeHidden(user.hidden);
  user.shared.facts ||= {};
  user.shared.suggestedInterests ||= [];
  return user;
}

// How well we know the person, 0..1. Matching unlocks at READY.
export const READY = 0.45;

export function completeness(user) {
  const conf = CORE_TRAITS.map((k) => user.hidden.traits[k].confidence);
  const traitScore = conf.reduce((a, b) => a + b, 0) / conf.length;
  const basics = ['gender', 'seeking', 'age', 'city'].filter((k) => user.basics[k] != null).length / 4;
  return Math.round((traitScore * 0.75 + basics * 0.25) * 100) / 100;
}

export function basicsDone(user) {
  const b = user.basics;
  return Boolean(b.gender && b.seeking && b.age && b.city);
}

export function isReady(user) {
  return basicsDone(user) && completeness(user) >= READY;
}

// A plain-language summary of what the matchmaker has learned, for the person themselves.
export function summarize(user) {
  const t = user.hidden.traits;
  const sure = TRAIT_KEYS.filter((k) => t[k].confidence >= 0.3 && Math.abs(t[k].value - 0.5) > 0.12)
    .sort((a, b) => t[b].confidence - t[a].confidence)
    .map((k) => (t[k].value > 0.5 ? TRAITS[k].high : TRAITS[k].low));
  const parts = [];
  if (sure.length) parts.push(`So far you come across as ${listJoin(sure.slice(0, 4))}.`);
  const prefs = Object.entries(user.hidden.preference || {}).filter(([, p]) => p.confidence >= 0.2 && Math.abs(p.value - 0.5) > 0.15);
  if (prefs.length) parts.push(`In a partner you have said you lean toward someone ${listJoin(prefs.map(([k, p]) => (p.value > 0.5 ? TRAITS[k].high : TRAITS[k].low)))}.`);
  const love = ASPECTS.loveLanguage[user.hidden.aspects?.loveLanguage];
  if (love) parts.push(`You feel most cared for through ${love}.`);
  if (user.hidden.dealbreakers.length) parts.push(`Dealbreakers: ${listJoin(user.hidden.dealbreakers.map((d) => d.replace(/-/g, ' ')))}.`);
  return parts.join(' ') || 'Still getting to know you. A few more answers and I will be able to describe you.';
}

function listJoin(list) {
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0] || '';
}

// What the person themselves can see about their hidden profile.
export function describeHidden(user) {
  const h = user.hidden;
  return {
    summary: summarize(user),
    traits: TRAIT_KEYS.map((k) => ({
      key: k,
      value: Math.round(h.traits[k].value * 100) / 100,
      confidence: Math.round(h.traits[k].confidence * 100) / 100,
      label: h.traits[k].confidence < 0.15
        ? 'still learning'
        : h.traits[k].value < 0.4 ? TRAITS[k].low : h.traits[k].value > 0.6 ? TRAITS[k].high : 'somewhere in between',
    })),
    tags: h.tags,
    dealbreakers: h.dealbreakers,
    values: h.values,
    aspects: Object.entries(h.aspects || {}).map(([key, v]) => ({ key, value: v, label: ASPECTS[key]?.[v] })).filter((a) => a.label),
    limits: describeLimits(h.limits || {}),
    passReasons: countReasons(h.passReasons || []),
    notes: h.notes.slice(-8).map((n) => n.text),
  };
}

// Search limits learned from passes, in plain words. Each one can be removed.
export function describeLimits(l) {
  const out = [];
  if (l.localOnly) out.push({ key: 'localOnly', text: 'Only people near you' });
  if (l.ageMin != null && l.ageMax != null) out.push({ key: 'age', text: `Ages ${l.ageMin} to ${l.ageMax}` });
  else if (l.ageMin != null) out.push({ key: 'age', text: `Older than ${l.ageMin - 1}` });
  else if (l.ageMax != null) out.push({ key: 'age', text: `Younger than ${l.ageMax + 1}` });
  if (l.prefersDetail) out.push({ key: 'prefersDetail', text: 'People who share a little more on their profile' });
  return out;
}

export const REASON_LABELS = {
  spark: 'no spark', lifestyle: 'lives too different', distance: 'too far away', age: 'age', profile: 'profile said too little', other: 'something else',
};

function countReasons(list) {
  const counts = {};
  for (const r of list) counts[r.reason] = (counts[r.reason] || 0) + 1;
  return Object.entries(counts).map(([reason, count]) => ({ reason, label: REASON_LABELS[reason] || reason, count }));
}

export function settingsOf(user) {
  user.settings ||= {};
  const s = user.settings;
  s.paused ??= false;
  s.photosAfterMatch ??= true;
  s.matchDay ??= 1; // 0 = Sunday .. 6 = Saturday
  s.timeZone ??= 'UTC';
  s.email ||= {};
  for (const k of ['picks', 'match', 'message']) s.email[k] ??= true;
  return s;
}

// What another person sees. Only approved items; never anything hidden.
// showPhotos: whether this viewer may see the photos (the owner can keep them until a match).
export function publicProfile(user, { showPhotos = false } = {}) {
  const photos = user.photos || [];
  return {
    id: user.id,
    name: user.name,
    age: user.basics.age,
    city: user.basics.city,
    bio: user.shared.bio || '',
    interests: user.shared.interests,
    facts: FACT_KEYS.filter((k) => user.shared.facts?.[k]?.status === 'approved').map((k) => ({ key: k, label: FACTS[k].label, value: user.shared.facts[k].value })),
    items: user.shared.items.filter((i) => i.status === 'approved').map(({ prompt, text }) => ({ prompt, text })),
    photos: showPhotos ? photos.map((p) => `/api/photos/${p.id}`) : [],
    photosHidden: !showPhotos && photos.length > 0,
    ...(isVerified(user) ? { verified: true } : {}),
    ...(user.demo ? { demo: true } : {}),
  };
}
