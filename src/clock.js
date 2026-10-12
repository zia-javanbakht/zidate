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

// ISO week key such as "2026-W42". Weeks start on Monday.
export function weekKey(date = now()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// When the next set of suggestions arrives: the coming Monday 00:00 UTC.
export function nextWeekStart(date = now()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + (8 - day));
  return d;
}
