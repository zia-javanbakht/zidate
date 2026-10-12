import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, ANSWERS } from '../helpers.js';
import { loadChromium } from './browser.js';

const chromium = await loadChromium();

test('a new person signs up, talks, approves a line, and sees two people', { skip: !chromium && 'playwright not installed', timeout: 90000 }, async () => {
  const srv = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  try {
    await page.goto(srv.base);
    await page.getByLabel('First name').fill('Zia');
    await page.getByLabel('Email').fill('ui@x.co');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Start talking' }).click();
    await page.waitForSelector('.msg.agent');

    for (let i = 0; i < 16; i++) {
      const qid = await page.evaluate(async () => (await (await fetch('/api/chat')).json()).messages.at(-1).qid);
      const ready = await page.evaluate(async () => (await (await fetch('/api/me')).json()).user.ready);
      if (ready) break;
      const answer = ANSWERS[qid] || 'Honestly, I am not sure yet.';
      const chip = page.locator('.chip', { hasText: answer });
      const count = page.locator('.msg.agent').count();
      if (await chip.count()) await chip.first().click();
      else {
        await page.getByLabel('Your answer').fill(answer);
        await page.keyboard.press('Enter');
      }
      await page.waitForFunction((n) => document.querySelectorAll('.msg.agent:not(.typing)').length > n, await count);
    }

    await page.getByRole('link', { name: 'You' }).click();
    await page.getByRole('heading', { name: 'Shared profile' }).waitFor();
    await page.getByRole('button', { name: 'Show on profile' }).first().click();
    await page.getByText('Visible to matches').first().waitFor();

    await page.getByRole('link', { name: 'This week' }).click();
    await page.getByRole('heading', { name: 'This week' }).waitFor();
    assert.equal(await page.locator('article.person').count(), 2);
    await page.locator('article.person').first().getByRole('button', { name: 'Pass' }).click();
    await page.getByText('You passed.').waitFor();

    await page.getByRole('link', { name: 'Talk' }).click();
    await page.waitForSelector('.msg.agent');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await srv.close();
  }
});
