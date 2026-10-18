// What is still missing from each profile, as a short to-do list with one action per step.
// Shown on the "You" page and used by the matchmaker to nudge in the conversation.
import { TRAIT_KEYS, CORE_TRAITS } from './traits.js';
import { basicsDone, completeness, READY } from './profile.js';

const DEEPER_TRAITS = TRAIT_KEYS.filter((k) => !CORE_TRAITS.includes(k));
const TALK = { href: '#/talk', label: 'Talk to your matchmaker' };
const EDIT = { href: '#/profile', label: 'Edit your profile' };

function approved(user) {
  return user.shared.items.filter((i) => i.status === 'approved').length;
}

function shownFacts(user) {
  return Object.values(user.shared.facts || {}).filter((f) => f.status === 'approved').length;
}

function knownPreferences(user) {
  return Object.values(user.hidden.preference || {}).filter((p) => p.confidence >= 0.2).length;
}

export function hiddenSteps(user) {
  const h = user.hidden;
  const deeper = DEEPER_TRAITS.filter((k) => h.traits[k].confidence >= 0.25).length;
  return [
    { id: 'basics', label: 'The basics: who you are looking for, your age and city', done: basicsDone(user), action: TALK },
    { id: 'core', label: 'Enough about you to start matching', done: completeness(user) >= READY, action: TALK },
    { id: 'partner', label: 'What you want in a partner', done: knownPreferences(user) >= 3, action: { ...TALK, label: 'Tell me about them' } },
    { id: 'deeper', label: 'The deeper things: affection, disagreements, home, humour', done: deeper >= 3, action: { ...TALK, label: 'Keep talking' } },
    { id: 'care', label: 'How you feel cared for, and how fast you like things to move', done: Boolean(h.aspects?.loveLanguage && h.aspects?.pace), action: TALK },
    { id: 'dealbreakers', label: 'Your dealbreakers', done: h.dealbreakers.length > 0 || Boolean(user.guide?.noDealbreakers), action: { href: '#/profile/dealbreakers', label: 'Review dealbreakers' } },
  ];
}

export function sharedSteps(user) {
  const s = user.shared;
  const waiting = s.items.filter((i) => i.status === 'suggested').length + Object.values(s.facts || {}).filter((f) => f.status === 'suggested').length;
  return [
    { id: 'photo', label: 'A photo', done: (user.photos || []).length > 0, action: { href: '#/profile/photos', label: 'Add a photo' } },
    { id: 'bio', label: 'A short bio', done: Boolean(s.bio), action: { href: '#/profile/bio', label: s.bioDraft ? 'Look at your suggested bio' : 'Write a bio' } },
    { id: 'lines', label: 'Three lines in your own voice', done: approved(user) >= 3, action: { href: '#/profile/lines', label: waiting ? 'Review suggestions' : 'Add a line' } },
    { id: 'review', label: 'Nothing waiting for your approval', done: waiting === 0, action: { href: '#/profile/lines', label: `Review ${waiting} suggestion${waiting === 1 ? '' : 's'}` } },
    { id: 'facts', label: 'A few facts: work, languages, kids and so on', done: shownFacts(user) >= 3, action: { href: '#/profile/facts', label: 'Add facts' } },
    { id: 'interests', label: 'Three interests', done: s.interests.length >= 3, action: { ...EDIT, href: '#/profile/interests', label: 'Add interests' } },
  ];
}

function part(steps) {
  const done = steps.filter((s) => s.done).length;
  return { percent: Math.round((done / steps.length) * 100), steps };
}

// Both profiles' progress and the single most useful next step.
// The hidden profile comes first until matching can start; then the shared one,
// because a fuller shared profile is what makes the other person say yes.
export function profileGuide(user) {
  const hidden = part(hiddenSteps(user));
  const shared = part(sharedSteps(user));
  const order = basicsDone(user) && completeness(user) >= READY
    ? [...shared.steps, ...hidden.steps]
    : [...hidden.steps.slice(0, 2), ...shared.steps, ...hidden.steps.slice(2)];
  const next = order.find((s) => !s.done) || null;
  return { hidden, shared, next, complete: !next };
}
