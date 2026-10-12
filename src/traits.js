// The hidden profile is a set of traits on a 0..1 scale, each with a confidence.
// Labels describe the two poles so both the agent and the UI can explain a value.

export const TRAITS = {
  social: { low: 'recharges alone', high: 'energised by people' },
  adventure: { low: 'loves routine', high: 'chases novelty' },
  ambition: { low: 'work to live', high: 'career-driven' },
  family: { low: 'not focused on family', high: 'family-centred' },
  planning: { low: 'spontaneous', high: 'plans ahead' },
  intellect: { low: 'practical', high: 'ideas and debate' },
  spirituality: { low: 'secular', high: 'faith or spirituality matters' },
  activity: { low: 'relaxed pace', high: 'very active' },
};

export const TRAIT_KEYS = Object.keys(TRAITS);

// Tags the agent may record. Dealbreakers are matched against the other person's tags.
export const TAGS = [
  'smoker', 'non-smoker', 'drinks', 'sober', 'wants-kids', 'no-kids', 'has-kids',
  'pets', 'no-pets', 'religious', 'vegetarian', 'long-term', 'casual', 'night-owl', 'early-bird',
];

export const INTERESTS = [
  'hiking', 'cooking', 'reading', 'music', 'concerts', 'travel', 'running', 'yoga', 'gaming',
  'films', 'art', 'photography', 'dancing', 'cycling', 'climbing', 'gardening', 'coffee',
  'wine', 'board games', 'theatre', 'swimming', 'football', 'tennis', 'writing', 'podcasts',
  'museums', 'baking', 'camping', 'surfing', 'skiing', 'meditation', 'volunteering', 'tech',
  'fashion', 'languages', 'history', 'science', 'poetry', 'gym', 'dogs', 'cats',
];

export function emptyHidden() {
  const traits = {};
  for (const k of TRAIT_KEYS) traits[k] = { value: 0.5, confidence: 0 };
  return {
    traits,
    tags: [],
    dealbreakers: [],
    values: [],
    notes: [],
    // Learned from how the person reacts to suggestions: per-trait pull toward
    // what they actually liked, separate from who they are.
    preference: {},
  };
}

export function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
