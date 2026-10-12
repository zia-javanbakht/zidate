import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client } from '../helpers.js';

test('mutating requests must be JSON (CSRF hardening)', async () => {
  const srv = await startServer({ seed: false });
  const res = await fetch(`${srv.base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=a&password=b' });
  assert.equal(res.status, 415);
  await srv.close();
});

test('sign-in attempts are rate limited', async () => {
  const srv = await startServer({ seed: false, limits: { auth: 3, chat: 5, write: 5 } });
  const c = client(srv.base);
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await c.post('/api/login', { email: 'a@b.co', password: 'nopenope' })).status);
  assert.deepEqual(codes, [401, 401, 401, 429, 429]);
  await srv.close();
});

test('static pages carry security headers', async () => {
  const srv = await startServer({ seed: false });
  const res = await fetch(srv.base);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  await srv.close();
});
