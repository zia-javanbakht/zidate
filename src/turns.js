// Keeping conversations moving: whose turn it is, closing a conversation kindly, and the
// gentle reminders that go with them. Pishi's version of Hinge's "Your Turn Limits" and
// Coffee Meets Bagel's expiring chats: your next two wait until you have answered the
// people already waiting on you, or closed those conversations kindly.
import { available } from './matching.js';
import { now } from './clock.js';

const DAY = 864e5;
// How long a message can wait before it holds up the next week's two.
export const TURN_GRACE_DAYS = 2;
// When a quiet conversation gets a reminder.
export const NUDGE_DAYS = 3;

export const CLOSE_LINES = [
  'Thank you for chatting. I do not think we are a match, but I wish you all the best.',
  'I have enjoyed talking, but I do not feel this is going anywhere for me. Good luck out there.',
  'I am going to close this one. Take care, and thank you for the conversation.',
];

const age = (iso) => Date.parse(now().toISOString()) - Date.parse(iso);

// Open matches where the other person wrote last, at least `days` ago.
export function waitingOn(store, user, days = TURN_GRACE_DAYS) {
  const out = [];
  for (const m of Object.values(store.data.matches)) {
    if (!m.users.includes(user.id) || m.closed) continue;
    const other = store.data.users[m.users.find((u) => u !== user.id)];
    // Demo people always answer last, and someone suspended or paused cannot be answered.
    if (!other || other.demo || !available(store, user, other)) continue;
    const last = (store.data.messages[m.id] || []).at(-1);
    if (last && last.from === other.id && age(last.at) >= days * DAY) out.push({ matchId: m.id, name: other.name, since: last.at });
  }
  return out.sort((a, b) => a.since.localeCompare(b.since));
}

// Hourly: one reminder per waiting message, and one "say hello" for a silent new match.
export function runNudges(ctx) {
  const { store, notify } = ctx;
  let n = 0;
  for (const m of Object.values(store.data.matches)) {
    if (m.closed) continue;
    const [a, b] = m.users.map((id) => store.data.users[id]);
    if (!a || !b) continue;
    const msgs = store.data.messages[m.id] || [];
    const link = `#/match/${encodeURIComponent(m.id)}`;
    if (!msgs.length) {
      if (m.helloNudge || age(m.createdAt) < NUDGE_DAYS * DAY) continue;
      m.helloNudge = now().toISOString();
      for (const [x, y] of [[a, b], [b, a]]) if (!x.demo && notify(x, { type: 'nudge', text: `You and ${y.name} matched a few days ago. Say hello?`, link })) n++;
      continue;
    }
    const last = msgs.at(-1);
    const x = last.from === a.id ? b : a; // whose turn it is
    const y = x === a ? b : a;
    if (x.demo || age(last.at) < NUDGE_DAYS * DAY || m.nudged?.[x.id] === last.at) continue;
    m.nudged = { ...m.nudged, [x.id]: last.at };
    if (notify(x, { type: 'nudge', text: `${y.name} is waiting for your reply. Answer, or close it kindly.`, link })) n++;
  }
  return n;
}
