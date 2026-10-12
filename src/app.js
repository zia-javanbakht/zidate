// HTTP API and static file server. No framework: a small router over node:http.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, verifyPassword, newToken, parseCookies } from './auth.js';
import { emptyHidden } from './traits.js';
import { respond, opening, newConversation, queueEvent, pickEngine } from './agent/index.js';
import { completeness, isReady, describeHidden, publicProfile, cleanText, blendTrait, hasContactInfo } from './profile.js';
import { weeklyPicks, matchId, compatibility } from './matching.js';
import { weekKey, now } from './clock.js';
import { TRAIT_KEYS } from './traits.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const SESSION_DAYS = 30;
const NO_CONTACT = 'Keep contact details off your profile. You can share them once you match.';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function newUser(store, { name, email, password }) {
  const id = store.id('u');
  const user = {
    id,
    name,
    email,
    password: password ? hashPassword(password) : null,
    createdAt: now().toISOString(),
    basics: { gender: null, seeking: null, age: null, city: null },
    hidden: emptyHidden(),
    shared: { bio: '', bioDraft: '', interests: [], items: [] },
  };
  store.data.users[id] = user;
  store.data.conversations[id] = newConversation();
  return user;
}

function readBody(req, limit = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'Too much data.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function meView(user, store) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    basics: user.basics,
    completeness: completeness(user),
    ready: isReady(user),
    engine: pickEngine().name,
    unread: unreadCount(store, user.id),
  };
}

function unreadCount(store, uid) {
  let n = 0;
  for (const m of Object.values(store.data.matches)) {
    if (!m.users.includes(uid)) continue;
    const seen = m.seen?.[uid] || '';
    // A brand-new match counts as something to look at.
    if (!seen) n += 1;
    n += (store.data.messages[m.id] || []).filter((msg) => msg.from !== uid && msg.at > seen).length;
  }
  return n;
}

// Liking someone is also a signal: nudge preferences a little toward them.
function learnFromLike(user, other) {
  for (const k of TRAIT_KEYS) {
    const t = other.hidden.traits[k];
    if (t.confidence < 0.2) continue;
    user.hidden.preference[k] = blendTrait(user.hidden.preference[k] || { value: 0.5, confidence: 0 }, t.value, 0.12);
  }
}

function createMatch(store, a, b) {
  const id = matchId(a.id, b.id);
  if (store.data.matches[id]) return store.data.matches[id];
  // The person who completed the match sees it straight away, so it is not "new" for them.
  const m = { id, users: [a.id, b.id], createdAt: now().toISOString(), seen: { [a.id]: now().toISOString() } };
  store.data.matches[id] = m;
  store.data.messages[id] = [];
  for (const [x, y] of [[a, b], [b, a]]) {
    if (!x.demo) queueEvent(store.data.conversations[x.id], { type: 'match', candidateId: y.id, name: y.name });
  }
  return m;
}

// Fixed-window rate limiter, per client and bucket.
function limiter() {
  const hits = new Map();
  return (key, max, windowMs = 60000) => {
    const t = Date.now();
    const h = hits.get(key);
    if (!h || t - h.start > windowMs) {
      hits.set(key, { start: t, n: 1 });
      if (hits.size > 10000) hits.clear();
      return true;
    }
    return ++h.n <= max;
  };
}

const LIMITS = { auth: 10, chat: 40, write: 120 };

export function createApp(store, { secureCookies = false, limits = LIMITS } = {}) {
  const allow = limiter();
  const routes = [];
  const route = (method, pattern, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
    routes.push({ method, re, keys, handler, auth: opts.auth !== false });
  };

  const cookie = (token, maxAge) => `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;

  function startSession(user) {
    const token = newToken();
    store.data.sessions[token] = { userId: user.id, expires: Date.now() + SESSION_DAYS * 864e5 };
    return cookie(token, SESSION_DAYS * 86400);
  }

  // --- accounts ---
  route('POST', '/api/signup', async ({ body }) => {
    const name = cleanText(body.name, 40);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!name) throw new HttpError(400, 'What should I call you?');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'That email does not look right.');
    if (password.length < 8) throw new HttpError(400, 'Use at least 8 characters for your password.');
    if (Object.values(store.data.users).some((u) => u.email === email)) throw new HttpError(409, 'That email already has an account. Try signing in.');
    const user = newUser(store, { name, email, password });
    return { status: 201, body: { user: meView(user, store) }, headers: { 'Set-Cookie': startSession(user) } };
  }, { auth: false });

  route('POST', '/api/login', async ({ body }) => {
    const email = String(body.email || '').trim().toLowerCase();
    const user = Object.values(store.data.users).find((u) => u.email === email);
    if (!user || !user.password || !verifyPassword(String(body.password || ''), user.password)) {
      throw new HttpError(401, 'Email or password is wrong.');
    }
    return { body: { user: meView(user, store) }, headers: { 'Set-Cookie': startSession(user) } };
  }, { auth: false });

  route('POST', '/api/logout', async ({ token }) => {
    delete store.data.sessions[token];
    return { body: { ok: true }, headers: { 'Set-Cookie': cookie('', 0) } };
  });

  // Signed-out is a normal state for this endpoint, not an error.
  route('GET', '/api/me', async ({ user }) => ({ body: { user: user ? meView(user, store) : null } }), { auth: false });

  route('DELETE', '/api/me', async ({ user }) => {
    const id = user.id;
    delete store.data.users[id];
    delete store.data.conversations[id];
    for (const [t, s] of Object.entries(store.data.sessions)) if (s.userId === id) delete store.data.sessions[t];
    for (const k of Object.keys(store.data.weeks)) if (k.startsWith(`${id}:`)) delete store.data.weeks[k];
    for (const k of Object.keys(store.data.likes)) if (k.includes(id)) delete store.data.likes[k];
    for (const [mid, m] of Object.entries(store.data.matches)) {
      if (m.users.includes(id)) {
        delete store.data.matches[mid];
        delete store.data.messages[mid];
      }
    }
    return { body: { ok: true }, headers: { 'Set-Cookie': cookie('', 0) } };
  });

  // --- conversation with the interviewer ---
  route('GET', '/api/chat', async ({ user }) => {
    const convo = store.data.conversations[user.id];
    opening(user, convo);
    return { body: { messages: convo.messages, me: meView(user, store) } };
  });

  route('POST', '/api/chat', async ({ user, body }) => {
    if (user.blocked) throw new HttpError(403, 'This account cannot continue.');
    const convo = store.data.conversations[user.id];
    opening(user, convo);
    const message = await respond(user, convo, body.text);
    return { body: { message, me: meView(user, store) } };
  });

  // --- profiles ---
  route('GET', '/api/profile', async ({ user }) => ({
    body: {
      shared: user.shared,
      preview: publicProfile(user),
      hidden: describeHidden(user),
      me: meView(user, store),
    },
  }));

  route('PATCH', '/api/profile/items/:id', async ({ user, params, body }) => {
    const item = user.shared.items.find((i) => i.id === params.id);
    if (!item) throw new HttpError(404, 'Not found.');
    if (body.status) {
      if (!['approved', 'hidden', 'suggested'].includes(body.status)) throw new HttpError(400, 'Unknown status.');
      item.status = body.status;
    }
    if (typeof body.text === 'string') {
      const text = cleanText(body.text, 300);
      if (!text) throw new HttpError(400, 'It cannot be empty.');
      if (hasContactInfo(text)) throw new HttpError(400, NO_CONTACT);
      item.text = text;
    }
    return { body: { item } };
  });

  route('DELETE', '/api/profile/items/:id', async ({ user, params }) => {
    user.shared.items = user.shared.items.filter((i) => i.id !== params.id);
    return { body: { ok: true } };
  });

  route('PUT', '/api/profile/bio', async ({ user, body }) => {
    const bio = cleanText(body.useDraft ? user.shared.bioDraft : body.text, 400);
    if (hasContactInfo(bio)) throw new HttpError(400, NO_CONTACT);
    user.shared.bio = bio;
    if (body.useDraft) user.shared.bioDraft = '';
    return { body: { bio: user.shared.bio } };
  });

  route('DELETE', '/api/profile/interests/:name', async ({ user, params }) => {
    const name = decodeURIComponent(params.name);
    user.shared.interests = user.shared.interests.filter((i) => i !== name);
    return { body: { interests: user.shared.interests } };
  });

  // --- weekly suggestions ---
  route('GET', '/api/week', async ({ user }) => ({ body: weeklyPicks(store, user) }));

  route('POST', '/api/week/:id', async ({ user, params, body }) => {
    const decision = body.decision;
    if (!['like', 'pass'].includes(decision)) throw new HttpError(400, 'Decide like or pass.');
    const week = store.data.weeks[`${user.id}:${weekKey()}`];
    const pick = week?.picks.find((p) => p.id === params.id);
    if (!pick) throw new HttpError(404, 'That person is not in your suggestions this week.');
    if (pick.decision) throw new HttpError(409, 'You already decided.');
    const other = store.data.users[params.id];
    if (!other) throw new HttpError(404, 'That person has left.');
    pick.decision = decision;
    const convo = store.data.conversations[user.id];
    let match = null;
    if (decision === 'like') {
      store.data.likes[`${user.id}>${other.id}`] = now().toISOString();
      learnFromLike(user, other);
      // Demo people answer instantly, and only if they would like this person too.
      if (other.demo && compatibility(other, user) >= 0.6) store.data.likes[`${other.id}>${user.id}`] = now().toISOString();
      if (store.data.likes[`${other.id}>${user.id}`]) match = createMatch(store, user, other);
    }
    if (!match) queueEvent(convo, { type: decision, candidateId: other.id, name: other.name });
    return { body: { decision, match: match ? { id: match.id } : null } };
  });

  // --- matches and messages ---
  function getMatch(user, id) {
    const m = store.data.matches[id];
    if (!m || !m.users.includes(user.id)) throw new HttpError(404, 'Not found.');
    return m;
  }

  route('GET', '/api/matches', async ({ user }) => {
    const list = Object.values(store.data.matches)
      .filter((m) => m.users.includes(user.id))
      .map((m) => {
        const other = store.data.users[m.users.find((u) => u !== user.id)];
        const msgs = store.data.messages[m.id] || [];
        const last = msgs.at(-1);
        const seen = m.seen?.[user.id] || '';
        return {
          id: m.id,
          createdAt: m.createdAt,
          person: other ? publicProfile(other) : null,
          last: last ? { text: last.text, mine: last.from === user.id, at: last.at } : null,
          unread: msgs.filter((x) => x.from !== user.id && x.at > seen).length,
          isNew: !seen,
        };
      })
      .filter((m) => m.person)
      .sort((a, b) => (b.last?.at || b.createdAt).localeCompare(a.last?.at || a.createdAt));
    return { body: { matches: list } };
  });

  route('GET', '/api/matches/:id', async ({ user, params }) => {
    const m = getMatch(user, params.id);
    const other = store.data.users[m.users.find((u) => u !== user.id)];
    m.seen = { ...m.seen, [user.id]: now().toISOString() };
    return {
      body: {
        id: m.id,
        person: other ? publicProfile(other) : null,
        messages: (store.data.messages[m.id] || []).map((x) => ({ text: x.text, at: x.at, mine: x.from === user.id })),
      },
    };
  });

  route('POST', '/api/matches/:id', async ({ user, params, body }) => {
    const m = getMatch(user, params.id);
    const text = cleanText(body.text, 1000);
    if (!text) throw new HttpError(400, 'Say something first.');
    const msg = { from: user.id, text, at: now().toISOString() };
    store.data.messages[m.id].push(msg);
    m.seen = { ...m.seen, [user.id]: msg.at };
    return { status: 201, body: { message: { text, at: msg.at, mine: true } } };
  });

  route('POST', '/api/matches/:id/unmatch', async ({ user, params, body }) => {
    const m = getMatch(user, params.id);
    if (body.report) store.data.reports.push({ by: user.id, about: m.users.find((u) => u !== user.id), reason: cleanText(body.reason, 500), at: now().toISOString() });
    delete store.data.matches[m.id];
    delete store.data.messages[m.id];
    return { body: { ok: true } };
  });

  route('GET', '/api/health', async () => ({ body: { ok: true, engine: pickEngine().name } }), { auth: false });

  function serveStatic(req, res) {
    const url = new URL(req.url, 'http://x');
    let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
    if (!file.startsWith(PUBLIC)) return send(res, 404, { error: 'Not found.' });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
    });
    fs.createReadStream(file).pipe(res);
  }

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed.' });
      return serveStatic(req, res);
    }
    try {
      const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!r) throw new HttpError(404, 'Not found.');
      const params = {};
      const m = url.pathname.match(r.re);
      r.keys.forEach((k, i) => (params[k] = m[i + 1]));
      const mutating = req.method !== 'GET' && req.method !== 'HEAD';
      // Browsers cannot send JSON cross-site without a CORS preflight, which we never grant.
      if (mutating && !String(req.headers['content-type'] || '').startsWith('application/json')) {
        throw new HttpError(415, 'Send JSON.');
      }
      if (mutating) {
        const ip = req.socket.remoteAddress;
        const bucket = /^\/api\/(signup|login)$/.test(url.pathname) ? 'auth' : url.pathname === '/api/chat' ? 'chat' : 'write';
        if (!allow(`${ip}:${bucket}`, limits[bucket])) throw new HttpError(429, 'Slow down a little and try again in a minute.');
      }
      const token = parseCookies(req.headers.cookie).sid;
      const session = token && store.data.sessions[token];
      let user = null;
      if (session && session.expires > Date.now()) user = store.data.users[session.userId] || null;
      if (r.auth && !user) throw new HttpError(401, 'Please sign in.');
      const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : {};
      const out = await r.handler({ req, user, token, params, body: body && typeof body === 'object' ? body : {} });
      store.save();
      send(res, out.status || 200, out.body, out.headers);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      send(res, status, { error: status === 500 ? 'Something went wrong.' : err.message });
    }
  };
}
