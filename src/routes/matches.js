// Matches and messages between people, delivered live.
import { publicProfile, cleanText } from '../profile.js';
import { demoReply, icebreakers, passEvent, dateIdeas } from '../social.js';
import { recordMet, MET } from '../dates.js';
import { CLOSE_LINES } from '../turns.js';
import { activePlan, planView } from '../safety.js';
import { settingsOf } from '../profile.js';
import { askNow } from '../agent/index.js';
import { screenMessage } from '../moderation.js';
import { now } from '../clock.js';
import { noteMessage } from '../signals.js';

export default function matches(ctx) {
  const { store, route, HttpError, hub, notify, serial } = ctx;

  function getMatch(user, id) {
    const m = store.data.matches[id];
    if (!m || !m.users.includes(user.id)) throw new HttpError(404, 'Not found.');
    return m;
  }
  const otherOf = (m, user) => store.data.users[m.users.find((u) => u !== user.id)];
  const view = (x, user) => ({
    text: x.text, at: x.at, mine: x.from === user.id, ...(x.closing ? { closing: true } : {}),
    // A like on one line or photo opens the conversation, quoted above the note.
    ...(x.about ? { about: x.about.kind === 'photo' ? { photo: `/api/photos/${x.about.photoId}` } : { prompt: x.about.prompt, text: x.about.text } } : {}),
  });

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
          closed: Boolean(m.closed),
          yourTurn: !m.closed && last?.from === other?.id,
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
        // Ways to start, until you have written something yourself (a note with a like may open it).
        icebreakers: msgs.some((x) => x.from === user.id) || !other ? [] : icebreakers(user, other),
        met: m.met?.[user.id]?.answer || null,
        // Once you have talked a little, some first-date ideas from what you both like.
        dateIdeas: other && !m.closed && msgs.filter((x) => x.from === user.id).length >= 2 && msgs.filter((x) => x.from === other.id).length >= 2 ? dateIdeas(user, other) : [],
        closed: m.closed ? { byMe: m.closed.by === user.id, at: m.closed.at } : null,
        closeLines: CLOSE_LINES,
        date: (() => { const d = activePlan(store, user.id, m.id); return d ? planView(d, settingsOf(user).timeZone) : null; })(),
        trustedContact: settingsOf(user).trustedContact?.name || null,
      },
    };
  }, { saves: true });

  route('POST', '/api/matches/:id', async ({ user, params, body }) => {
    const m = getMatch(user, params.id);
    if (m.closed) throw new HttpError(409, 'This conversation is closed.');
    const text = cleanText(body.text, 1000);
    if (!text) throw new HttpError(400, 'Say something first.');
    const other = otherOf(m, user);
    const problem = screenMessage(store, user, text, { at: now().toISOString() });
    if (problem) throw new HttpError(422, problem);
    const msg = { from: user.id, text, at: now().toISOString() };
    store.data.messages[m.id].push(msg);
    noteMessage(store, user, store.data.messages[m.id]);
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

  // Close a conversation kindly: a last message (one of ours, or your own words), then the
  // thread stays readable but quiet. Nobody is left waiting, and nobody is blocked.
  route('POST', '/api/matches/:id/close', async ({ user, params, body }) => {
    const m = getMatch(user, params.id);
    if (m.closed) throw new HttpError(409, 'This conversation is already closed.');
    const text = cleanText(body.text, 300) || CLOSE_LINES[Number(body.line) || 0] || CLOSE_LINES[0];
    const problem = screenMessage(store, user, text, { at: now().toISOString() });
    if (problem) throw new HttpError(422, problem);
    const msg = { from: user.id, text, at: now().toISOString(), closing: true };
    store.data.messages[m.id].push(msg);
    noteMessage(store, user, store.data.messages[m.id]);
    m.closed = { by: user.id, at: msg.at };
    m.seen = { ...m.seen, [user.id]: msg.at };
    const other = otherOf(m, user);
    if (other) {
      hub.publish(other.id, 'message', { matchId: m.id, message: view(msg, other) });
      notify(other, { type: 'message', text: `${user.name} closed your conversation kindly.`, link: `#/match/${encodeURIComponent(m.id)}` });
    }
    return { body: { message: view(msg, user) } };
  });

  // "Did you meet?" from the conversation itself, any time. "Once was enough" hands over to
  // the matchmaker, who asks why.
  route('POST', '/api/matches/:id/met', async ({ user, params, body }) => serial(user.id, async () => {
    const m = getMatch(user, params.id);
    const other = otherOf(m, user);
    if (!other) throw new HttpError(404, 'Not found.');
    if (!MET[body.answer]) throw new HttpError(400, 'Pick one of the answers.');
    recordMet(store, user, other, body.answer);
    let ask = false;
    if (body.answer === 'once') {
      const convo = store.data.conversations[user.id];
      // Asked first: they just told us, so it is fresh.
      convo.events = convo.events.filter((e) => !(e.type === 'met-once' && e.candidateId === other.id));
      convo.events.unshift({ type: 'met-once', candidateId: other.id, name: other.name, aspects: passEvent(user, other).aspects });
      if (convo.pending?.kind !== 'feedback') askNow(user, convo);
      ask = true;
    }
    return { body: { met: body.answer, ask } };
  }));

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
