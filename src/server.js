import http from 'node:http';
import { Store } from './db.js';
import { createApp } from './app.js';
import { seedDemo } from './seed.js';
import { pickEngine } from './agent/index.js';

const port = Number(process.env.PORT || 3000);
const store = new Store(process.env.ZIDATE_DB || 'data/db.json');
if (process.env.ZIDATE_SEED !== '0') seedDemo(store);

const server = http.createServer(createApp(store, { secureCookies: process.env.NODE_ENV === 'production' }));
server.listen(port, () => {
  console.log(`ziDate on http://localhost:${port} (interviewer: ${pickEngine().name})`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    store.flush();
    process.exit(0);
  });
}
