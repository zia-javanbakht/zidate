// Matches and messages between people, delivered live.
import { publicProfile, cleanText } from '../profile.js';
import { demoReply, icebreakers } from '../social.js';
import { isAbusive, STRIKES_BEFORE_REPORT } from '../moderation.js';
import { now } from '../clock.js';

export default function matches(ctx) {
  const { store, route, HttpError, hub, notify } = ctx;

  function getMatch(user, id) {
    const m = store.data.matches[id];
    if (!m || !m.users.includes(user.id)) throw new HttpError(404, 'Not found.');
    return m;
  }
  const otherOf = (m, user) => store.data.users[m.users.find((u) => u !== user.id)];
  const view = (x, user) => ({ text: x.text, at: x.at, mine: x.from === user.id });

  route('GET', '/api/matches', async ({ user }) => {
    const list = Object.values(store.data.matches)
      .filter((m) => m.users.includes(user.id))
      .map((m) => {
        const other = otherOf(m, user);
        const msgs = store.data.messages[m.id] || [];
        const last = msgs.at(-1);
        const seen = m.seen?.[user.id] || '';
        return {
          id: m.id,
          createdAt: m.createdAt,
          person: other ? publicProfile(other, { showPhotos: true }) : null,
          last: last ? { text: last.text, mine: last.from === user.id, at: last.at } : null,
          unread: msgs.filter((x) => x.from !== user.id && x.at > seen).length,
          isNew: !seen,
        };
      })
      .filter((m) => m.person)
      .sort((a, b) => (b.last?.at || b.createdAt).localeCompare(a.last?.at || a.createdAt));
    return { body: { matches: list } };
  });

  route('GET', '/api/matches/:id', async ({ user, params }) => {
    const m = getMatch(user, params.id);
    const other = otherOf(m, user);
    const msgs = store.data.messages[m.id] || [];
    // Everything shown is read, even a demo reply stamped a moment ahead of the clock.
    const lastAt = msgs.at(-1)?.at || '';
    const at = now().toISOString();
    m.seen = { ...m.seen, [user.id]: lastAt > at ? lastAt : at };
    if (other) hub.publish(other.id, 'seen', { matchId: m.id, at: m.seen[user.id] });
    // Opening the thread reads its notifications too.
    for (const n of store.data.notifications?.[user.id] || []) if (n.link === `#/match/${encodeURIComponent(m.id)}`) n.read = true;
    return {
      body: {
        id: m.id,
        createdAt: m.createdAt,
        person: other ? publicProfile(other, { showPhotos: true }) : null,
        messages: msgs.map((x) => view(x, user)),
        seenByThem: other ? m.seen?.[other.id] || null : null,
        icebreakers: msgs.length || !other ? [] : icebreakers(user, other),
      },
    };
  });

  route('POST', '/api/matches/:id', async ({ user, params, body }) => {
    const m = getMatch(user, params.id);
    const text = cleanText(body.text, 1000);
    if (!text) throw new HttpError(400, 'Say something first.');
    const other = otherOf(m, user);
    if (isAbusive(text)) {
      user.strikes = (user.strikes || 0) + 1;
      if (user.strikes === STRIKES_BEFORE_REPORT) {
        store.data.reports.push({ id: store.id('r'), by: 'system', about: user.id, reason: `Automatic: ${STRIKES_BEFORE_REPORT} messages blocked as abusive.`, at: now().toISOString(), status: 'open', source: 'filter' });
      }
      throw new HttpError(422, 'That message looks hurtful, so it was not sent. Please keep it kind.');
    }
    const msg = { from: user.id, text, at: now().toISOString() };
    store.data.messages[m.id].push(msg);
    m.seen = { ...m.seen, [user.id]: msg.at };
    if (other) {
      hub.publish(other.id, 'message', { matchId: m.id, message: view(msg, other) });
      // Only nudge by notification when they are not watching, and only once per unread thread.
      const link = `#/match/${encodeURIComponent(m.id)}`;
      const already = (store.data.notifications?.[other.id] || []).some((n) => n.type === 'message' && n.link === link && !n.read);
      if (!already && hub.count(other.id) === 0) notify(other, { type: 'message', text: `New message from ${user.name}.`, link });
    }
    let reply = null;
    if (other?.demo) {
      const at = new Date(Date.parse(msg.at) + 1).toISOString();
      const r = { from: other.id, text: demoReply(other, user, store.data.messages[m.id]), at };
      store.data.messages[m.id].push(r);
      m.seen[user.id] = at; // shown in the open thread, so not unread
      m.seen[other.id] = at;
      reply = view(r, user);
    }
    return { status: 201, body: { message: view(msg, user), reply } };
  });

  route('POST', '/api/matches/:id/unmatch', async ({ user, params, body }) => {
    const m = getMatch(user, params.id);
    const otherId = m.users.find((u) => u !== user.id);
    if (body.report) {
      store.data.reports.push({
        id: store.id('r'), by: user.id, about: otherId, reason: cleanText(body.reason, 500), at: now().toISOString(), status: 'open', source: 'match',
        // Moderators see the last messages as context.
        context: (store.data.messages[m.id] || []).slice(-10).map((x) => ({ from: x.from === user.id ? 'reporter' : 'reported', text: x.text, at: x.at })),
      });
    }
    store.data.blocks[`${user.id}>${otherId}`] = now().toISOString();
    delete store.data.matches[m.id];
    delete store.data.messages[m.id];
    hub.publish(otherId, 'unmatched', { matchId: m.id });
    return { body: { ok: true } };
  });
}
