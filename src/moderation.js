// A deliberately small, conservative filter for messages between matches.
// It stops clear abuse and threats; everything else is left to reports.
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
