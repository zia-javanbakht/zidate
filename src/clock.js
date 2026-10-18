// A swappable clock so tests can move between weeks.
let offsetMs = 0;

export function now() {
  return new Date(Date.now() + offsetMs);
}

export function advance(ms) {
  offsetMs += ms;
}

export function reset() {
  offsetMs = 0;
}

const DAY = 864e5;

export function validTimeZone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// The calendar date in a time zone, as a UTC midnight Date.
function localDate(date, tz) {
  if (tz === 'UTC') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(date).map((x) => [x.type, x.value]));
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
}

// How far a time zone is ahead of UTC at this instant, in ms.
function zoneOffset(date, tz) {
  if (tz === 'UTC') return 0;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(date).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(date / 1000) * 1000;
}

// The instant a calendar date (UTC midnight Date) starts in a time zone.
function startOfLocalDay(day, tz) {
  let t = day.getTime() - zoneOffset(day, tz);
  t = day.getTime() - zoneOffset(new Date(t), tz);
  return new Date(t);
}

function isoWeek(d) {
  d = new Date(d);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Week key such as "2026-W42". By default weeks start on Monday, UTC.
// day (0 = Sunday .. 6 = Saturday) and tz move the start to that day at local midnight;
// the key names the ISO week the start day falls in, so Monday/UTC keys are plain ISO weeks.
export function weekKey(date = now(), { day = 1, tz = 'UTC' } = {}) {
  const d = localDate(date, tz);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - day + 7) % 7));
  return isoWeek(d);
}

// When the next set of suggestions arrives: the coming start day at local midnight.
export function nextWeekStart(date = now(), { day = 1, tz = 'UTC' } = {}) {
  const d = localDate(date, tz);
  d.setUTCDate(d.getUTCDate() + ((day - d.getUTCDay() + 7) % 7 || 7));
  return startOfLocalDay(d, tz);
}
