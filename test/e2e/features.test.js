import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client, onboard, linkToken, ANSWERS } from '../helpers.js';
import { loadChromium } from './browser.js';

const chromium = await loadChromium();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

// Every control has a name and nothing spills sideways on a small phone.
async function checkPage(page, label) {
  const unnamed = await page.evaluate(() => [...document.querySelectorAll('button, a, input, textarea, select')]
    .filter((el) => !el.closest('[hidden]') && !(el.getAttribute('aria-label') || el.textContent.trim() || (el.id && document.querySelector(`label[for="${el.id}"]`))))
    .map((el) => el.outerHTML.slice(0, 80)));
  assert.deepEqual(unnamed, [], label);
  await page.setViewportSize({ width: 320, height: 640 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `${label}: page overflows by ${overflow}px at 320px`);
  await page.setViewportSize({ width: 390, height: 844 });
}

test('matches, live messages, profile tools, settings, moderation and password reset in the browser', { skip: !chromium && 'playwright not installed', timeout: 110000 }, async () => {
  const srv = await startServer({ seed: false });
  const a = client(srv.base);
  const b = client(srv.base);
  const A = (await onboard(a, { name: 'Ana', email: 'admin@x.co', answers: { ...ANSWERS, b_gender: 'Woman', b_seeking: 'Men' } })).me;
  const B = (await onboard(b, { name: 'Ben', email: 'ben@x.co', answers: { ...ANSWERS, b_gender: 'Man', b_seeking: 'Women' } })).me;
  await a.get('/api/week');
  await b.get('/api/week');
  await a.post(`/api/week/${B.id}`, { decision: 'like' });
  const { match } = (await b.post(`/api/week/${A.id}`, { decision: 'like' })).data;
  const mid = encodeURIComponent(match.id);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  try {
    // Sign in through the form.
    await page.goto(srv.base);
    await page.getByRole('button', { name: 'I already have an account' }).click();
    await page.getByLabel('Email').fill('admin@x.co');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('heading', { name: 'This week' }).waitFor();

    // The bell shows the match; the notification opens the conversation.
    assert.equal(await page.locator('.bell .dot').isHidden(), false);
    await page.locator('.bell').click();
    await page.getByRole('heading', { name: 'Notifications' }).waitFor();
    await checkPage(page, 'notifications');
    await page.locator('.notes-list a').first().click();
    await page.getByRole('link', { name: '← Matches' }).waitFor();

    // An icebreaker fills the box; sending works; Ben's reply arrives live; Ben reading it shows "Seen".
    await page.locator('.chips .chip').first().click();
    assert.ok((await page.getByLabel('Message').inputValue()).length > 5);
    await page.getByRole('button', { name: 'Send' }).click();
    await page.locator('.msg.user').first().waitFor();
    await b.get(`/api/matches/${mid}`);
    await page.locator('.seen:not([hidden])').waitFor();
    await b.post(`/api/matches/${mid}`, { text: 'Hello from Ben, live.' });
    await page.getByText('Hello from Ben, live.').waitFor();
    await checkPage(page, 'thread');

    // Hurtful messages are stopped with a clear reason.
    await page.getByLabel('Message').fill('kill yourself');
    await page.keyboard.press('Enter');
    await page.getByText('was not sent').waitFor();

    // Matches list shows Ben with a time.
    await page.getByRole('link', { name: 'Matches' }).first().click();
    await page.locator('.list .when').first().waitFor();

    // Profile: a photo, a line of my own and an interest, all through in-page dialogs.
    await page.getByRole('link', { name: 'You' }).click();
    await page.getByRole('heading', { name: 'Photos' }).waitFor();
    await page.locator('input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
    await page.locator('.photo img').first().waitFor();
    // One photo is a start; the page asks for three, then the preview lets you flip through them.
    await page.getByText('Add 2 more to reach three.').waitFor();
    for (const n of [2, 3]) {
      await page.locator('input[type=file]').setInputFiles({ name: `me${n}.png`, mimeType: 'image/png', buffer: PNG });
      await page.waitForFunction((k) => document.querySelectorAll('.photo img').length === k, n);
    }
    assert.equal(await page.locator('.nudge').count(), 0);
    await page.getByText('Preview as a match sees it').click();
    const shots = page.getByRole('region', { name: /^Photos of / });
    await shots.locator('.count', { hasText: '1 / 3' }).waitFor();
    await shots.getByRole('button', { name: 'Next photo' }).click();
    await shots.locator('.count', { hasText: '2 / 3' }).waitFor();
    await shots.getByRole('button', { name: 'Photo 3 of 3' }).click();
    await shots.locator('.count', { hasText: '3 / 3' }).waitFor();
    assert.equal(await shots.getByRole('button', { name: 'Next photo' }).isDisabled(), true);
    await shots.press('ArrowLeft');
    await shots.locator('.count', { hasText: '2 / 3' }).waitFor();
    await page.getByRole('button', { name: '+ Add a line of my own' }).click();
    await page.getByLabel('Your answer').fill('Sunday markets and a long lunch.');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByText('Sunday markets and a long lunch.').first().waitFor();
    const before = await page.locator('.item .tags li').count();
    await page.locator('.item .add-tag').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Add' }).click();
    await page.waitForFunction((n) => document.querySelectorAll('.item .tags li').length > n, before);
    await checkPage(page, 'profile');

    // Settings: basics with city cleanup, theme, pause and resume.
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('heading', { name: 'Settings' }).waitFor();
    await page.getByLabel('City').fill('nyc');
    await page.getByRole('button', { name: 'Save basics' }).click();
    await page.waitForFunction(() => document.getElementById('s-city')?.value === 'New York');
    await page.getByRole('button', { name: 'Dark' }).click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await page.getByLabel('Pause my account').check();
    await page.getByText('Paused.').waitFor();
    await checkPage(page, 'settings');
    await page.getByRole('link', { name: 'This week' }).click();
    await page.getByRole('heading', { name: 'You are paused.' }).waitFor();
    await page.getByRole('button', { name: 'Resume' }).click();
    await page.getByRole('heading', { name: 'This week' }).waitFor();

    // Unmatch and report through the dialog, then handle it as a moderator.
    await page.goto(`${srv.base}/#/match/${mid}`);
    await page.getByRole('button', { name: 'Unmatch or report' }).click();
    await page.getByLabel('Also report them to a moderator').check();
    await page.getByRole('button', { name: 'Unmatch', exact: true }).click();
    await page.getByText('Tell the moderator briefly').waitFor();
    await page.getByLabel('Reason (needed for a report)').fill('Rude messages.');
    await page.getByRole('button', { name: 'Unmatch', exact: true }).click();
    await page.getByRole('heading', { name: 'No matches yet.' }).waitFor();
    await page.goto(`${srv.base}/#/admin`);
    await page.getByRole('heading', { name: 'Moderation' }).waitFor();
    await page.getByText('Rude messages.').waitFor();
    await checkPage(page, 'admin');
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await page.getByText('No reports. Good.').or(page.getByText('dismissed')).first().waitFor();

    // Unknown pages say so.
    await page.goto(`${srv.base}/#/nowhere`);
    await page.getByRole('heading', { name: 'Nothing here.' }).waitFor();

    // Signed out: forgot password, then the emailed link signs you back in.
    await page.goto(`${srv.base}/#/settings`);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('button', { name: 'I already have an account' }).click();
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await page.getByRole('heading', { name: 'New password' }).waitFor();
    await page.getByLabel('Email').fill('admin@x.co');
    await page.getByRole('button', { name: 'Send me a link' }).click();
    await page.getByRole('heading', { name: 'Check your inbox.' }).waitFor();
    const token = linkToken(srv.mailer, 'admin@x.co', 'reset');
    await page.goto(`${srv.base}/#/reset/${token}`);
    await page.getByLabel('New password').fill('a-new-password');
    await page.getByRole('button', { name: 'Save and sign in' }).click();
    await page.getByRole('heading', { name: 'This week' }).waitFor();

    const unexpected = errors.filter((e) => !/status of 422/.test(e)); // the blocked message is an expected 422
    assert.deepEqual(unexpected, []);
  } finally {
    await browser.close();
    await srv.close();
  }
});
