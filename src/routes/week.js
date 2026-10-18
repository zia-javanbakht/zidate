// The weekly two: see them, decide, widen the search, report.
import { weeklyPicks, compatibility, currentWeek } from '../matching.js';
import { queueEvent, askNow } from '../agent/index.js';
import { TRAIT_KEYS } from '../traits.js';
import { normalizeCity } from '../cities.js';
import { learnFromLike, createMatch } from '../social.js';
import { cleanText } from '../profile.js';
import { now } from '../clock.js';
import { noteDecision, noteReport } from '../signals.js';

export default function week(ctx) {
  const { store, route, HttpError } = ctx;

  route('GET', '/api/week', async ({ user }) => ({ body: weeklyPicks(store, user) }));

  // An empty or short week: widen the age range and look again.
  route('POST', '/api/week/widen', async ({ user }) => {
    const steps = [3, 5, 8, 10, 15, 20];
    const cur = user.basics.ageRange ?? 8;
    const next = steps.find((s) => s > cur) ?? cur;
    user.basics.ageRange = next;
    // Widening also lifts age limits learned from passes.
    if (user.hidden.limits) for (const k of ['ageMin', 'ageMax']) delete user.hidden.limits[k];
    const key = `${user.id}:${currentWeek(user)}`;
    const wk = store.data.weeks[key];
    // Keep decisions already made; only refill when the week had room.
    if (wk && wk.picks.every((p) => !p.decision)) delete store.data.weeks[key];
    return { body: { ageRange: next, ...weeklyPicks(store, user) } };
  });

  route('POST', '/api/week/:id', async ({ user, params, body }) => {
    const decision = body.decision;
    if (!['like', 'pass'].includes(decision)) throw new HttpError(400, 'Decide like or pass.');
    const wk = store.data.weeks[`${user.id}:${currentWeek(user)}`];
    const pick = wk?.picks.find((p) => p.id === params.id);
    if (!pick) throw new HttpError(404, 'That person is not in your suggestions this week.');
    if (pick.decision) throw new HttpError(409, 'You already decided.');
    const other = store.data.users[params.id];
    if (!other) throw new HttpError(404, 'That person has left.');
    pick.decision = decision;
    noteDecision(store, user, other, { liked: decision === 'like', shownAt: wk.createdAt });
    const convo = store.data.conversations[user.id];
    let match = null;
    if (decision === 'pass') store.data.passes[`${user.id}>${other.id}`] = now().toISOString();
    if (decision === 'like') {
      store.data.likes[`${user.id}>${other.id}`] = now().toISOString();
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
  });

  // Report someone straight from a suggestion. They are never suggested again.
  route('POST', '/api/week/:id/report', async ({ user, params, body }) => {
    const wk = store.data.weeks[`${user.id}:${currentWeek(user)}`];
    const pick = wk?.picks.find((p) => p.id === params.id);
    if (!pick) throw new HttpError(404, 'That person is not in your suggestions this week.');
    pick.decision ||= 'pass';
    store.data.blocks[`${user.id}>${params.id}`] = now().toISOString();
    noteReport(store, params.id);
    store.data.reports.push({ id: store.id('r'), by: user.id, about: params.id, reason: cleanText(body.reason, 500) || 'Reported from a suggestion', at: now().toISOString(), status: 'open', source: 'suggestion' });
    return { body: { ok: true } };
  });
}

// What the "why did you pass" questions may offer. Built here, where both people are known;
// only neutral labels ever reach the person, never the other person's hidden values.
function passEvent(user, other) {
  const differ = TRAIT_KEYS
    .filter((k) => user.hidden.traits[k].confidence >= 0.2 && other.hidden.traits[k].confidence >= 0.2)
    .map((k) => ({ trait: k, value: other.hidden.traits[k].value, gap: Math.abs(user.hidden.traits[k].value - other.hidden.traits[k].value) }))
    .filter((a) => a.gap >= 0.2)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3)
    .map(({ trait, value }) => ({ trait, value: Math.round(value * 100) / 100 }));
  const [mine, theirs] = [user.basics.age, other.basics.age];
  const approved = other.shared.items.filter((i) => i.status === 'approved').length + (other.shared.bio ? 1 : 0);
  return {
    type: 'pass',
    candidateId: other.id,
    name: other.name,
    aspects: differ,
    away: normalizeCity(user.basics.city) !== normalizeCity(other.basics.city),
    age: theirs,
    older: mine && theirs && mine !== theirs ? theirs > mine : null,
    thin: approved < 2,
  };
}
