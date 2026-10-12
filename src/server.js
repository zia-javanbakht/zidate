import http from 'node:http';
import { Store } from './db.js';
import { createApp, VERSION } from './app.js';
import { seedDemo } from './seed.js';
import { pickEngine } from './agent/index.js';
import { createMailer } from './mailer.js';
import { startScheduler } from './scheduler.js';
import { loadConfig } from './config.js';

const { cfg, warnings } = loadConfig();
for (const w of warnings) console.warn(`[config] ${w}`);

const store = new Store(cfg.db);
if (cfg.seed) seedDemo(store);

const handler = createApp(store, {
  secureCookies: cfg.production,
  admins: cfg.admins,
  mailer: createMailer({ dir: cfg.outbox, webhook: cfg.mailWebhook }),
  photoDir: cfg.photoDir,
  baseUrl: cfg.baseUrl,
  log: cfg.log,
});
const server = http.createServer(handler);
const stopJobs = startScheduler(store, handler.ctx);
const ping = setInterval(() => handler.hub.ping(), 25000); // keeps live streams open through proxies

server.listen(cfg.port, () => {
  console.log(`ziDate ${VERSION} on ${cfg.baseUrl} (matchmaker: ${pickEngine().name})`);
});

function shutdown(sig) {
  console.log(`${sig}: saving and stopping`);
  stopJobs();
  clearInterval(ping);
  handler.hub.closeAll();
  server.close();
  store.flush();
  process.exit(0);
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => shutdown(sig));
