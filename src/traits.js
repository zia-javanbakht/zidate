import { emptyTemperament, TEMPERAMENT_KEYS } from './temperament.js';

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
  affection: { low: 'shows care quietly', high: 'openly affectionate' },
  conflict: { low: 'needs time to cool off', high: 'talks things through straight away' },
  tidiness: { low: 'relaxed about mess', high: 'tidy and organised' },
  independence: { low: 'loves doing things together', high: 'needs plenty of own time' },
  humour: { low: 'earnest and sincere', high: 'playful, always joking' },
};

// How the interviewer refers to each area when talking to the person.
export const TOPICS = {
  social: 'how you like to spend time with people',
  adventure: 'how much you like new things',
  ambition: 'where work fits in your life',
  family: 'family and the future',
  planning: 'plans versus spontaneity',
  intellect: 'what gets you thinking',
  spirituality: 'faith and spirituality',
  activity: 'how active you are',
  affection: 'how you show you care',
  conflict: 'how you handle disagreements',
  tidiness: 'home and tidiness',
  independence: 'time together versus time apart',
  humour: 'your sense of humour',
};

export const TRAIT_KEYS = Object.keys(TRAITS);
// The first eight decide when someone is ready to be matched. The rest deepen the
// picture later in the conversation, so adding them never holds anyone back.
export const CORE_TRAITS = TRAIT_KEYS.slice(0, 8);

// Tags the agent may record. Dealbreakers are matched against the other person's tags.
export const TAGS = [
  'smoker', 'non-smoker', 'drinks', 'sober', 'wants-kids', 'no-kids', 'has-kids',
  'pets', 'no-pets', 'religious', 'vegetarian', 'vegan', 'long-term', 'casual', 'night-owl', 'early-bird',
  'wants-marriage', 'no-marriage',
];

// Categorical parts of the hidden profile, each set from a quick reply.
export const ASPECTS = {
  loveLanguage: { words: 'kind words', time: 'time together', touch: 'physical affection', gifts: 'thoughtful gifts', help: 'help without asking' },
  pace: { slow: 'likes to take things slowly', steady: 'a steady pace', fast: 'knows quickly' },
};

// Plain facts a person can show on their shared profile. The matchmaker may suggest
// them from the conversation; like every shared line, they appear only once approved.
export const FACTS = {
  pronouns: { label: 'Pronouns', options: ['she/her', 'he/him', 'they/them', 'she/they', 'he/they', 'any pronouns'] },
  work: { label: 'Work' },
  education: { label: 'Education', options: ['Secondary school', 'Trade or vocational', 'University', 'Postgraduate'] },
  languages: { label: 'Languages' },
  height: { label: 'Height' },
  lookingFor: { label: 'Looking for', options: ['Something long-term', 'Seeing where it goes', 'Something casual'] },
  kids: { label: 'Kids', options: ['Wants kids', 'Open to kids', "Doesn't want kids", 'Has kids'] },
  drinking: { label: 'Drinking', options: ['Drinks', 'Sometimes', "Doesn't drink"] },
  smoking: { label: 'Smoking', options: ['Smokes', "Doesn't smoke"] },
  diet: { label: 'Diet', options: ['Eats everything', 'Vegetarian', 'Vegan'] },
  pets: { label: 'Pets', options: ['Has pets', 'Would like pets', 'No pets'] },
};
export const FACT_KEYS = Object.keys(FACTS);

// What a tag in the hidden profile would look like as a fact, if the person chooses to show it.
export const TAG_FACTS = {
  smoker: ['smoking', 'Smokes'], 'non-smoker': ['smoking', "Doesn't smoke"],
  drinks: ['drinking', 'Drinks'], sober: ['drinking', "Doesn't drink"],
  'wants-kids': ['kids', 'Wants kids'], 'no-kids': ['kids', "Doesn't want kids"], 'has-kids': ['kids', 'Has kids'],
  'long-term': ['lookingFor', 'Something long-term'], casual: ['lookingFor', 'Something casual'],
  vegetarian: ['diet', 'Vegetarian'], vegan: ['diet', 'Vegan'], pets: ['pets', 'Has pets'], 'no-pets': ['pets', 'No pets'],
};

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
    aspects: {},
    // Why they passed on people, and the search limits those reasons led to.
    passReasons: [],
    limits: {},
    // Learned from how the person reacts to suggestions: per-trait pull toward
    // what they actually liked, separate from who they are.
    preference: {},
    // The four temperaments from the hidden questionnaire (see temperament.js).
    // Unlike the traits, never shown to the person.
    temperament: emptyTemperament(),
  };
}

export function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

// Bring a stored person up to date when the profile gains new parts.
export function upgradeHidden(hidden) {
  const fresh = emptyHidden();
  for (const k of TRAIT_KEYS) hidden.traits[k] ||= fresh.traits[k];
  for (const [k, v] of Object.entries(fresh)) hidden[k] ??= v;
  for (const k of TEMPERAMENT_KEYS) hidden.temperament[k] ||= fresh.temperament[k];
  return hidden;
}
