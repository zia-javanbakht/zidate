// The weekly two: see them, decide, widen the search, report.
import { weeklyPicks, compatibility } from '../matching.js';
import { queueEvent } from '../agent/index.js';
import { learnFromLike, createMatch } from '../social.js';
import { cleanText } from '../profile.js';
import { weekKey, now } from '../clock.js';

export default function week(ctx) {
  const { store, route, HttpError } = ctx;

  route('GET', '/api/week', async ({ user }) => ({ body: weeklyPicks(store, user) }));

  // An empty or short week: widen the age range and look again.
  route('POST', '/api/week/widen', async ({ user }) => {
    const steps = [3, 5, 8, 10, 15, 20];
    const cur = user.basics.ageRange ?? 8;
    const next = steps.find((s) => s > cur) ?? cur;
    user.basics.ageRange = next;
    const key = `${user.id}:${weekKey()}`;
    const wk = store.data.weeks[key];
    // Keep decisions already made; only refill when the week had room.
    if (wk && wk.picks.every((p) => !p.decision)) delete store.data.weeks[key];
    return { body: { ageRange: next, ...weeklyPicks(store, user) } };
  });

  route('POST', '/api/week/:id', async ({ user, params, body }) => {
    const decision = body.decision;
    if (!['like', 'pass'].includes(decision)) throw new HttpError(400, 'Decide like or pass.');
    const wk = store.data.weeks[`${user.id}:${weekKey()}`];
    const pick = wk?.picks.find((p) => p.id === params.id);
    if (!pick) throw new HttpError(404, 'That person is not in your suggestions this week.');
    if (pick.decision) throw new HttpError(409, 'You already decided.');
    const other = store.data.users[params.id];
    if (!other) throw new HttpError(404, 'That person has left.');
    pick.decision = decision;
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
    if (!match) queueEvent(convo, { type: decision, candidateId: other.id, name: other.name });
    return { body: { decision, match: match ? { id: match.id } : null } };
  });

  // Report someone straight from a suggestion. They are never suggested again.
  route('POST', '/api/week/:id/report', async ({ user, params, body }) => {
    const wk = store.data.weeks[`${user.id}:${weekKey()}`];
    const pick = wk?.picks.find((p) => p.id === params.id);
    if (!pick) throw new HttpError(404, 'That person is not in your suggestions this week.');
    pick.decision ||= 'pass';
    store.data.blocks[`${user.id}>${params.id}`] = now().toISOString();
    store.data.reports.push({ id: store.id('r'), by: user.id, about: params.id, reason: cleanText(body.reason, 500) || 'Reported from a suggestion', at: now().toISOString(), status: 'open', source: 'suggestion' });
    return { body: { ok: true } };
  });
}
