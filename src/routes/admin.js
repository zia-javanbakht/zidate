// Moderation for the people listed in ADMIN_EMAILS.
import { now } from '../clock.js';
import { isReady } from '../profile.js';
import { weekKey } from '../clock.js';

export default function admin({ store, route, HttpError, endSessions, mailer }) {
  const who = (id) => {
    const u = store.data.users[id];
    return u ? { id, name: u.name, email: u.email, suspended: Boolean(u.suspended), reports: store.data.reports.filter((r) => r.about === id).length } : { id, name: 'Deleted account' };
  };

  route('GET', '/api/admin/reports', async () => {
    const reports = store.data.reports
      .map((r) => ({ ...r, id: r.id || `${r.by}-${r.at}`, status: r.status || 'open', by: r.by === 'system' ? { name: 'Automatic filter' } : who(r.by), about: who(r.about) }))
      .sort((a, b) => (a.status === 'open') - (b.status === 'open') || b.at.localeCompare(a.at))
      .reverse();
    return { body: { reports } };
  }, { admin: true });

  route('POST', '/api/admin/reports/:id', async ({ params, body }) => {
    const r = store.data.reports.find((x) => (x.id || `${x.by}-${x.at}`) === params.id);
    if (!r) throw new HttpError(404, 'Not found.');
    const target = store.data.users[r.about];
    if (body.action === 'dismiss') r.status = 'dismissed';
    else if (body.action === 'suspend') {
      if (!target) throw new HttpError(404, 'That account no longer exists.');
      target.suspended = now().toISOString();
      endSessions(target.id);
      r.status = 'actioned';
      await mailer.send({ to: target.email, subject: 'Your ziDate account is suspended', text: `Hi ${target.name},\n\nAfter a report, your account has been suspended. If you think this is a mistake, reply to this email.` });
    } else if (body.action === 'restore') {
      if (!target) throw new HttpError(404, 'That account no longer exists.');
      delete target.suspended;
      r.status = 'dismissed';
    } else throw new HttpError(400, 'Choose dismiss, suspend or restore.');
    r.handledAt = now().toISOString();
    return { body: { ok: true } };
  }, { admin: true });

  route('GET', '/api/admin/stats', async () => {
    const users = Object.values(store.data.users).filter((u) => !u.demo);
    const wk = weekKey();
    const weekAgo = new Date(Date.parse(now().toISOString()) - 7 * 864e5).toISOString();
    const msgs = Object.values(store.data.messages).flat();
    return {
      body: {
        people: users.length,
        ready: users.filter(isReady).length,
        paused: users.filter((u) => u.settings?.paused).length,
        suspended: users.filter((u) => u.suspended).length,
        demo: Object.values(store.data.users).length - users.length,
        picksThisWeek: Object.keys(store.data.weeks).filter((k) => k.endsWith(`:${wk}`)).length,
        matches: Object.keys(store.data.matches).length,
        messagesThisWeek: msgs.filter((m) => m.at > weekAgo).length,
        openReports: store.data.reports.filter((r) => (r.status || 'open') === 'open').length,
      },
    };
  }, { admin: true });
}
