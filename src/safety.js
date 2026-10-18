// Share Date (as on Bumble): tell someone you trust who you are meeting, where and when.
// Afterwards Pishi asks "Are you home safe?". If there is no answer a while after the date,
// the trusted contact gets one more email so they can check in. Pishi never knows where
// anyone is and does not call emergency services; the emails say so plainly.
import { settingsOf } from './profile.js';
import { now } from './clock.js';

const HOUR = 3600e3;
// After the start time: when to ask the person, and when to tell their contact.
export const ASK_AFTER_H = 3;
export const ALERT_AFTER_H = 5;
// Emails go to an address the person typed in, so they are rationed.
export const SHARES_PER_DAY = 3;

export function formatWhen(iso, tz) {
  return new Date(iso).toLocaleString('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export function datesOf(store, userId) {
  return Object.values(store.data.dates || {}).filter((d) => d.userId === userId);
}

// The plan someone shared for one match that is still in play, if any.
export function activePlan(store, userId, matchId) {
  return datesOf(store, userId).find((d) => d.matchId === matchId && (d.status === 'shared' || d.status === 'alerted')) || null;
}

export function planView(d, tz, store = null) {
  const other = store?.data.users[d.withId];
  return { id: d.id, when: d.when, whenText: formatWhen(d.when, tz), place: d.place, contact: d.contact.name, status: d.status, ...(store ? { with: other?.name || 'your match', matchId: store.data.matches[d.matchId] ? d.matchId : null } : {}) };
}

// Plans still waiting for "home safe", whether or not the match still exists: unmatching
// someone mid-date must not hide the button.
export function openPlans(store, userId) {
  return datesOf(store, userId).filter((d) => d.status === 'shared' || d.status === 'alerted').sort((a, b) => a.when.localeCompare(b.when));
}

function mailContact(ctx, user, plan, subject, body) {
  const { contact } = plan;
  return ctx.mailer.send({
    to: contact.email,
    subject: `Pishi: ${subject}`,
    text: `Hi ${contact.name},\n\n${body}\n\nYou are getting this because ${user.name} added you as their trusted contact on Pishi, a dating app. They can remove you at any time.`,
  });
}

export function shareMail(ctx, user, other, plan, { update = false } = {}) {
  const tz = settingsOf(user).timeZone;
  const who = [other.name, other.basics.age, other.basics.city && `from ${other.basics.city}`].filter(Boolean).join(', ');
  return mailContact(ctx, user, plan, update ? `${user.name} changed their date plans` : `${user.name} shared their date plans with you`,
    `${user.name} is meeting someone from Pishi and wanted you to know${update ? ' about a change of plans' : ''}.\n\n`
    + `Who: ${who}\nWhen: ${formatWhen(plan.when, tz)}\nWhere: ${plan.place}\n\n`
    + `Afterwards we will ask ${user.name} to tap "I am home safe", and we will tell you when they do. If they have not by ${formatWhen(new Date(Date.parse(plan.when) + ALERT_AFTER_H * HOUR).toISOString(), tz)}, we will email you again so you can check in on them.\n\n`
    + 'Pishi cannot see where anyone is and does not contact emergency services. If you are worried, call them; if you think someone is in danger, call your local emergency number.');
}

export function safeMail(ctx, user, plan) {
  return mailContact(ctx, user, plan, `${user.name} is home safe`, `${user.name} let us know they are home safe after their date. Nothing else to do.`);
}

export function cancelMail(ctx, user, plan) {
  return mailContact(ctx, user, plan, `${user.name} called off their date`, `${user.name}'s date plans for ${formatWhen(plan.when, settingsOf(user).timeZone)} are off. Nothing else to do.`);
}

// Hourly: ask "are you home safe?", then tell the contact when there is no answer.
export function runDates(ctx) {
  const { store, notify } = ctx;
  let n = 0;
  const t = Date.parse(now().toISOString());
  for (const d of Object.values(store.data.dates || {})) {
    if (d.status !== 'shared') continue;
    const user = store.data.users[d.userId];
    if (!user) continue;
    const start = Date.parse(d.when);
    // If Pishi was down for days, a "have not heard" email about an old date only alarms people.
    if (t > start + 48 * HOUR) {
      d.status = 'expired';
      continue;
    }
    if (!d.askedAt && t >= start + ASK_AFTER_H * HOUR) {
      d.askedAt = now().toISOString();
      notify(user, { type: 'safety', text: `Are you home safe? Tap to let ${d.contact.name} know.`, link: '#/matches' });
      n++;
    }
    if (t >= start + ALERT_AFTER_H * HOUR) {
      d.status = 'alerted';
      d.alertedAt = now().toISOString();
      mailContact(ctx, user, d, `we have not heard from ${user.name}`,
        `${user.name} shared plans for a date at ${d.place} on ${formatWhen(d.when, settingsOf(user).timeZone)}, and has not yet told us they are home safe. They may simply have forgotten, but please check in with them.\n\n`
        + 'Pishi cannot see where anyone is and does not contact emergency services. If you cannot reach them and think they are in danger, call your local emergency number.');
      n++;
    }
  }
  return n;
}
