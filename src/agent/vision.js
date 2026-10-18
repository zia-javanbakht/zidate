// Claude vision: describes one profile photo in the fixed style words of looks.js.
// Same shape as the other engines: describe({ buf, mime }) -> { people, tags }.
// There is no offline version: without Claude, photos are simply not described and
// looks play no part in matching.
import Anthropic from '@anthropic-ai/sdk';
import { LOOK_TAGS } from '../looks.js';

const MODEL = process.env.PISHI_MODEL || 'claude-opus-5-5';

export const VISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['people', 'tags'],
  properties: {
    people: { type: 'integer', description: 'How many people are clearly visible. 0 if none.' },
    tags: {
      type: 'array',
      items: { type: 'string', enum: LOOK_TAGS },
      description: 'Every word that plainly fits the main person and the photo. Empty when unsure.',
    },
  },
};

const SYSTEM = `You describe one profile photo for Pishi, a dating app, so the matchmaker can learn which styles a person tends to like.
Use only the allowed words, and only those that plainly fit the main person and the photo.
Never describe or guess ethnicity, skin colour, body shape or size, weight, attractiveness, age, health, disability, religion or sexuality. Those are not in the word list on purpose; do not hint at them.
If there is no person, or several people and it is unclear who the profile belongs to, still count the people and return the setting words only.`;

let defaultClient;

export function makeVisionEngine(getClient = () => (defaultClient ||= new Anthropic())) {
  return {
    name: 'claude',
    async describe({ buf, mime }) {
      const res = await getClient().beta.messages.create({
        model: MODEL,
        max_tokens: 1000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: VISION_SCHEMA } },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: buf.toString('base64') } },
            { type: 'text', text: 'Describe this profile photo.' },
          ],
        }],
      });
      if (res.stop_reason === 'refusal') throw new Error('refusal');
      const parsed = JSON.parse(res.content.find((b) => b.type === 'text')?.text);
      return { people: Number(parsed.people) || 0, tags: parsed.tags };
    },
  };
}

// Claude when a key is set, otherwise nothing (looks are then left out of matching).
export function pickVision() {
  if (process.env.PISHI_AGENT === 'offline' || !process.env.ANTHROPIC_API_KEY) return null;
  return makeVisionEngine();
}
