// The weekly two: see them, decide, widen the search, report.
import { weeklyPicks, compatibility, currentWeek, available, fillWeek, canWiden, PER_WEEK } from '../matching.js';
import { queueEvent, askNow } from '../agent/index.js';
import { TRAIT_KEYS } from '../traits.js';
import { nearby } from '../cities.js';
import { learnFromLike, createMatch } from '../social.js';
import { cleanText } from '../profile.js';
import { now } from '../clock.js';
import { noteDecision } from '../signals.js';
import { screenMessage } from '../moderation.js';
import { settingsOf } from '../profile.js';

export default function week(ctx) {
  const { store, route, HttpError, serial } = ctx;

  route('GET', '/api/week', async ({ user }) => ({ body: weeklyPicks(store, user) }), { saves: true });

  // A short week: look further (more age range, and lift limits learned from passes),
  // then top the week up. People already in it, and decisions already made, stay.
  route('POST', '/api/week/widen', async ({ user }) => serial(user.id, async () => {
    const wk = weeklyPicks(store, user);
    if (!wk.ready || wk.paused) throw new HttpError(409, 'There is nothing to widen yet.');
    const week = store.data.weeks[`${user.id}:${currentWeek(user)}`];
    if (week.picks.length >= PER_WEEK || !canWiden(user)) throw new HttpError(409, 'This week is already full.');
    const steps = [3, 5, 8, 10, 15, 20];
    const cur = user.basics.ageRange ?? 8;
    user.basics.ageRange = steps.find((s) => s > cur) ?? cur;
    const lifted = [];
    const l = (user.hidden.limits ||= {});
    if (l.localOnly) lifted.push('city');
    if (l.ageMin != null || l.ageMax != null) lifted.push('age');
    for (const k of ['localOnly', 'ageMin', 'ageMax']) delete l[k];
    const added = fillWeek(store, user, week);
    return { body: { ageRange: user.basics.ageRange, lifted, added, ...weeklyPicks(store, user) } };
  }));

  route('POST', '/api/week/:id', async ({ user, params, body }) => serial(user.id, async () => {
    const decision = body.decision;
    if (!['like', 'pass'].includes(decision)) throw new HttpError(400, 'Decide like or pass.');
    const wk = store.data.weeks[`${user.id}:${currentWeek(user)}`];
    const pick = wk?.picks.find((p) => p.id === params.id);
    if (!pick) throw new HttpError(404, 'That person is not in your suggestions this week.');
    const other = store.data.users[params.id];
    if (!available(store, user, other)) throw new HttpError(404, 'That person is no longer available.');
    if (pick.decision) throw new HttpError(409, 'You already decided.');
    const liked = decision === 'like' ? likedPart(user, other, body) : null;
    pick.decision = decision;
    noteDecision(store, user, other, { liked: decision === 'like', shownAt: wk.createdAt });
    const convo = store.data.conversations[user.id];
    let match = null;
    if (decision === 'pass') {
      store.data.passes[`${user.id}>${other.id}`] = now().toISOString();
      delete store.data.likeNotes?.[`${other.id}>${user.id}`]; // their note has been read and answered
    }
    if (decision === 'like') {
      store.data.likes[`${user.id}>${other.id}`] = now().toISOString();
      if (liked) (store.data.likeNotes ||= {})[`${user.id}>${other.id}`] = { ...liked, at: now().toISOString() };
      learnFromLike(user, other);
      // Demo people answer instantly, and only if they would like this person too.
      if (other.demo && compatibility(other, user) >= 0.6) store.data.likes[`${other.id}>${user.id}`] = now().toISOString();
      if (store.data.likes[`${other.id}>${user.id}`]) match = createMatch(ctx, user, other);
    }
    if (!match && decision === 'pass') {
      queueEvent(convo, passEvent(user, other));
      // Ask why straight away, unless another question about a suggestion is already waiting.
      if (convo.pending?.kind !== 'feedback') askNow(user, convo);
    } else if (!match) queueEvent(convo, { type: decision, candidateId: other.id, name: other.name });
    return { body: { decision, match: match ? { id: match.id } : null } };
  }));

  // Like one particular line or photo, optionally with a note (as on Hinge). It reaches
  // them on their own suggestion card, and opens the conversation once you match.
  function likedPart(user, other, body) {
    const on = body.on;
    const note = cleanText(body.note, 200);
    if (!on && !note) return null;
    let part = null;
    if (on?.kind === 'item') {
      const item = other.shared.items.filter((i) => i.status === 'approved')[Number(on.index)];
      if (!item) throw new HttpError(400, 'That line is no longer on their profile.');
      part = { kind: 'item', prompt: item.prompt || null, text: item.text };
    } else if (on?.kind === 'photo') {
      // Only a photo this person was allowed to see.
      const photo = settingsOf(other).photosAfterMatch ? null : (other.photos || [])[Number(on.index)];
      if (!photo) throw new HttpError(400, 'That photo is not available.');
      part = { kind: 'photo', photoId: photo.id };
    } else if (on) throw new HttpError(400, 'Like a line or a photo.');
    if (note) {
      const problem = screenMessage(store, user, note, { noContact: true, at: now().toISOString() });
      if (problem) throw new HttpError(422, problem);
    }
    return { on: part, note };
  }

  // Report someone straight from a suggestion. They are never suggested again.
  route('POST', '/api/week/:id/report', async ({ user, params, body }) => {
    const wk = store.data.weeks[`${user.id}:${currentWeek(user)}`];
    const pick = wk?.picks.find((p) => p.id === params.id);
    if (!pick) throw new HttpError(404, 'That person is not in your suggestions this week.');
    pick.decision ||= 'pass';
    store.data.blocks[`${user.id}>${params.id}`] = now().toISOString();
    store.data.reports.push({ id: store.id('r'), by: user.id, about: params.id, reason: cleanText(body.reason, 500) || 'Reported from a suggestion', at: now().toISOString(), status: 'open', source: 'suggestion' });
    return { body: { ok: true } };
  });
}

// What the "why did you pass" questions may offer. Built here, where both people are known;
// only neutral labels ever reach the person, never the other person's hidden values.
function passEvent(user, other) {
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
