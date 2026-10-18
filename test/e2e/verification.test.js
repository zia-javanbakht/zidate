import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client } from '../helpers.js';
import { loadChromium } from './browser.js';

const chromium = await loadChromium();
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('photo verification: a selfie from the camera, a moderator approves it, the badge shows', { skip: !chromium && 'playwright not installed', timeout: 110000 }, async () => {
  const srv = await startServer({ seed: false });
  const api = client(srv.base);
  await api.post('/api/signup', { name: 'Ana', email: 'admin@x.co', password: 'password123' });
  await api.post('/api/photos', { data: PNG });

  // A fake camera, allowed without a prompt.
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(srv.base);
    await page.getByRole('button', { name: 'I already have an account' }).click();
    await page.getByLabel('Email').fill('admin@x.co');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.locator('nav').waitFor();
    await page.goto(`${srv.base}/#/profile/verification`);
    await page.getByRole('heading', { name: 'Photo verification' }).waitFor();
    await page.getByRole('button', { name: 'Verify my photos' }).click();
    await page.locator('.verify .pose strong').waitFor();
    await page.waitForFunction(() => document.querySelector('.selfie-live')?.videoWidth > 0);
    if (process.env.PISHI_SHOTS) await page.screenshot({ path: `${process.env.PISHI_SHOTS}/verify-pose.png` });
    await page.getByRole('button', { name: 'Take selfie' }).click();
    await page.getByRole('img', { name: 'Your selfie' }).waitFor();
    await page.getByRole('button', { name: 'Send' }).click();
    await page.getByText('A moderator is comparing your selfie').waitFor();

    await page.goto(`${srv.base}/#/admin`);
    await page.getByRole('img', { name: 'Selfie of Ana' }).waitFor();
    if (process.env.PISHI_SHOTS) await page.screenshot({ path: `${process.env.PISHI_SHOTS}/verify-moderator.png`, fullPage: true });
    await page.getByRole('button', { name: 'Same person' }).click();
    await page.getByText('Nothing to check.').waitFor();

    await page.goto(`${srv.base}/#/profile/verification`);
    await page.getByText('so your profile shows a Verified badge').waitFor();
    await page.getByText('Preview as a match sees it').click();
    await page.locator('.person h2 .verified').waitFor();
    if (process.env.PISHI_SHOTS) await page.screenshot({ path: `${process.env.PISHI_SHOTS}/verify-done.png` });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await srv.close();
  }
});
