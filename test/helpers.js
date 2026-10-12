import http from 'node:http';
import { Store } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seedDemo } from '../src/seed.js';

process.env.ZIDATE_AGENT = 'offline';

// Start the app on a random port with an in-memory store.
export async function startServer({ seed = true } = {}) {
  const store = new Store(null);
  if (seed) seedDemo(store);
  const server = http.createServer(createApp(store));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { store, server, base, close: () => new Promise((r) => server.close(r)) };
}

// A tiny cookie-keeping client.
export function client(base) {
  let cookie = '';
  async function call(method, url, body) {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }
  return {
    get: (u) => call('GET', u),
    post: (u, b) => call('POST', u, b ?? {}),
    put: (u, b) => call('PUT', u, b),
    patch: (u, b) => call('PATCH', u, b),
    del: (u) => call('DELETE', u),
  };
}

// Answers keyed by the question being asked, so tests do not depend on question order.
export const ANSWERS = {
  b_gender: 'Woman', b_seeking: 'Men', b_age: '31', b_city: 'London',
  q_weekend: 'A slow morning, a long run along the river, then friends over for a big dinner I cook.',
  q_recharge: 'Dinner with one or two friends',
  q_travel: 'Backpacking through Vietnam with no plan at all, eating street food and exploring every day.',
  q_plans: 'Go, after a few calls',
  q_work: 'I am an architect. I love it, but I want a real work-life balance.',
  q_family: 'I want kids',
  q_curious: 'Old films and why cities feel the way they do. Also history and books.',
  q_active: 'Walks, the odd class',
  q_faith: 'Somewhat',
  q_habits: "I don't smoke and I drink a little wine with dinner.",
  q_relationship: 'Something long-term',
  q_home: 'Cooking, a book, early night',
  q_laugh: 'Dry humour, my friends doing impressions, and dogs being ridiculous.',
  q_values: 'Honesty and kindness, and making time for family.',
  q_proud: 'Designing a small library in my home town that people actually use.',
  q_partner_day: 'Out on a hike or at a market, curious about everything, chatting to strangers.',
  q_dealbreakers: 'Smoking is a hard no.',
  q_partner_trait: 'Kindness and being able to laugh at themselves.',
};

// Sign up and answer whatever the interviewer asks until it is ready (or max turns).
export async function onboard(c, { name = 'Zia', email = `z${Math.random()}@x.com`, answers = ANSWERS, maxTurns = 14, untilReady = true } = {}) {
  const r = await c.post('/api/signup', { name, email, password: 'password123' });
  if (r.status !== 201) throw new Error(JSON.stringify(r.data));
  let msg = (await c.get('/api/chat')).data.messages.at(-1);
  let last;
  for (let i = 0; i < maxTurns; i++) {
    const text = answers[msg.qid] || 'I would rather keep that one to myself for now, but ask me anything else.';
    last = (await c.post('/api/chat', { text })).data;
    msg = last.message;
    if (untilReady && last.me.ready) break;
  }
  return last;
}
