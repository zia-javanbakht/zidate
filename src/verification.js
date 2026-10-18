// Photo verification: a live selfie in a random pose, compared with the profile photos.
// Claude checks it when ANTHROPIC_API_KEY is set; otherwise (or when Claude is unsure)
// a moderator does. The badge covers the photos that were checked, so a photo added later
// is checked against the same selfie before the badge counts again.
import Anthropic from '@anthropic-ai/sdk';
import { now } from './clock.js';

export const POSES = [
  'Hold up a peace sign next to your face',
  'Give a thumbs up next to your chin',
  'Touch your nose with one finger',
  'Cover one eye with your hand',
  'Put your open hand flat on top of your head',
  'Point at the camera with one finger',
  'Rest your cheek on your hand',
];
export const POSE_MINUTES = 10;
export const ATTEMPTS_PER_DAY = 5;

export function verificationOf(user) {
  return (user.verification ||= { status: 'none', photoIds: [], attempts: [] });
}

// Verified, and every photo on the profile right now was checked.
export function isVerified(user) {
  const v = user.verification;
  const photos = user.photos || [];
  return Boolean(v?.status === 'verified' && photos.length && photos.every((p) => v.photoIds.includes(p.id)));
}

// What the person sees about their own verification. Never the moderator's notes on others.
export function verificationView(user) {
  const v = verificationOf(user);
  const unchecked = (user.photos || []).filter((p) => !v.photoIds.includes(p.id)).length;
  const pose = v.pose && Date.parse(v.pose.until) > Date.parse(now().toISOString()) ? v.pose : null;
  return {
    status: v.status,
    verified: isVerified(user),
    unchecked: v.status === 'verified' ? unchecked : 0,
    checkingNew: Boolean(v.checkingNew),
    pose: pose ? { text: pose.text, until: pose.until } : null,
    reason: v.status === 'failed' ? v.reason || '' : '',
    canAskModerator: v.status === 'failed' && Boolean(v.selfieId) && ['person', 'live'].includes(v.verdict),
    at: v.at || null,
  };
}

export function pickPose(previous) {
  const options = POSES.filter((p) => p !== previous);
  return options[Math.floor(Math.random() * options.length)];
}

// --- the Claude check ---
const MODEL = process.env.PISHI_MODEL || 'claude-opus-5-5';

export const CHECK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['liveCapture', 'poseMatches', 'samePerson', 'reason'],
  properties: {
    liveCapture: { type: 'boolean', description: 'The selfie looks like a fresh camera photo of a real person, not a photo of a screen, a print or a picture of a picture.' },
    poseMatches: { type: 'boolean', description: 'The person in the selfie is clearly doing the requested pose.' },
    samePerson: { type: 'string', enum: ['yes', 'no', 'unsure'], description: 'Whether the selfie shows the same person as the profile photos. "unsure" when a face is not clear enough to tell.' },
    reason: { type: 'string', description: 'One short neutral sentence for a moderator, about the checks only.' },
  },
};

const SYSTEM = `You check selfies for Pishi, a dating app, so people can trust that profiles are real.
You get a pose the person was asked to do, a selfie they just took, and their profile photos.
Answer three questions: is the selfie a live camera photo (not a screen, print or photo of a photo), does it show the requested pose, and is it the same person as in the profile photos.
Rules:
- Compare stable features (face shape, features, proportions). Ignore lighting, hair styling, glasses, make-up, weight changes and age differences of a few years.
- The same person only needs to appear in at least one profile photo; group photos are fine if one face matches.
- Say "unsure" rather than guess. A moderator looks at anything you are unsure about.
- reason: one neutral sentence about the checks. Never comment on attractiveness, ethnicity, age, health, body or anything else about how the person looks.`;

let defaultClient;

const image = ({ buf, mime }) => ({ type: 'image', source: { type: 'base64', media_type: mime, data: buf.toString('base64') } });

// The client is injectable so tests can exercise the decision without the network.
export function makeSelfieChecker(getClient = () => (defaultClient ||= new Anthropic())) {
  return {
    name: 'claude',
    async check({ pose, selfie, photos }) {
      const res = await getClient().beta.messages.create({
        model: MODEL,
        max_tokens: 600,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: CHECK_SCHEMA } },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `Requested pose: ${pose || '(none)'}\n\nThe selfie:` },
            image(selfie),
            { type: 'text', text: `Profile photos (${photos.length}):` },
            ...photos.map(image),
          ],
        }],
      });
      if (res.stop_reason === 'refusal') throw new Error('refusal');
      const out = JSON.parse(res.content.find((b) => b.type === 'text')?.text || '{}');
      if (typeof out.poseMatches !== 'boolean' || !['yes', 'no', 'unsure'].includes(out.samePerson)) throw new Error('bad check');
      return out;
    },
  };
}

const defaultChecker = makeSelfieChecker();

export function pickChecker() {
  if (process.env.PISHI_AGENT === 'offline') return null;
  return process.env.ANTHROPIC_API_KEY ? defaultChecker : null;
}

// Turn a check into an outcome: verified, failed (with a reason the person can act on), or review.
export function decide(result) {
  if (!result) return { status: 'pending' };
  if (!result.liveCapture) return { status: 'failed', verdict: 'live', reason: 'That looks like a photo of a screen or a print. Take a fresh selfie with your camera.' };
  if (!result.poseMatches) return { status: 'failed', verdict: 'pose', reason: 'I could not see the pose clearly. Try again with your face and hand in the picture.' };
  if (result.samePerson === 'yes') return { status: 'verified' };
  if (result.samePerson === 'no') return { status: 'failed', verdict: 'person', reason: 'The selfie did not seem to match your photos. Try again in good light, or ask a moderator to look.' };
  return { status: 'pending' };
}
