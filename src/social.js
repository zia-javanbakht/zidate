// What happens between two people: likes, matches, demo replies, icebreakers.
import { TRAIT_KEYS } from './traits.js';
import { nearby } from './cities.js';
import { blendTrait } from './profile.js';
import { matchId } from './matching.js';
import { queueEvent } from './agent/index.js';
import { now } from './clock.js';
import { noteMatch, noteCheckin, noteMessage } from './signals.js';

// Liking someone is also a signal: nudge preferences a little toward them. Likes alone
// never take a preference past LIKE_CAP, so what the person told us keeps the upper hand
// and a run of similar likes cannot narrow every future week to look-alikes.
const LIKE_CAP = 0.3;
// Meeting someone and wanting to see them again says more than a like, so it counts for
// a little more, but still never outweighs what the person said they want.
export const MET_CAP = 0.45;
export function learnFromLike(user, other, { weight = 0.12, cap = LIKE_CAP } = {}) {
  for (const k of TRAIT_KEYS) {
    const t = other.hidden.traits[k];
    if (t.confidence < 0.2) continue;
    const cur = user.hidden.preference[k] || { value: 0.5, confidence: 0 };
    const next = blendTrait(cur, t.value, weight);
    user.hidden.preference[k] = { value: next.value, confidence: Math.max(cur.confidence, Math.min(cap, next.confidence)) };
  }
}

export function createMatch(ctx, a, b) {
  const { store, notify } = ctx;
  const id = matchId(a.id, b.id);
  if (store.data.matches[id]) return store.data.matches[id];
  // The person who completed the match sees it straight away, so it is not "new" for them.
  const m = { id, users: [a.id, b.id], createdAt: now().toISOString(), seen: { [a.id]: now().toISOString() } };
  store.data.matches[id] = m;
  store.data.messages[id] = [];
  // A note sent with a like becomes the first message, the earlier like first.
  const notes = store.data.likeNotes || {};
  const sent = [[b, a], [a, b]].map(([x, y]) => [x, notes[`${x.id}>${y.id}`]]).filter(([, n]) => n)
    .sort(([, p], [, q]) => p.at.localeCompare(q.at));
  for (const [x, n] of sent) {
    store.data.messages[id].push({ from: x.id, text: n.note || (n.on?.kind === 'photo' ? 'Liked your photo.' : 'Liked this.'), at: n.at, ...(n.on ? { about: n.on } : {}) });
    noteMessage(store, x, store.data.messages[id]);
  }
  delete notes[`${a.id}>${b.id}`];
  delete notes[`${b.id}>${a.id}`];
  noteMatch(store, a);
  noteMatch(store, b);
  for (const [x, y] of [[a, b], [b, a]]) {
    if (x.demo) continue;
    queueEvent(store.data.conversations[x.id], { type: 'match', candidateId: y.id, name: y.name });
  }
  notify(b, { type: 'match', text: `You and ${a.name} like each other.`, link: `#/match/${encodeURIComponent(id)}` });
  return m;
}

// Demo people answer so a solo tester can try the whole flow. Clearly labelled as demo.
export function demoReply(demo, user, thread) {
  const mine = thread.filter((x) => x.from === demo.id).length;
  const interest = demo.shared.interests.find((i) => user.shared.interests.includes(i)) || demo.shared.interests[0];
  const lines = [
    `Hi ${user.name}! Nice to match. I saw you are in ${user.basics.city}, how are you finding it?`,
    `Ha, fair. I have been really into ${interest} lately. Are you?`,
    'What does a good week look like for you?',
    'I like that. Coffee sometime? (I am a demo profile, so this is where the demo ends.)',
  ];
  return lines[Math.min(mine, lines.length - 1)];
}

// Conversation starters built only from what both people chose to share.
export function icebreakers(me, other) {
  // Their own opening questions come first: they asked to be asked.
  const out = (other.shared.openers || []).map((q) => `You asked: ${q} `);
  const common = me.shared.interests.filter((i) => other.shared.interests.includes(i));
  if (common[0]) out.push(`You both like ${common[0]}. What got you into it?`);
  const item = other.shared.items.find((i) => i.status === 'approved');
  if (item) out.push(`About “${item.prompt || 'your profile'}”: ${item.text.length > 70 ? `${item.text.slice(0, 67)}…` : item.text} Tell me more?`);
  if (other.shared.interests[0] && !common.includes(other.shared.interests[0])) out.push(`I have never really tried ${other.shared.interests[0]}. Where would I start?`);
  out.push('What does a good week look like for you?');
  return [...new Set(out)].slice(0, Math.max(3, (other.shared.openers || []).length + 1));
}

// A week after matching, the matchmaker asks whether they met. Anyone still talking then
// is asked once more two weeks later.
export function runCheckins(ctx) {
  const { store, notify } = ctx;
  let n = 0;
  const t = Date.parse(now().toISOString());
  const cutoff = t - 7 * 864e5;
  for (const m of Object.values(store.data.matches)) {
    const first = !m.checkin && Date.parse(m.createdAt) <= cutoff;
    const again = Boolean(m.checkin && m.askAgainAt && !m.askedAgain && Date.parse(m.askAgainAt) <= t);
    if ((!first && !again) || m.closed) continue;
    if (first) m.checkin = now().toISOString();
    else m.askedAgain = now().toISOString();
    const [a, b] = m.users.map((id) => store.data.users[id]);
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!x || !y || x.demo) continue;
      // Asked again only of people who said they were still talking.
      if (again && m.met?.[x.id]?.answer !== 'talking') continue;
      if (first) noteCheckin(store, x, store.data.messages[m.id] || []);
      // Someone who already told us from the conversation is not asked the same thing.
      if (first && m.met?.[x.id]) continue;
      queueEvent(store.data.conversations[x.id], { type: 'checkin', candidateId: y.id, name: y.name, aspects: passEvent(x, y).aspects, again });
      notify(x, { type: 'checkin', text: `Did you meet ${y.name}? Tell your matchmaker.`, link: '#/talk' });
      n++;
    }
  }
  return n;
}

// What the "why did you pass" questions may offer. Built here, where both people are known;
// only neutral labels ever reach the person, never the other person's hidden values.
export function passEvent(user, other) {
  // Everything both are known on, not only where they differ: which questions get offered
  // must not depend on the other person's hidden values.
  const known = TRAIT_KEYS
    .filter((k) => user.hidden.traits[k].confidence >= 0.2 && other.hidden.traits[k].confidence >= 0.2)
    .map((k) => ({ trait: k, value: Math.round(other.hidden.traits[k].value * 100) / 100, gap: Math.round(Math.abs(user.hidden.traits[k].value - other.hidden.traits[k].value) * 100) / 100 }));
  const [mine, theirs] = [user.basics.age, other.basics.age];
  const approved = other.shared.items.filter((i) => i.status === 'approved').length + (other.shared.bio ? 1 : 0);
  return {
    type: 'pass',
    candidateId: other.id,
    name: other.name,
    aspects: known.length >= 3 ? known : [],
    away: !nearby(user.basics.city, other.basics.city),
    age: theirs,
    older: mine && theirs && mine !== theirs ? theirs > mine : null,
    thin: approved < 2,
  };
}

// First-date ideas for a match, from interests both chose to show. Low-key, public places
// first: a short first meeting is easier, and safer, than a whole evening.
const IDEAS = {
  hiking: 'a short walk somewhere green, with a coffee at the end', running: 'a slow Sunday run and breakfast after',
  cooking: 'a food market, picking one thing each to try', baking: 'a bakery crawl, rating the best pastry',
  reading: 'an hour in a good bookshop, then swapping a recommendation', music: 'a small gig or an open-mic night',
  concerts: 'a small gig on a weeknight', films: 'an old film at an independent cinema, then a drink to argue about it',
  art: 'a gallery for an hour, then a coffee', museums: 'a museum on a late-opening evening', photography: 'a walk with your cameras, swapping your best shot',
  coffee: 'coffee somewhere with good pastries', wine: 'a glass of wine at a quiet bar', 'board games': 'a board-game café',
  theatre: 'a matinee, then an early dinner', dancing: 'a beginners’ dance class', climbing: 'a bouldering session for beginners',
  cycling: 'a bike ride to somewhere with a view', yoga: 'a weekend yoga class, then brunch', gaming: 'an arcade bar',
  tennis: 'a friendly game of tennis', swimming: 'a lido and a hot chocolate after', gardening: 'a botanic garden',
  history: 'a walking tour of an old part of town', science: 'a science museum late', poetry: 'a poetry or storytelling night',
  dogs: 'a walk in a park with plenty of dogs', podcasts: 'a long walk, trading favourite episodes', languages: 'a language-exchange evening',
};

export function dateIdeas(me, other) {
  const common = me.shared.interests.filter((i) => other.shared.interests.includes(i) && IDEAS[i]);
  const ideas = common.slice(0, 3).map((i) => ({ interest: i, text: `You both like ${i}: ${IDEAS[i]}.`, message: `How about ${IDEAS[i]}?` }));
  if (ideas.length < 2) ideas.push({ interest: null, text: 'A coffee or a short walk: easy to arrange, easy to end.', message: 'Would you like to get a coffee or go for a short walk this week?' });
  return ideas;
}
