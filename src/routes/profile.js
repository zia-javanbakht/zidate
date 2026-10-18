// Both profiles: approving and writing shared lines, bio, interests, photos, dealbreakers,
// and correcting the hidden profile.
import { basicsDone, describeHidden, publicProfile, cleanText, cleanFact, hasContactInfo, settingsOf } from '../profile.js';
import { askNow } from '../agent/index.js';
import { INTERESTS, TAGS, FACTS, FACT_KEYS } from '../traits.js';
import { decodeUpload, mimeFor, MAX_PHOTOS } from '../photos.js';
import { matchId, currentWeek } from '../matching.js';
import { profileGuide } from '../guide.js';
import { isAbusive } from '../moderation.js';

const NO_CONTACT = 'Keep contact details off your profile. You can share them once you match.';
export const PROMPTS = [
  'My ideal Sunday', 'A trip I still think about', 'What I do and why I like it', 'Something I could talk about for hours',
  'What makes me laugh', 'What matters most to me', "Something I'm proud of", 'How my friends describe me',
  'Where I want to be in five years', 'A tradition I want to keep', 'Something that changed my mind',
  'How I like to spend a free afternoon', 'The way to win me over', 'A small thing that makes my day',
  'My idea of a great first date', 'Green flags I look for', 'What my home says about me', 'Something I keep just for me',
  'A story that still makes me laugh',
];

// Opening questions (as Bumble's Opening Moves): up to three questions a match can answer
// to start the conversation, so nobody has to think of a first line.
export const OPENERS = [
  'What is the best thing you ate this week?', 'What are you looking forward to right now?',
  'What would a perfect Saturday look like for you?', 'Two truths and a lie: go.',
  'What is a small thing that always makes your day?', 'What is the last thing you got really excited about?',
  'Which place would you go back to tomorrow?', 'What are you better at than most people?',
];
export const MAX_OPENERS = 3;

export default function profile({ store, route, HttpError, meView, photos, serial }) {
  route('GET', '/api/profile', async ({ user }) => ({
    body: {
      shared: user.shared,
      photos: (user.photos || []).map((p) => ({ id: p.id, url: `/api/photos/${p.id}` })),
      preview: publicProfile(user, { showPhotos: true }),
      hidden: describeHidden(user),
      guide: profileGuide(user),
      prompts: PROMPTS,
      openers: OPENERS,
      interests: INTERESTS,
      tags: TAGS,
      facts: FACTS,
      me: meView(user),
    },
  }));

  route('POST', '/api/profile/items/approve-all', async ({ user }) => {
    let n = 0;
    for (const i of user.shared.items) if (i.status === 'suggested') (i.status = 'approved'), n++;
    return { body: { approved: n } };
  });

  // Write your own line, not only the matchmaker's suggestions.
  route('POST', '/api/profile/items', async ({ user, body }) => {
    const prompt = cleanText(body.prompt, 80);
    const text = cleanText(body.text, 300);
    if (!PROMPTS.includes(prompt)) throw new HttpError(400, 'Pick one of the prompts.');
    if (!text) throw new HttpError(400, 'Write something first.');
    if (hasContactInfo(text)) throw new HttpError(400, NO_CONTACT);
    if (user.shared.items.length >= 30) throw new HttpError(400, 'That is plenty. Remove one first.');
    const item = { id: `it_${Math.random().toString(36).slice(2, 10)}`, prompt, text, status: 'approved', own: true };
    user.shared.items.push(item);
    return { status: 201, body: { item } };
  });

  route('PATCH', '/api/profile/items/:id', async ({ user, params, body }) => {
    const item = user.shared.items.find((i) => i.id === params.id);
    if (!item) throw new HttpError(404, 'Not found.');
    if (body.status) {
      if (!['approved', 'hidden', 'suggested'].includes(body.status)) throw new HttpError(400, 'Unknown status.');
      item.status = body.status;
    }
    if (typeof body.text === 'string') {
      const text = cleanText(body.text, 300);
      if (!text) throw new HttpError(400, 'It cannot be empty.');
      if (hasContactInfo(text)) throw new HttpError(400, NO_CONTACT);
      item.text = text;
    }
    return { body: { item } };
  });

  route('DELETE', '/api/profile/items/:id', async ({ user, params }) => {
    user.shared.items = user.shared.items.filter((i) => i.id !== params.id);
    return { body: { ok: true } };
  });

  route('PUT', '/api/profile/openers', async ({ user, body }) => {
    const list = Array.isArray(body.openers) ? body.openers : [];
    const out = [];
    for (const raw of list) {
      const text = cleanText(raw, 120);
      if (!text || out.includes(text)) continue;
      if (hasContactInfo(text)) throw new HttpError(400, NO_CONTACT);
      if (isAbusive(text)) throw new HttpError(422, 'Please keep it kind.');
      out.push(text);
    }
    if (out.length > MAX_OPENERS) throw new HttpError(400, `Up to ${MAX_OPENERS} questions.`);
    user.shared.openers = out;
    return { body: { openers: out } };
  });

  route('PUT', '/api/profile/bio', async ({ user, body }) => {
    const bio = cleanText(body.useDraft ? user.shared.bioDraft : body.text, 400);
    if (hasContactInfo(bio)) throw new HttpError(400, NO_CONTACT);
    user.shared.bio = bio;
    if (body.useDraft) user.shared.bioDraft = '';
    return { body: { bio: user.shared.bio } };
  });

  // "That's not me": forget most of what we inferred and ask directly.
  route('POST', '/api/profile/traits/:key/recheck', async ({ user, params }) => serial(user.id, async () => {
    const t = user.hidden.traits[params.key];
    if (!t) throw new HttpError(404, 'Not found.');
    user.hidden.traits[params.key] = { value: 0.5, confidence: t.confidence * 0.3 };
    const convo = store.data.conversations[user.id];
    convo.events = convo.events.filter((e) => !(e.type === 'recheck' && e.trait === params.key));
    convo.events.unshift({ type: 'recheck', trait: params.key });
    if (basicsDone(user)) askNow(user, convo);
    return { body: { ok: true } };
  }));

  // Facts (work, languages, kids…): set several at once. An empty value removes one.
  // Anything the person sets themselves is shown straight away.
  route('PUT', '/api/profile/facts', async ({ user, body }) => {
    const input = body.facts && typeof body.facts === 'object' ? body.facts : {};
    user.shared.facts ||= {};
    for (const [key, raw] of Object.entries(input)) {
      if (!FACTS[key]) throw new HttpError(400, 'Unknown fact.');
      if (!cleanText(raw, 60)) {
        delete user.shared.facts[key];
        continue;
      }
      if (!FACTS[key].options && hasContactInfo(raw)) throw new HttpError(400, NO_CONTACT);
      const value = cleanFact(key, raw);
      if (!value) throw new HttpError(400, `Pick one of the options for ${FACTS[key].label.toLowerCase()}.`);
      user.shared.facts[key] = { value, status: 'approved' };
    }
    return { body: { facts: user.shared.facts } };
  });

  // Show or hide one fact, e.g. a suggestion from the matchmaker.
  route('PATCH', '/api/profile/facts/:key', async ({ user, params, body }) => {
    const fact = user.shared.facts?.[params.key];
    if (!fact) throw new HttpError(404, 'Not found.');
    if (!['approved', 'hidden', 'suggested'].includes(body.status)) throw new HttpError(400, 'Unknown status.');
    fact.status = body.status;
    return { body: { fact } };
  });

  route('POST', '/api/profile/facts/approve-all', async ({ user }) => {
    let n = 0;
    for (const k of FACT_KEYS) {
      const f = user.shared.facts?.[k];
      if (f?.status === 'suggested') (f.status = 'approved'), n++;
    }
    return { body: { approved: n } };
  });

  // Limits learned from passes live in the hidden profile, but the person can lift them.
  route('DELETE', '/api/profile/limits/:key', async ({ user, params }) => {
    const l = (user.hidden.limits ||= {});
    const keys = { localOnly: ['localOnly'], age: ['ageMin', 'ageMax'], prefersDetail: ['prefersDetail'] }[params.key];
    if (!keys) throw new HttpError(404, 'Not found.');
    for (const k of keys) delete l[k];
    return { body: { limits: describeHidden(user).limits } };
  });

  route('POST', '/api/profile/interests', async ({ user, body }) => {
    const name = String(body.name || '').toLowerCase();
    if (!INTERESTS.includes(name)) throw new HttpError(400, 'Pick one from the list.');
    if (!user.shared.interests.includes(name)) {
      if (user.shared.interests.length >= 12) throw new HttpError(400, 'Twelve is the limit. Remove one first.');
      user.shared.interests.push(name);
    }
    user.shared.suggestedInterests = (user.shared.suggestedInterests || []).filter((i) => i !== name);
    return { body: { interests: user.shared.interests } };
  });

  // Interests the matchmaker heard: add them all, or let them go.
  route('POST', '/api/profile/interests/suggested', async ({ user, body }) => {
    const s = user.shared;
    const take = body.action === 'add' ? (s.suggestedInterests || []).filter((i) => !s.interests.includes(i)) : [];
    s.interests = [...s.interests, ...take].slice(0, 12);
    s.suggestedInterests = [];
    return { body: { interests: s.interests } };
  });

  route('DELETE', '/api/profile/interests/:name', async ({ user, params }) => {
    user.shared.interests = user.shared.interests.filter((i) => i !== params.name);
    return { body: { interests: user.shared.interests } };
  });

  // Dealbreakers live in the hidden profile, but they are the person's to edit.
  route('POST', '/api/profile/dealbreakers', async ({ user, body }) => {
    const tag = String(body.tag || '');
    if (!TAGS.includes(tag)) throw new HttpError(400, 'Pick one from the list.');
    if (!user.hidden.dealbreakers.includes(tag)) user.hidden.dealbreakers.push(tag);
    return { body: { dealbreakers: user.hidden.dealbreakers } };
  });

  // "I have none" also counts as having thought about it.
  route('POST', '/api/profile/dealbreakers/none', async ({ user }) => {
    user.guide = { ...user.guide, noDealbreakers: true };
    return { body: { guide: profileGuide(user) } };
  });

  route('DELETE', '/api/profile/dealbreakers/:tag', async ({ user, params }) => {
    user.hidden.dealbreakers = user.hidden.dealbreakers.filter((t) => t !== params.tag);
    return { body: { dealbreakers: user.hidden.dealbreakers } };
  });

  // --- photos ---
  route('POST', '/api/photos', async ({ user, body }) => {
    user.photos ||= [];
    if (user.photos.length >= MAX_PHOTOS) throw new HttpError(400, `Up to ${MAX_PHOTOS} photos. Remove one first.`);
    const { buf, type, error } = decodeUpload(body.data);
    if (error) throw new HttpError(400, error);
    const id = photos.save(buf, type);
    user.photos.push({ id, at: new Date().toISOString() });
    return { status: 201, body: { photo: { id, url: `/api/photos/${id}` } } };
  }, { bodyLimit: 4.5 * 1024 * 1024 });

  route('DELETE', '/api/photos/:id', async ({ user, params }) => {
    const before = (user.photos || []).length;
    user.photos = (user.photos || []).filter((p) => p.id !== params.id);
    if (user.photos.length === before) throw new HttpError(404, 'Not found.');
    photos.remove(params.id);
    return { body: { ok: true } };
  });

  // Make one photo the first one people see.
  route('POST', '/api/photos/:id/main', async ({ user, params }) => {
    const i = (user.photos || []).findIndex((p) => p.id === params.id);
    if (i < 0) throw new HttpError(404, 'Not found.');
    user.photos.unshift(...user.photos.splice(i, 1));
    return { body: { ok: true } };
  });

  // Who may see a photo: its owner, a match, or someone it was suggested to if the owner allows it.
  function maySee(viewer, owner) {
    if (viewer.id === owner.id) return true;
    if (store.data.matches[matchId(viewer.id, owner.id)]) return true;
    if (settingsOf(owner).photosAfterMatch) return false;
    return Boolean(store.data.weeks[`${viewer.id}:${currentWeek(viewer)}`]?.picks.some((p) => p.id === owner.id));
  }

  route('GET', '/api/photos/:id', async ({ user, params, res }) => {
    const owner = Object.values(store.data.users).find((u) => (u.photos || []).some((p) => p.id === params.id));
    const buf = owner && maySee(user, owner) ? photos.read(params.id) : null;
    if (!buf) throw new HttpError(404, 'Not found.');
    res.writeHead(200, { 'Content-Type': mimeFor(params.id), 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
    return { handled: true };
  });
}
