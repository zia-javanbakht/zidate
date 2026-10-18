// The web app: wires services together, serves the API and the static client.
// Routes live in src/routes/*, one file per area.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, newToken, parseCookies } from './auth.js';
import { emptyHidden } from './traits.js';
import { newConversation, pickEngine } from './agent/index.js';
import { completeness, isReady, settingsOf, upgradeUser } from './profile.js';
import { HttpError, readBody, send, router, limiter } from './http.js';
import { createHub } from './events.js';
import { createMailer } from './mailer.js';
import { createPhotoStore } from './photos.js';
import { now } from './clock.js';
import { noteActive } from './signals.js';
import account from './routes/account.js';
import chat from './routes/chat.js';
import profile from './routes/profile.js';
import week from './routes/week.js';
import matches from './routes/matches.js';
import notifications from './routes/notifications.js';
import admin from './routes/admin.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
export const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
};
const SESSION_DAYS = 30;
const LIMITS = { auth: 10, chat: 40, write: 120 };

export function newUser(store, { name, email, password }) {
  const id = store.id('u');
  const user = {
    id,
    name,
    email,
    emailVerified: false,
    password: password ? hashPassword(password) : null,
    createdAt: now().toISOString(),
    basics: { gender: null, seeking: null, age: null, city: null },
    hidden: emptyHidden(),
    shared: { bio: '', bioDraft: '', interests: [], items: [], facts: {} },
    photos: [],
  };
  settingsOf(user);
  store.data.users[id] = user;
  store.data.conversations[id] = newConversation();
  return user;
}

export function createApp(store, opts = {}) {
  const {
    secureCookies = false,
    limits = LIMITS,
    admins = [],
    mailer = createMailer(),
    photoDir = null,
    baseUrl = 'http://localhost:3000',
    log = false,
  } = opts;
  // People stored before the profile gained new parts get them now.
  for (const u of Object.values(store.data.users)) upgradeUser(u);
  const allow = limiter();
  const { route, match } = router();
  const hub = createHub();
  const photos = createPhotoStore(photoDir);

  const cookie = (token, maxAge) => `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
  const isAdmin = (user) => Boolean(user && admins.includes(user.email));

  const ctx = {
    store, route, hub, mailer, photos, baseUrl, HttpError, isAdmin,
    newUser: (o) => newUser(store, o),
    cookie,
    startSession(user) {
      const token = newToken();
      store.data.sessions[token] = { userId: user.id, expires: Date.now() + SESSION_DAYS * 864e5, createdAt: now().toISOString() };
      return cookie(token, SESSION_DAYS * 86400);
    },
    endSessions(userId, except = null) {
      for (const [t, s] of Object.entries(store.data.sessions)) if (s.userId === userId && t !== except) delete store.data.sessions[t];
    },
    meView(user) {
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: Boolean(user.emailVerified),
        basics: user.basics,
        settings: settingsOf(user),
        completeness: completeness(user),
        ready: isReady(user),
        engine: pickEngine().name,
        unread: unreadCount(user.id),
        notifications: (store.data.notifications[user.id] || []).filter((n) => !n.read).length,
        admin: isAdmin(user),
      };
    },
    // In-app notification, pushed live; emailed when the person is not online and wants that kind.
    notify(user, { type, text, link }) {
      if (!user || user.demo) return null;
      const list = (store.data.notifications[user.id] ||= []);
      const n = { id: store.id('n'), type, text, link, at: now().toISOString(), read: false };
      list.unshift(n);
      list.splice(50);
      hub.publish(user.id, 'notification', n);
      const wants = settingsOf(user).email[type];
      if (wants && hub.count(user.id) === 0) {
        mailer.send({ to: user.email, subject: `Pishi: ${text}`, text: `${text}\n\n${baseUrl}/${link || ''}\n\nYou can change which emails you get under You > Settings.` });
      }
      return n;
    },
  };

  function unreadCount(uid) {
    let n = 0;
    for (const m of Object.values(store.data.matches)) {
      if (!m.users.includes(uid)) continue;
      const seen = m.seen?.[uid] || '';
      if (!seen) n += 1; // a brand-new match counts as something to look at
      n += (store.data.messages[m.id] || []).filter((msg) => msg.from !== uid && msg.at > seen).length;
    }
    return n;
  }

  for (const register of [account, chat, profile, week, matches, notifications, admin]) register(ctx);
  route('GET', '/api/health', async () => ({ body: { ok: true, version: VERSION, engine: pickEngine().name, uptime: Math.round(process.uptime()) } }), { auth: false });

  function serveStatic(req, res) {
    const url = new URL(req.url, 'http://x');
    let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
    if (!file.startsWith(PUBLIC)) return send(res, 404, { error: 'Not found.' });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'",
    });
    fs.createReadStream(file).pipe(res);
  }

  async function handle(req, res) {
    const started = Date.now();
    const url = new URL(req.url, 'http://x');
    if (log) res.on('finish', () => console.log(`${req.method} ${url.pathname.replace(/\/(u|n|it)_[\w-]+|\/[\w-]{16,}(\.\w+)?/g, '/:id')} ${res.statusCode} ${Date.now() - started}ms`));
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed.' });
      return serveStatic(req, res);
    }
    try {
      const found = match(req.method, url.pathname);
      if (!found) throw new HttpError(404, 'Not found.');
      const { r, params } = found;
      const mutating = req.method !== 'GET' && req.method !== 'HEAD';
      // Browsers cannot send JSON cross-site without a CORS preflight, which we never grant.
      if (mutating && !String(req.headers['content-type'] || '').startsWith('application/json')) {
        throw new HttpError(415, 'Send JSON.');
      }
      if (mutating) {
        const ip = req.socket.remoteAddress;
        const bucket = /^\/api\/(signup|login|password\/\w+)$/.test(url.pathname) ? 'auth' : url.pathname === '/api/chat' ? 'chat' : 'write';
        if (!allow(`${ip}:${bucket}`, limits[bucket])) throw new HttpError(429, 'Slow down a little and try again in a minute.');
      }
      const token = parseCookies(req.headers.cookie).sid;
      const session = token && store.data.sessions[token];
      let user = null;
      if (session && session.expires > Date.now()) user = store.data.users[session.userId] || null;
      if (user?.suspended) user = null;
      if (r.auth && !user) throw new HttpError(401, 'Please sign in.');
      if (r.admin && !isAdmin(user)) throw new HttpError(403, 'Only for moderators.');
      if (user && url.pathname === '/api/me') noteActive(store, user);
      const body = mutating ? await readBody(req, r.bodyLimit) : {};
      const out = await r.handler({ req, res, user, token, params, query: url.searchParams, body: body && typeof body === 'object' ? body : {} });
      store.save();
      if (out?.handled) return; // the route wrote its own response (streams, files)
      send(res, out.status || 200, out.body, out.headers);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) send(res, status, { error: status === 500 ? 'Something went wrong.' : err.message });
    }
  }

  handle.ctx = ctx;
  handle.hub = hub;
  return handle;
}
