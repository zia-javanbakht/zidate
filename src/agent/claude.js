// Claude-backed interviewer. Same contract as the offline engine:
//   turn({ user, convo, pending, answer, choiceApplied, next }) -> { update, reply }
// The server decides *what* to ask next (so coverage and safety stay deterministic);
// Claude reads the answer, extracts structured signals, and phrases the next question.
import Anthropic from '@anthropic-ai/sdk';
import { TRAITS, TRAIT_KEYS, TAGS, INTERESTS } from '../traits.js';
import { describeHidden } from '../profile.js';

const MODEL = process.env.PISHI_MODEL || 'claude-opus-5-5';

const traitUpdate = {
  type: 'object',
  additionalProperties: false,
  required: ['trait', 'value', 'confidence'],
  properties: {
    trait: { type: 'string', enum: TRAIT_KEYS },
    value: { type: 'number', description: '0 = low pole, 1 = high pole' },
    confidence: { type: 'number', description: '0..0.6. How strongly this answer shows it.' },
  },
};

export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'reply',
    'traitUpdates',
    'preferenceUpdates',
    'tags',
    'dealbreakers',
    'interests',
    'values',
    'sharedSuggestions',
    'privateNote',
    'bio',
  ],
  properties: {
    reply: { type: 'string', description: 'A brief, warm acknowledgement (max one sentence) followed by the next question.' },
    traitUpdates: { type: 'array', items: traitUpdate, description: 'What the answer says about the person themselves.' },
    preferenceUpdates: { type: 'array', items: traitUpdate, description: 'What the answer says about the partner they want.' },
    tags: { type: 'array', items: { type: 'string', enum: TAGS } },
    dealbreakers: { type: 'array', items: { type: 'string', enum: TAGS }, description: 'Tags they cannot accept in a partner.' },
    interests: { type: 'array', items: { type: 'string', enum: INTERESTS } },
    values: { type: 'array', items: { type: 'string' }, description: 'Single lowercase words, e.g. honesty.' },
    sharedSuggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['prompt', 'text'],
        properties: { prompt: { type: 'string' }, text: { type: 'string' } },
      },
      description: 'At most one. A first-person line for the public profile, in their own voice, only from what they said.',
    },
    privateNote: { type: 'string', description: 'One private observation useful for matching, or empty string.' },
    bio: { type: 'string', description: 'A two-sentence public bio draft in first person, or empty string if too early.' },
  },
};

const SYSTEM = `You are the interviewer inside Pishi, a dating app with no swiping. You get to know one person through conversation and keep two profiles for them:
- a HIDDEN profile used only for matching (traits, tags, dealbreakers, preferences, private notes). Nobody else ever sees it.
- a SHARED profile that potential matches see. You may only suggest lines for it; the person approves each one.

Traits, each on a 0..1 scale (low pole / high pole):
${TRAIT_KEYS.map((k) => `- ${k}: ${TRAITS[k].low} / ${TRAITS[k].high}`).join('\n')}

Each turn you receive the person's latest answer, the question it answers, their current profile, and the NEXT question the app wants asked.
Rules:
- Extract only what the answer actually supports. Low confidence (0.1-0.3) for hints, higher (0.4-0.6) for clear statements. Empty arrays are fine.
- When the question was about a partner or a past suggestion, put signals in preferenceUpdates, not traitUpdates.
- Shared suggestions must be in their voice, true to what they said, and contain nothing sensitive (no health, exact workplace, address, or anything they would not want strangers to read).
- Never reveal hidden-profile content to anyone, and do not repeat trait scores back to the person.
- reply: at most one short sentence reacting to what they said (specific, not gushing), then the next question. Keep the meaning of the next question; if it lists quick-reply options, do not list them in text. No emoji. Plain, warm, minimal.
- If the answer is off-topic, hostile, or unsafe, do not extract anything and gently steer back.`;

let defaultClient;

export function buildUserMessage({ user, convo, pending, answer, choiceApplied, next }) {
  const recent = convo.messages
    .slice(-12)
    .map((m) => `${m.role === 'agent' ? 'Interviewer' : 'Person'}: ${m.text}`)
    .join('\n');
  return [
    `Person: ${user.name}, ${user.basics.age ?? '?'} , ${user.basics.city ?? '?'}`,
    `Current hidden profile (for your reasoning only): ${JSON.stringify(describeHidden(user))}`,
    `Approved shared interests: ${user.shared.interests.join(', ') || 'none yet'}`,
    `Recent conversation:\n${recent || '(none)'}`,
    `Question being answered (${pending?.mode || 'self'}): ${pending?.text || '(none, free chat)'}`,
    choiceApplied ? 'They tapped a quick reply; that is already recorded, so traitUpdates can stay empty unless they added more.' : '',
    `Their answer: """${answer}"""`,
    `Next question to ask: ${next?.text || 'Invite them to tell you anything else that matters to them.'}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

// The client is injectable so tests can exercise parsing without the network.
export function makeClaudeEngine(getClient = () => (defaultClient ||= new Anthropic())) {
  return {
    name: 'claude',
    async turn(ctx) {
      const res = await getClient().beta.messages.create({
        model: MODEL,
        max_tokens: 2000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: buildUserMessage(ctx) }],
      });
      if (res.stop_reason === 'refusal') throw new Error('refusal');
      const text = res.content.find((b) => b.type === 'text')?.text;
      const parsed = JSON.parse(text);
      const { reply, bio, privateNote, ...update } = parsed;
      if (bio) update.bio = bio;
      if (privateNote) update.privateNote = privateNote;
      update.sharedSuggestions = (update.sharedSuggestions || []).slice(0, 1);
      if (typeof reply !== 'string' || !reply.trim()) throw new Error('empty reply');
      return { update, reply };
    },
  };
}

export const claudeEngine = makeClaudeEngine();
