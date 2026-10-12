// Drive the app through a full flow and capture each screen. Usage: node scripts/screenshots.mjs <outdir>
import fs from 'node:fs';
import { startServer, client, onboard } from '../test/helpers.js';
import { loadChromium } from '../test/e2e/browser.js';

const out = process.argv[2] || 'screenshots';
fs.mkdirSync(out, { recursive: true });
const srv = await startServer();
const chromium = await loadChromium();
const browser = await chromium.launch();

// Prepare a person through the API, then log the browser in as them.
const c = client(srv.base);
const { me } = await onboard(c, { email: 'shots@x.co' });
const items = (await c.get('/api/profile')).data.shared.items;
if (items[0]) await c.patch(`/api/profile/items/${items[0].id}`, { status: 'approved' });
await c.put('/api/profile/bio', { useDraft: true });
const week = (await c.get('/api/week')).data;
srv.store.data.likes[`${week.picks[1].id}>${me.id}`] = new Date().toISOString();
const liked = await c.post(`/api/week/${week.picks[1].id}`, { decision: 'like' });
await c.post(`/api/matches/${encodeURIComponent(liked.data.match.id)}`, { text: 'Hi! Your Sunday sounds a lot like mine.' });

// Placeholder "photos": soft gradients rendered in the browser, so screenshots show the photo layouts.
async function art(hue, w = 600, h = 800) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(`<body style="margin:0;background:radial-gradient(circle at 30% 30%, hsl(${hue} 55% 78%), hsl(${hue + 40} 40% 42%))"></body>`);
  const buf = await p.screenshot({ type: 'jpeg', quality: 80 });
  await p.close();
  return buf;
}
for (const hue of [20, 200]) await c.post('/api/photos', { data: `data:image/jpeg;base64,${(await art(hue)).toString('base64')}` });
const other = srv.store.data.users[week.picks[1].id];
const shots = srv.store.data.users[me.id];
srv.ctx.notify(shots, { type: 'picks', text: 'Your two people for this week are here.', link: '#/week' });
srv.ctx.notify(shots, { type: 'match', text: `You and ${other.name} like each other.`, link: `#/match/${encodeURIComponent(liked.data.match.id)}` });
other.photos = [{ id: srv.ctx.photos.save(await art(140), { ext: 'jpg' }), at: new Date().toISOString() }];

for (const scheme of ['light', 'dark']) {
  for (const [label, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 860 }]]) {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto(srv.base + '/#/welcome');
    await page.waitForSelector('h1');
    await page.screenshot({ path: `${out}/${scheme}-${label}-welcome.png`, fullPage: true });
    await page.getByLabel('Email').waitFor();
    await page.getByRole('button', { name: 'I already have an account' }).click();
    await page.getByLabel('Email').fill('shots@x.co');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.locator('.top:not([hidden])').waitFor();
    for (const [name, hash, wait] of [['talk', '#/talk', '.msg.agent'], ['week', '#/week', 'h1'], ['matches', '#/matches', 'h1'], ['thread', `#/match/${encodeURIComponent(liked.data.match.id)}`, '.person'], ['profile', '#/profile', '.trait'], ['notifications', '#/notifications', 'h1'], ['settings', '#/settings', '.seg']]) {
      await page.goto(srv.base + '/' + hash);
      await page.waitForSelector(wait);
      await page.waitForTimeout(250);
      if (name !== 'talk' && name !== 'thread') await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${out}/${scheme}-${label}-${name}.png`, fullPage: name !== 'talk' && name !== 'thread' });
    }
    await ctx.close();
  }
}
await browser.close();
await srv.close();
console.log('saved to', out);
