// Settings from the environment, checked once at start with friendly warnings.
export function loadConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  const cfg = {
    port,
    db: env.PISHI_DB || 'data/db.json',
    photoDir: env.PISHI_PHOTOS || 'data/photos',
    outbox: env.PISHI_OUTBOX || 'data/outbox',
    mailWebhook: env.PISHI_MAIL_WEBHOOK || null,
    baseUrl: (env.PISHI_BASE_URL || `http://localhost:${port}`).replace(/\/$/, ''),
    admins: String(env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    production: env.NODE_ENV === 'production',
    seed: env.PISHI_SEED !== '0',
    log: env.PISHI_LOG !== '0',
  };
  const warnings = [];
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`PORT must be a number from 1 to 65535, got "${env.PORT}".`);
  if (cfg.production && !cfg.baseUrl.startsWith('https://')) warnings.push('NODE_ENV=production but PISHI_BASE_URL is not https; email links and secure cookies expect HTTPS.');
  if (!cfg.admins.length) warnings.push('No ADMIN_EMAILS set, so nobody can review reports.');
  if (!cfg.mailWebhook) warnings.push(`No PISHI_MAIL_WEBHOOK set; emails are written to ${cfg.outbox} instead of being sent.`);
  return { cfg, warnings };
}
