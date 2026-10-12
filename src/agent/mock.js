// Offline interviewer: deterministic, no network. Used when no API key is set, in tests,
// and as the fallback when a Claude call fails.
import { scoreTraits, findInterests, findTags, findDealbreakers, toSharedText, findValues } from './analyze.js';
import { TRAITS, TRAIT_KEYS } from '../traits.js';

function hash(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

const ACKS = ['Got it.', 'That helps.', 'Good to know.', 'Thank you, that is useful.', 'Noted.', 'I like that.'];

function ack(answer, update, pending, choice, previous) {
  if (choice?.ack) return choice.ack;
  if (pending?.mode === 'partner' && pending.id?.startsWith('fb')) return 'Thanks, that will shape who I suggest next.';
  const interests = update.interests || [];
  if (interests.length >= 2) return `${cap(interests[0])} and ${interests[1]}, noted.`;
  if (interests.length === 1) return `${cap(interests[0])}, noted.`;
  if (answer.trim().split(/\s+/).length <= 2 && !pending?.choices) return 'Could you say a little more next time? Short answers are fine, but detail helps me find the right people.';
  // Never open two replies in a row the same way.
  const options = ACKS.filter((a) => !previous?.startsWith(a));
  return options[hash(answer) % options.length];
}

function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function draftBio(user) {
  const t = user.hidden.traits;
  const strong = TRAIT_KEYS
    .filter((k) => t[k].confidence >= 0.3 && Math.abs(t[k].value - 0.5) > 0.15)
    .sort((a, b) => Math.abs(t[b].value - 0.5) * t[b].confidence - Math.abs(t[a].value - 0.5) * t[a].confidence)
    .slice(0, 2)
    .map((k) => (t[k].value > 0.5 ? TRAITS[k].high : TRAITS[k].low));
  const interests = user.shared.interests.slice(0, 3);
  const parts = [];
  if (strong.length) parts.push(cap(strong.join(', ')) + '.');
  if (interests.length) {
    const list = interests.length > 1 ? `${interests.slice(0, -1).join(', ')} and ${interests.at(-1)}` : interests[0];
    parts.push(`Happiest with ${list}.`);
  }
  return parts.join(' ') || null;
}

export const mockEngine = {
  name: 'offline',
  async turn({ convo, pending, answer, choiceApplied, choice, next }) {
    const update = { traitUpdates: [], preferenceUpdates: [], tags: [], dealbreakers: [], interests: [], values: [], sharedSuggestions: [] };
    const partner = pending?.mode === 'partner';
    if (!choiceApplied) {
      const traits = scoreTraits(answer);
      if (partner) update.preferenceUpdates = traits;
      else update.traitUpdates = traits;
      if (!partner) {
        update.interests = findInterests(answer);
        update.tags = findTags(answer);
        update.values = findValues(answer);
      }
      if (pending?.id === 'q_dealbreakers' || pending?.id === 'q_partner_trait') update.dealbreakers = findDealbreakers(answer);
      if (pending?.share) {
        const text = toSharedText(answer);
        if (text) update.sharedSuggestions.push({ prompt: pending.share, text });
      }
      if (partner && pending?.id?.startsWith('fb')) update.privateNote = `On a suggestion: "${answer.slice(0, 160)}"`;
      if (pending?.id === 'q_partner_trait') update.privateNote = `Needs in a partner: "${answer.slice(0, 160)}"`;
    }
    const previous = convo?.messages.filter((m) => m.role === 'agent').at(-1)?.text;
    const lead = answer ? ack(answer, update, pending, choice, previous) : '';
    return { update, reply: [lead, next?.text].filter(Boolean).join(' ') };
  },
};
