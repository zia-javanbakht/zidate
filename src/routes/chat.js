// The conversation with the matchmaker.
import { respond, opening, resume } from '../agent/index.js';

export default function chat({ store, route, HttpError, meView }) {
  route('GET', '/api/chat', async ({ user }) => {
    const convo = store.data.conversations[user.id];
    if (!opening(user, convo)) resume(user, convo);
    return { body: { messages: convo.messages, me: meView(user) } };
  });

  route('POST', '/api/chat', async ({ user, body }) => {
    if (user.blocked) throw new HttpError(403, 'This account cannot continue.');
    const convo = store.data.conversations[user.id];
    opening(user, convo);
    const start = convo.messages.length + 1; // after the person's own message
    const message = await respond(user, convo, body.text);
    return { body: { message, messages: convo.messages.slice(start), me: meView(user) } };
  });
}
