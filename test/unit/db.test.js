import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../src/db.js';

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pishi-')), 'db.json');

test('data survives a restart', async () => {
  const file = tmp();
  const a = new Store(file);
  a.data.users.u1 = { id: 'u1', name: 'A' };
  a.save();
  await new Promise((r) => setImmediate(r));
  const b = new Store(file);
  assert.equal(b.data.users.u1.name, 'A');
  assert.deepEqual(b.data.matches, {});
});

test('a corrupt file is moved aside instead of crashing', () => {
  const file = tmp();
  fs.writeFileSync(file, '{"users": {');
  const s = new Store(file);
  assert.deepEqual(s.data.users, {});
  assert.ok(fs.readdirSync(path.dirname(file)).some((f) => f.includes('corrupt')));
});

test('expired sessions are dropped on load', () => {
  const file = tmp();
  fs.writeFileSync(file, JSON.stringify({ sessions: { old: { userId: 'u', expires: 1 }, fresh: { userId: 'u', expires: Date.now() + 1e6 } } }));
  assert.deepEqual(Object.keys(new Store(file).data.sessions), ['fresh']);
});
