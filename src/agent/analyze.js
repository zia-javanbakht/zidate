// Deterministic text analysis for the offline interviewer. It reads an answer and
// returns the same structured update shape that the Claude interviewer returns.
import { INTERESTS } from '../traits.js';

// keyword -> [trait, direction]. Direction 1 pushes toward the "high" pole, 0 toward "low".
const LEXICON = [
  [/\b(friends|party|parties|people|crowds?|social|going out|host(ing)?|gatherings?|bar|club(bing)?|festival)\b/, 'social', 1],
  [/\b(alone|quiet|introvert(ed)?|recharge|solitude|by myself|small group|stay(ing)? in|night in|cosy|cozy)\b/, 'social', 0],
  [/\b(travel(l?ing)?|abroad|explor(e|ing)|adventure|new places?|backpack(ing)?|road ?trip|try(ing)? new|spontaneous trip|somewhere new)\b/, 'adventure', 1],
  [/\b(routine|familiar|same place|comfort zone|predictable|home ?body)\b/, 'adventure', 0],
  [/\b(career|promotion|startup|ambitio(n|us)|goals?|build(ing)? (a|my)|hustle|driven|founder|work hard)\b/, 'ambition', 1],
  [/\b(work[- ]life balance|work to live|slow living|not my life|clock off|part[- ]time|just a job)\b/, 'ambition', 0],
  [/\b(kids|children|family|settle down|marriage|married|parents|nieces?|nephews?)\b/, 'family', 1],
  [/\b(child-?free|no kids|independen(t|ce)|freedom)\b/, 'family', 0],
  [/\b(plan(s|ned|ning)?|schedule|organi[sz]ed|lists?|calendar|ahead|prepared)\b/, 'planning', 1],
  [/\b(spontaneous(ly)?|go with the flow|last[- ]minute|improvis(e|ing)|wing it|whatever happens)\b/, 'planning', 0],
  [/\b(books?|read(ing)?|debat(e|ing)|philosoph(y|ical)|ideas|science|history|documentar(y|ies)|curious|learn(ing)?|museums?|politics|art)\b/, 'intellect', 1],
  [/\b(practical|hands[- ]on|simple things|down to earth|fix(ing)? things)\b/, 'intellect', 0],
  [/\b(faith|god|church|mosque|temple|synagogue|pray(er|ing)?|spiritual(ity)?|religio(n|us))\b/, 'spirituality', 1],
  [/\b(atheist|secular|agnostic)\b/, 'spirituality', 0],
  [/\b(gym|run(ning)?|hik(e|es|ing)|sports?|climb(ing)?|cycl(e|ing)|fitness|active|training|swim(ming)?|yoga|surf(ing)?|football|tennis|marathon)\b/, 'activity', 1],
  [/\b(couch|sofa|lazy|netflix|lie[- ]in|nap|chill(ing)?|slow mornings?)\b/, 'activity', 0],
];

const NEGATION = /\b(not|don'?t|do not|never|no|hate|can'?t stand|dislike|isn'?t|aren'?t|without|less)\b/;

const INTEREST_ALIASES = {
  hike: 'hiking', hikes: 'hiking', cook: 'cooking', read: 'reading', books: 'reading', book: 'reading',
  run: 'running', runs: 'running', movie: 'films', movies: 'films', film: 'films', cinema: 'films',
  gig: 'concerts', gigs: 'concerts', climb: 'climbing', bouldering: 'climbing', bike: 'cycling',
  travelling: 'travel', traveling: 'travel', paint: 'art', painting: 'art', galleries: 'art',
  boardgames: 'board games', games: 'gaming', bake: 'baking', camp: 'camping', ski: 'skiing',
  dog: 'dogs', puppy: 'dogs', cat: 'cats', plays: 'theatre', theater: 'theatre', guitar: 'music',
  piano: 'music', singing: 'music', espresso: 'coffee', museum: 'museums', poems: 'poetry',
};

// Split into clauses so a negation only affects its own clause.
function clauses(text) {
  return text.toLowerCase().split(/[.,;!?]|\bbut\b|\band\b(?= i\b)/).map((c) => c.trim()).filter(Boolean);
}

export function scoreTraits(text) {
  const votes = {};
  for (const clause of clauses(text)) {
    for (const [re, trait, dir] of LEXICON) {
      const m = clause.match(re);
      if (!m) continue;
      const before = clause.slice(Math.max(0, m.index - 24), m.index);
      // "too X" talks about someone else being too much of something.
      const negated = NEGATION.test(before) || /\btoo\b/.test(before);
      const d = negated ? 1 - dir : dir;
      (votes[trait] ||= []).push(d);
    }
  }
  const out = [];
  for (const [trait, ds] of Object.entries(votes)) {
    const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
    // Pull toward the pole but not all the way: words are weak evidence.
    out.push({ trait, value: 0.5 + (mean - 0.5) * 0.8, confidence: Math.min(0.45, 0.2 + 0.1 * ds.length) });
  }
  return out;
}

export function findInterests(text) {
  const lower = ` ${text.toLowerCase()} `;
  const found = new Set();
  for (const i of INTERESTS) {
    if (new RegExp(`\\b${i}\\b`).test(lower)) found.add(i);
  }
  for (const word of lower.match(/[a-z]+/g) || []) {
    if (INTEREST_ALIASES[word]) found.add(INTEREST_ALIASES[word]);
  }
  // Interests only count when not negated, e.g. "I don't really do gym".
  return [...found].filter((i) => !new RegExp(`(not|don'?t|never|hate)[^.,]{0,15}\\b${i.split(' ')[0]}`).test(lower));
}

export function findTags(text) {
  const t = text.toLowerCase();
  const tags = [];
  if (/\b(non[- ]?smoker|(don'?t|do not|never|quit|stopped) smok(e|ing))\b/.test(t)) tags.push('non-smoker');
  else if (/\bsmok(e|er|ing)\b/.test(t)) tags.push('smoker');
  if (/\b(sober|teetotal|(don'?t|do not|never) drink|no alcohol)\b/.test(t)) tags.push('sober');
  else if (/\b(drink|wine|beer|cocktails?|pints?)\b/.test(t)) tags.push('drinks');
  if (/\b(vegetarian|vegan)\b/.test(t)) tags.push('vegetarian');
  if (/\b(my|our) (dog|cat|puppy|kitten)\b|\bpets?\b/.test(t) && !/\b(allerg|no pets)/.test(t)) tags.push('pets');
  if (/\b(night owl|stay up late|late nights)\b/.test(t)) tags.push('night-owl');
  if (/\b(early bird|early riser|up at (5|6))\b/.test(t)) tags.push('early-bird');
  return tags;
}

// Things people name as dealbreakers, mapped to the tag the *other* person would carry.
export function findDealbreakers(text) {
  const t = text.toLowerCase();
  const out = [];
  if (/smok/.test(t)) out.push('smoker');
  if (/(doesn'?t|don'?t|not) want (kids|children)|child-?free/.test(t)) out.push('no-kids');
  else if (/(wants?|having) (kids|children)/.test(t) && /(don'?t|not|never)/.test(t)) out.push('wants-kids');
  if (/(heavy )?drink(ing|er)|alcohol|drunk/.test(t) && !/don'?t mind/.test(t)) out.push('drinks');
  if (/religio|church|faith/.test(t)) out.push('religious');
  if (/(allergic|no) (to )?(pets|dogs|cats)/.test(t)) out.push('pets');
  if (/casual|hook ?ups?|not serious/.test(t)) out.push('casual');
  return out;
}

// Turn an answer into a shared-profile line: tidy, first person, no rambling.
export function toSharedText(text) {
  let s = String(text).replace(/\s+/g, ' ').trim();
  if (s.length < 15) return null;
  if (s.length > 220) {
    const cut = s.slice(0, 220);
    s = cut.slice(0, Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(', '), 120)).replace(/[,\s]+$/, '') + '…';
  }
  s = s[0].toUpperCase() + s.slice(1);
  if (!/[.!?…]$/.test(s)) s += '.';
  return s;
}

const VALUE_WORDS = ['honesty', 'kindness', 'loyalty', 'humour', 'humor', 'curiosity', 'independence', 'family', 'growth', 'respect', 'adventure', 'generosity', 'ambition', 'faith', 'freedom', 'stability', 'creativity', 'health', 'communication', 'trust'];

export function findValues(text) {
  const t = text.toLowerCase();
  return VALUE_WORDS.filter((v) => t.includes(v)).map((v) => (v === 'humor' ? 'humour' : v));
}
