// Round 4 in the browser: liking a line with a note, the quote in the conversation,
// "Did you meet?", sharing date plans, closing kindly, and the trusted contact in Settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client, onboard, ANSWERS } from '../helpers.js';
import { loadChromium } from './browser.js';

const chromium = await loadChromium();

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

async function signIn(browser, base, email) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errors.push(m.text()));
  await page.goto(base);
  await page.getByRole('button', { name: 'I already have an account' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'This week' }).waitFor();
  return { page, errors };
}

test('likes with notes, did you meet, share date and closing kindly in the browser', { skip: !chromium && 'playwright not installed', timeout: 110000 }, async () => {
  const srv = await startServer({ seed: false });
  const a = client(srv.base);
  const b = client(srv.base);
  const A = (await onboard(a, { name: 'Ana', email: 'ana4@x.co', answers: { ...ANSWERS, b_gender: 'Woman', b_seeking: 'Men' } })).me;
  await (onboard(b, { name: 'Ben', email: 'ben4@x.co', answers: { ...ANSWERS, b_gender: 'Man', b_seeking: 'Women' } }));
  await b.post('/api/profile/items', { prompt: 'My ideal Sunday', text: 'Market, long lunch, a nap I will deny taking.' });
  await a.put('/api/profile/openers', { openers: ['What is the best thing you ate this week?'] });
  await a.get('/api/week');
  await b.get('/api/week');
  srv.store.data.users[A.id].emailVerified = true;

  const browser = await chromium.launch();
  try {
    // Ana likes Ben's line with a note.
    const ana = await signIn(browser, srv.base, 'ana4@x.co');
    let page = ana.page;
    await checkPage(page, 'week with hearts');
    await page.getByRole('button', { name: 'Like this line: My ideal Sunday' }).click();
    await page.getByLabel('Add a note (optional)').fill('The nap you will deny taking. Respect.');
    await page.getByRole('button', { name: 'Send like' }).click();
    await page.getByText('You liked them.').waitFor();

    // Ben sees it on Ana's card, likes back, and the conversation opens with the quote.
    const ben = await signIn(browser, srv.base, 'ben4@x.co');
    await ben.page.getByText('Ana liked your line').waitFor();
    await ben.page.getByText('“The nap you will deny taking. Respect.”').waitFor();
    await checkPage(ben.page, 'card with a note');
    await ben.page.getByRole('button', { name: 'Like', exact: true }).click();
    await ben.page.getByRole('link', { name: '← Matches' }).waitFor();
    await ben.page.locator('blockquote.about').getByText(/^Market/).waitFor();
    await ben.page.locator('.msg.them').getByText('The nap you will deny taking').waitFor();
    // Ana's opening question is Ben's first way to answer.
    await ben.page.locator('.chips .chip').first().getByText('You asked: What is the best thing you ate this week?').waitFor();
    await checkPage(ben.page, 'thread');

    const mid = Object.keys(srv.store.data.matches)[0];
    await page.goto(`${srv.base}/#/match/${encodeURIComponent(mid)}`);
    await page.getByRole('button', { name: 'Share date plans' }).waitFor();

    // Share date plans, adding a trusted contact on the way.
    await page.getByRole('button', { name: 'Share date plans' }).click();
    await page.getByLabel('Where').fill('Monmouth Coffee, Borough');
    await page.getByLabel('Trusted contact: first name').fill('Sara');
    await page.getByLabel('Their email').fill('sara@friend.co');
    await page.getByRole('button', { name: 'Share plans' }).click();
    await page.getByText(/Shared with Sara: .*Monmouth Coffee/).waitFor();
    assert.equal(srv.mailer.sent.at(-1).to, 'sara@friend.co');
    await page.getByRole('button', { name: 'I am home safe' }).click();
    await page.getByRole('button', { name: 'Share date plans' }).waitFor();
    assert.match(srv.mailer.sent.at(-1).subject, /home safe/);

    // Did you meet? Once was enough hands over to the matchmaker.
    await page.getByRole('button', { name: 'Did you meet?' }).click();
    await page.getByLabel('How it went').selectOption('once');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByText(/once enough with Ben/).waitFor();

    // Close kindly: Ben's thread turns read-only.
    await page.goto(`${srv.base}/#/match/${encodeURIComponent(mid)}`);
    await page.getByRole('button', { name: 'Close kindly' }).click();
    await page.getByRole('button', { name: 'Send and close' }).click();
    await page.getByText('You closed this conversation.').waitFor();
    assert.equal(await page.getByLabel('Message').count(), 0);
    await ben.page.getByText('Ana closed this conversation kindly.').waitFor();

    // The trusted contact shows in Settings.
    await page.goto(`${srv.base}/#/settings`);
    await page.getByRole('heading', { name: 'Trusted contact' }).waitFor();
    assert.equal(await page.locator('#s-tc-email').inputValue(), 'sara@friend.co');
    await checkPage(page, 'settings');

    // Ana's profile: add an opening question.
    await page.goto(`${srv.base}/#/profile`);
    await page.getByRole('button', { name: '+ Add a question' }).click();
    await page.getByLabel('Pick one').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.locator('#openers li').first().waitFor();
    await checkPage(page, 'profile');

    assert.deepEqual([...ana.errors, ...ben.errors], []);
  } finally {
    await browser.close();
    await srv.close();
  }
});
