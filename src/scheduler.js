// Background jobs, run on start and then every hour:
// weekly picks (+ "your two are here"), match check-ins, and data backups.
import fs from 'node:fs';
import path from 'node:path';
import { runWeekly } from './matching.js';
import { runCheckins } from './social.js';

export function backup(file, { keep = 7, dir = null } = {}) {
  if (!file || !fs.existsSync(file)) return null;
  const folder = dir || path.join(path.dirname(file), 'backups');
  fs.mkdirSync(folder, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const target = path.join(folder, `db-${day}.json`);
  if (!fs.existsSync(target)) fs.copyFileSync(file, target);
  const old = fs.readdirSync(folder).filter((f) => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(0, -keep);
  for (const f of old) fs.rmSync(path.join(folder, f));
  return target;
}

export function tick(store, ctx) {
  const picks = runWeekly(store, ctx.notify);
  const checkins = runCheckins(ctx);
  if (picks || checkins) store.save();
  return { picks, checkins, backup: backup(store.file) };
}

export function startScheduler(store, ctx, everyMs = 3600e3) {
  tick(store, ctx);
  const timer = setInterval(() => tick(store, ctx), everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
