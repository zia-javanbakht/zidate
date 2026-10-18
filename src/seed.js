// Demo people so a fresh install has someone to suggest. Deterministic: same seed, same people.
import { fileURLToPath } from 'node:url';
import { TRAIT_KEYS, CORE_TRAITS, INTERESTS, ASPECTS, FACTS, clamp01 } from './traits.js';
import { newUser } from './app.js';

const WOMEN = ['Maya', 'Leila', 'Sofia', 'Hannah', 'Amara', 'Chloe', 'Ines', 'Nadia', 'Freya', 'Yuki', 'Priya', 'Elena', 'Zara', 'Grace', 'Noor', 'Clara', 'Ava', 'Mina', 'Lucia', 'Ruth'];
const MEN = ['Sam', 'Omar', 'Daniel', 'Kai', 'Theo', 'Ravi', 'Lucas', 'Ben', 'Mateo', 'Jonah', 'Arjun', 'Felix', 'Hugo', 'Idris', 'Leo', 'Marcus', 'Nico', 'Owen', 'Tomas', 'Yusuf'];
const NB = ['Alex', 'Robin', 'Sasha', 'Jules', 'Rowan', 'Quinn'];
export const DEMO_CITIES = ['London', 'Berlin', 'New York', 'Toronto'];

const LINES = {
  'My ideal Sunday': ['Farmers market, a long lunch, and a walk with no destination.', 'Early run, big breakfast, then a film I have already seen twice.', 'Slow coffee, the crossword, and friends over for dinner.', 'A train out of the city and a hike that ends at a pub.', 'Sleeping in, then losing the afternoon in a bookshop.'],
  'Something I could talk about for hours': ['Why some cities feel friendly and others do not.', 'Old films, especially the bad ones.', 'Fermentation. I am not sorry.', 'Space, black holes and how small we are.', 'The best street food I have ever eaten.'],
  'What makes me laugh': ['Dry humour and terrible puns.', 'My grandmother’s voice notes.', 'People who take board games far too seriously. Me included.', 'Dogs who think they are much bigger than they are.'],
  'What matters most to me': ['Being honest, even when it is awkward.', 'Family, and the friends who became family.', 'Doing work I am proud of and still having time for people.', 'Curiosity. I want to keep learning until the end.'],
};

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function seedDemo(store, { count = 64, seed = 7 } = {}) {
  if (Object.values(store.data.users).some((u) => u.demo)) return 0;
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  // Newer profile parts draw from their own sequence, so the original demo people stay the same.
  const r2 = rng(seed + 1);
  const pick2 = (arr) => arr[Math.floor(r2() * arr.length)];
  let made = 0;
  for (let i = 0; i < count; i++) {
    const roll = r();
    const gender = roll < 0.46 ? 'woman' : roll < 0.92 ? 'man' : 'nonbinary';
    const name = pick(gender === 'woman' ? WOMEN : gender === 'man' ? MEN : NB);
    const s = r();
    const seeking = gender === 'nonbinary' ? 'everyone' : s < 0.78 ? (gender === 'woman' ? 'men' : 'women') : s < 0.9 ? (gender === 'woman' ? 'women' : 'men') : 'everyone';
    const user = newUser(store, { name, email: `demo${i}@pishi.local`, password: null });
    user.demo = true;
    user.basics = { gender, seeking, age: 22 + Math.floor(r() * 24), city: DEMO_CITIES[i % DEMO_CITIES.length] };
    for (const k of CORE_TRAITS) user.hidden.traits[k] = { value: clamp01(Math.round(r() * 100) / 100), confidence: 0.5 + Math.round(r() * 30) / 100 };
    for (const k of TRAIT_KEYS.filter((t) => !CORE_TRAITS.includes(t))) user.hidden.traits[k] = { value: clamp01(Math.round(r2() * 100) / 100), confidence: 0.3 + Math.round(r2() * 30) / 100 };
    user.hidden.aspects = { loveLanguage: pick2(Object.keys(ASPECTS.loveLanguage)), pace: pick2(Object.keys(ASPECTS.pace)) };
    const fam = user.hidden.traits.family.value;
    user.hidden.tags = [fam > 0.7 ? 'wants-kids' : fam < 0.3 ? 'no-kids' : null, r() < 0.15 ? 'smoker' : 'non-smoker', r() < 0.25 ? 'sober' : 'drinks', r() < 0.3 ? 'pets' : null].filter(Boolean);
    user.hidden.values = [pick(['honesty', 'kindness', 'curiosity', 'family', 'humour']), pick(['growth', 'loyalty', 'adventure', 'respect'])];
    const interests = new Set();
    while (interests.size < 4) interests.add(pick(INTERESTS));
    user.shared.interests = [...interests];
    const prompts = Object.keys(LINES);
    const p1 = pick(prompts);
    const p2 = pick(prompts.filter((p) => p !== p1));
    user.shared.items = [p1, p2].map((prompt, j) => ({ id: `it_demo${i}_${j}`, prompt, text: pick(LINES[prompt]), status: 'approved' }));
    const tag = (t) => user.hidden.tags.includes(t);
    user.shared.facts = Object.fromEntries(Object.entries({
      work: pick2(['Nurse', 'Teacher', 'Software engineer', 'Architect', 'Chef', 'Designer', 'Accountant', 'Physiotherapist', 'Journalist', 'Student']),
      education: pick2(FACTS.education.options),
      languages: pick2(['English', 'English, Spanish', 'English, French', 'English, German', 'English, Arabic', 'English, Persian']),
      kids: tag('wants-kids') ? 'Wants kids' : tag('no-kids') ? "Doesn't want kids" : 'Open to kids',
      drinking: tag('sober') ? "Doesn't drink" : pick2(['Drinks', 'Sometimes']),
      smoking: tag('smoker') ? 'Smokes' : "Doesn't smoke",
      pets: tag('pets') ? 'Has pets' : null,
    }).filter(([, v]) => v && r2() < 0.8).map(([k, value]) => [k, { value, status: 'approved' }]));
    user.shared.bio = `${user.hidden.traits.social.value > 0.5 ? 'Happiest around a full table.' : 'Small plans, good company.'} Into ${user.shared.interests.slice(0, 2).join(' and ')}.`;
    made++;
  }
  store.save();
  return made;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { Store } = await import('./db.js');
  const store = new Store(process.env.PISHI_DB || 'data/db.json');
  console.log(`Seeded ${seedDemo(store)} demo people.`);
  store.flush();
}
