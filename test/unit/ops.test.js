import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backup } from '../../src/scheduler.js';
import { loadConfig } from '../../src/config.js';
import { sniff, decodeUpload } from '../../src/photos.js';
import { isAbusive } from '../../src/moderation.js';

test('daily backups, keeping the last seven', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zd-'));
  const file = path.join(dir, 'db.json');
  fs.writeFileSync(file, '{}');
  const folder = path.join(dir, 'backups');
  fs.mkdirSync(folder);
  for (let d = 1; d <= 9; d++) fs.writeFileSync(path.join(folder, `db-2020-01-0${d}.json`), '{}');
  backup(file);
  const left = fs.readdirSync(folder);
  assert.equal(left.length, 7);
  assert.ok(left.includes(`db-${new Date().toISOString().slice(0, 10)}.json`));
});

test('config is validated with helpful warnings', () => {
  assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT/);
  const { cfg, warnings } = loadConfig({ NODE_ENV: 'production', ZIDATE_BASE_URL: 'http://x', ADMIN_EMAILS: 'A@x.co, b@x.co' });
  assert.deepEqual(cfg.admins, ['a@x.co', 'b@x.co']);
  assert.ok(warnings.some((w) => w.includes('https')));
});

test('photos are recognised by their bytes, not their label', () => {
  assert.equal(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(decodeUpload('data:image/jpeg;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64')).error, 'Use a JPEG, PNG or WebP photo.');
  assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).ext, 'jpg');
});

test('the message filter stops clear abuse and leaves normal talk alone', () => {
  for (const t of ['kys', 'I will hurt you', 'send nudes']) assert.ok(isAbusive(t), t);
  for (const t of ['I could kill for a coffee', 'This skyscraper is huge', 'Find me at the cafe at 6? I will find you a seat']) {
    assert.ok(!isAbusive(t), t);
  }
});
