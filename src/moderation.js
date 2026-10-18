// A deliberately small, conservative filter for messages between matches.
// It stops clear abuse and threats; everything else is left to reports.
import { hasContactInfo } from './profile.js';

const ABUSE = [
  /\bk\s*y\s*s\b/i,
  /\bkill (your|ur)self\b/i,
  /\bi('?ll| will| am going to) (kill|hurt) you\b/i,
  /\b(whore|slut|retard(ed)?|cunt)\b/i,
  /\b(send|show) (me )?(nudes|pics of your body)\b/i,
  /\bugly (bitch|cow|pig)\b/i,
];

export function isAbusive(text) {
  return ABUSE.some((re) => re.test(String(text)));
}

export const STRIKES_BEFORE_REPORT = 3;

// Check text one person sends another (a message, or a note with a like). Returns the
// reason it was refused, or null. Repeated abuse is reported to moderators automatically.
export function screenMessage(store, user, text, { noContact = false, at = new Date().toISOString() } = {}) {
  if (isAbusive(text)) {
    user.strikes = (user.strikes || 0) + 1;
    if (user.strikes === STRIKES_BEFORE_REPORT) {
      store.data.reports.push({ id: store.id('r'), by: 'system', about: user.id, reason: `Automatic: ${STRIKES_BEFORE_REPORT} messages blocked as abusive.`, at, status: 'open', source: 'filter' });
    }
    return 'That message looks hurtful, so it was not sent. Please keep it kind.';
  }
  if (noContact && hasContactInfo(text)) return 'Keep contact details for after you match.';
  return null;
}

