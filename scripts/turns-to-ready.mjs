// How many interview answers until matching unlocks, and what the chat sounded like.
import { startServer, client, onboard } from '../test/helpers.js';
const srv = await startServer();
const c = client(srv.base);
const last = await onboard(c, { maxTurns: 30 });
const msgs = (await c.get('/api/chat')).data.messages;
const answers = msgs.filter((m) => m.role === 'user').length - 4;
if (process.argv.includes('-v')) for (const m of msgs) console.log(m.role.padEnd(5), (m.qid || '').padEnd(15), m.text.slice(0, 90));
console.log(`interview answers until ready: ${answers}, ready=${last.me.ready}, completeness=${last.me.completeness}`);
await srv.close();
