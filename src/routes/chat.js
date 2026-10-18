// The conversation with the matchmaker.
import { respond, opening, resume, SKIP_RE } from '../agent/index.js';
import { noteAnswer, noteObservations, signalsOf } from '../signals.js';

export default function chat({ store, route, HttpError, meView, serial }) {
  route('GET', '/api/chat', async ({ user }) => {
    const convo = store.data.conversations[user.id];
    if (!opening(user, convo)) resume(user, convo);
    return { body: { messages: convo.messages, me: meView(user) } };
  }, { saves: true });

  route('POST', '/api/chat', async ({ user, body }) => serial(user.id, async () => {
    if (user.blocked) throw new HttpError(403, 'This account cannot continue.');
    const convo = store.data.conversations[user.id];
    opening(user, convo);
    const start = convo.messages.length + 1; // after the person's own message
    const pending = convo.pending;
    const askedAt = [...convo.messages].reverse().find((m) => m.role === 'agent')?.at;
    const text = String(body.text || '').trim();
    const sig = signalsOf(store, user.id);
    const message = await respond(user, convo, body.text, undefined, {
      observations: sig.observations.map((o) => o.text),
      save: (list) => noteObservations(store, user, list),
    });
    if (pending && pending.kind !== 'basic') {
      const quickReply = Boolean(pending.choices?.some((c) => (typeof c === 'string' ? c : c.label).toLowerCase() === text.toLowerCase()));
      noteAnswer(store, user, { text, askedAt, skipped: SKIP_RE.test(text), quickReply });
    }
    return { body: { message, messages: convo.messages.slice(start), me: meView(user) } };
  }));
}
