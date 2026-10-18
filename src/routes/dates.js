// Share Date: plans for meeting a match, sent to a trusted contact, and the safety check after.
import { cleanText, settingsOf } from '../profile.js';
import { now } from '../clock.js';
import { activePlan, datesOf, planView, shareMail, safeMail, cancelMail, SHARES_PER_DAY } from '../safety.js';

const DAY = 864e5;

export default function dates(ctx) {
  const { store, route, HttpError } = ctx;

  function ownPlan(user, id) {
    const d = store.data.dates?.[id];
    if (!d || d.userId !== user.id) throw new HttpError(404, 'Not found.');
    return d;
  }

  route('POST', '/api/matches/:id/date', async ({ user, params, body }) => {
    const m = store.data.matches[params.id];
    if (!m || !m.users.includes(user.id)) throw new HttpError(404, 'Not found.');
    const other = store.data.users[m.users.find((u) => u !== user.id)];
    if (!other) throw new HttpError(404, 'Not found.');
    const contact = settingsOf(user).trustedContact;
    if (!contact) throw new HttpError(400, 'Add a trusted contact first.');
    if (!user.emailVerified) throw new HttpError(403, 'Confirm your own email first, so we know these emails come from you.');
    const when = Date.parse(body.when);
    const t = Date.parse(now().toISOString());
    if (!Number.isFinite(when) || when < t - 3600e3 || when > t + 60 * DAY) throw new HttpError(400, 'Pick a time in the next two months.');
    const place = cleanText(body.place, 120);
    if (!place) throw new HttpError(400, 'Where are you meeting?');
    const sentToday = datesOf(store, user.id).flatMap((d) => d.sent || []).filter((at) => t - Date.parse(at) < DAY).length;
    if (sentToday >= SHARES_PER_DAY) throw new HttpError(429, 'That is a lot of plans for one day. Try again tomorrow.');
    store.data.dates ||= {};
    let d = activePlan(store, user.id, m.id);
    const update = Boolean(d);
    if (!d) {
      d = { id: store.id('d'), userId: user.id, matchId: m.id, withId: other.id, createdAt: now().toISOString(), sent: [] };
      store.data.dates[d.id] = d;
    }
    Object.assign(d, { when: new Date(when).toISOString(), place, contact: { ...contact }, status: 'shared', askedAt: null, alertedAt: null });
    d.sent.push(now().toISOString());
    await shareMail(ctx, user, other, d, { update });
    return { status: update ? 200 : 201, body: { date: planView(d, settingsOf(user).timeZone) } };
  });

  route('POST', '/api/dates/:id/safe', async ({ user, params }) => {
    const d = ownPlan(user, params.id);
    if (d.status === 'safe' || d.status === 'cancelled') return { body: { date: planView(d, settingsOf(user).timeZone) } };
    d.status = 'safe';
    d.safeAt = now().toISOString();
    await safeMail(ctx, user, d);
    return { body: { date: planView(d, settingsOf(user).timeZone) } };
  });

  route('POST', '/api/dates/:id/cancel', async ({ user, params }) => {
    const d = ownPlan(user, params.id);
    if (d.status !== 'shared' && d.status !== 'alerted') throw new HttpError(409, 'These plans are already settled.');
    d.status = 'cancelled';
    await cancelMail(ctx, user, d);
    return { body: { date: planView(d, settingsOf(user).timeZone) } };
  });
}
