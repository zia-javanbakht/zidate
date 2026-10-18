// Accounts: sign up, sign in, email verification, passwords, settings, export, deletion.
import crypto from 'node:crypto';
import { hashPassword, verifyPassword } from '../auth.js';
import { cleanText, settingsOf, describeHidden } from '../profile.js';
import { normalizeCity } from '../cities.js';
import { now, validTimeZone } from '../clock.js';
import { currentWeek } from '../matching.js';
import { signalsOf, summarizeSignals, forget } from '../signals.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TOKEN_TTL = { verify: 7 * 864e5, reset: 3600e3 };

export default function account(ctx) {
  const { store, route, HttpError, meView, startSession, endSessions, cookie, mailer, baseUrl, photos, newUser } = ctx;

  // Per-account lockout on top of the per-address rate limit, so guessing from many places fails too.
  const fails = new Map();
  const LOCK_AFTER = 8;
  const LOCK_MS = 15 * 60e3;
  const locked = (email) => {
    const f = fails.get(email);
    return Boolean(f && Date.now() - f.start < LOCK_MS && f.n >= LOCK_AFTER);
  };
  const recordFail = (email) => {
    const f = fails.get(email);
    if (!f || Date.now() - f.start >= LOCK_MS) fails.set(email, { start: Date.now(), n: 1 });
    else f.n++;
    if (fails.size > 10000) fails.clear();
  };

  function issueToken(user, type) {
    store.data.tokens ||= {};
    // One live token per purpose.
    for (const [t, v] of Object.entries(store.data.tokens)) if (v.userId === user.id && v.type === type) delete store.data.tokens[t];
    const token = crypto.randomBytes(24).toString('base64url');
    store.data.tokens[token] = { type, userId: user.id, expires: Date.now() + TOKEN_TTL[type] };
    return token;
  }

  function useToken(token, type) {
    const t = store.data.tokens?.[token];
    if (!t || t.type !== type || t.expires < Date.now()) throw new HttpError(400, 'That link has expired or was already used.');
    delete store.data.tokens[token];
    const user = store.data.users[t.userId];
    if (!user) throw new HttpError(400, 'That link has expired or was already used.');
    return user;
  }

  function sendVerify(user) {
    const token = issueToken(user, 'verify');
    return mailer.send({ to: user.email, subject: 'Confirm your email for Pishi', text: `Hi ${user.name},\n\nConfirm your email so we can tell you when your two people arrive:\n${baseUrl}/#/verify/${token}\n\nIf this was not you, ignore this email.` });
  }

  function checkPassword(password) {
    if (password.length < 8) throw new HttpError(400, 'Use at least 8 characters for your password.');
    if (password.length > 200) throw new HttpError(400, 'That password is too long.');
  }

  route('POST', '/api/signup', async ({ body }) => {
    const name = cleanText(body.name, 40);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!name) throw new HttpError(400, 'What should I call you?');
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'That email does not look right.');
    checkPassword(password);
    if (Object.values(store.data.users).some((u) => u.email === email)) throw new HttpError(409, 'That email already has an account. Try signing in.');
    const user = newUser({ name, email, password });
    // Weekly picks arrive at midnight in the person's own time zone, as their browser reports it.
    if (validTimeZone(body.timeZone)) settingsOf(user).timeZone = body.timeZone;
    sendVerify(user);
    return { status: 201, body: { user: meView(user) }, headers: { 'Set-Cookie': startSession(user) } };
  }, { auth: false });

  route('POST', '/api/login', async ({ body }) => {
    const email = String(body.email || '').trim().toLowerCase();
    if (locked(email)) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes, or reset your password.');
    const user = Object.values(store.data.users).find((u) => u.email === email);
    if (!user || !user.password || !verifyPassword(String(body.password || ''), user.password)) {
      recordFail(email);
      throw new HttpError(401, 'Email or password is wrong.');
    }
    fails.delete(email);
    if (user.suspended) throw new HttpError(403, 'This account has been suspended. Reply to our email if you think this is a mistake.');
    return { body: { user: meView(user) }, headers: { 'Set-Cookie': startSession(user) } };
  }, { auth: false });

  route('POST', '/api/logout', async ({ token }) => {
    delete store.data.sessions[token];
    return { body: { ok: true }, headers: { 'Set-Cookie': cookie('', 0) } };
  });

  route('POST', '/api/logout-others', async ({ user, token }) => {
    const before = Object.values(store.data.sessions).filter((s) => s.userId === user.id).length;
    endSessions(user.id, token);
    return { body: { ended: before - 1 } };
  });

  // Signed-out is a normal state for this endpoint, not an error.
  route('GET', '/api/me', async ({ user }) => ({ body: { user: user ? meView(user) : null } }), { auth: false, saves: true });

  // --- email verification ---
  route('POST', '/api/verify', async ({ body }) => {
    const user = useToken(String(body.token || ''), 'verify');
    user.emailVerified = true;
    return { body: { ok: true } };
  }, { auth: false });

  route('POST', '/api/verify/resend', async ({ user }) => {
    if (user.emailVerified) return { body: { ok: true } };
    await sendVerify(user);
    return { body: { ok: true } };
  });

  // --- passwords ---
  route('POST', '/api/password/change', async ({ user, token, body }) => {
    if (!verifyPassword(String(body.current || ''), user.password)) throw new HttpError(400, 'Your current password is not right.');
    const next = String(body.password || '');
    checkPassword(next);
    user.password = hashPassword(next);
    endSessions(user.id, token); // anyone else signed in is signed out
    return { body: { ok: true } };
  });

  route('POST', '/api/password/forgot', async ({ body }) => {
    const email = String(body.email || '').trim().toLowerCase();
    const user = Object.values(store.data.users).find((u) => u.email === email && u.password);
    if (user) {
      const t = issueToken(user, 'reset');
      await mailer.send({ to: user.email, subject: 'Reset your Pishi password', text: `Hi ${user.name},\n\nChoose a new password here (the link works for one hour):\n${baseUrl}/#/reset/${t}\n\nIf you did not ask for this, you can ignore this email.` });
    }
    // Same answer either way, so this cannot be used to find out who has an account.
    return { body: { ok: true } };
  }, { auth: false });

  route('POST', '/api/password/reset', async ({ body }) => {
    const next = String(body.password || '');
    checkPassword(next);
    const user = useToken(String(body.token || ''), 'reset');
    user.password = hashPassword(next);
    user.emailVerified = true; // they proved they can read the inbox
    endSessions(user.id);
    return { body: { user: meView(user) }, headers: { 'Set-Cookie': startSession(user) } };
  }, { auth: false });

  // --- settings ---
  route('PUT', '/api/settings', async ({ user, body }) => {
    const s = settingsOf(user);
    if (typeof body.paused === 'boolean') s.paused = body.paused;
    if (typeof body.photosAfterMatch === 'boolean') s.photosAfterMatch = body.photosAfterMatch;
    for (const k of ['picks', 'match', 'message']) if (typeof body.email?.[k] === 'boolean') s.email[k] = body.email[k];
    // Someone to tell about date plans (Share Date). null removes them.
    if (body.trustedContact === null) delete s.trustedContact;
    else if (body.trustedContact !== undefined) {
      const name = cleanText(body.trustedContact?.name, 40);
      const email = String(body.trustedContact?.email || '').trim().toLowerCase();
      if (!name) throw new HttpError(400, 'Who is your trusted contact?');
      if (!EMAIL_RE.test(email) || email.length > 200) throw new HttpError(400, 'That email does not look right.');
      if (email === user.email) throw new HttpError(400, 'Pick someone other than yourself.');
      s.trustedContact = { name, email };
    }
    // Which day the weekly two arrive, in the person's own time zone.
    const day = body.matchDay === undefined ? s.matchDay : Number(body.matchDay);
    if (!Number.isInteger(day) || day < 0 || day > 6) throw new HttpError(400, 'Pick a day of the week.');
    const tz = body.timeZone === undefined ? s.timeZone : String(body.timeZone);
    if (!validTimeZone(tz)) throw new HttpError(400, 'That time zone is not recognised.');
    if (day !== s.matchDay || tz !== s.timeZone) {
      // Keep the week that is current now, so changing the day cannot repeat or skip one.
      s.weekFloor = currentWeek(user);
      s.matchDay = day;
      s.timeZone = tz;
    }
    const b = body.basics || {};
    if (b.name !== undefined) {
      const name = cleanText(b.name, 40);
      if (!name) throw new HttpError(400, 'Your name cannot be empty.');
      user.name = name;
    }
    if (b.gender !== undefined) {
      if (!['woman', 'man', 'nonbinary'].includes(b.gender)) throw new HttpError(400, 'Pick woman, man or non-binary.');
      user.basics.gender = b.gender;
    }
    if (b.seeking !== undefined) {
      if (!['women', 'men', 'everyone'].includes(b.seeking)) throw new HttpError(400, 'Pick women, men or everyone.');
      user.basics.seeking = b.seeking;
    }
    if (b.age !== undefined) {
      const age = Number(b.age);
      if (!Number.isInteger(age) || age < 18 || age > 99) throw new HttpError(400, 'Age must be a whole number from 18 to 99.');
      user.basics.age = age;
    }
    if (b.ageRange !== undefined) {
      const r = Number(b.ageRange);
      if (![3, 5, 8, 10, 15, 20].includes(r)) throw new HttpError(400, 'Pick one of the age ranges.');
      user.basics.ageRange = r;
    }
    if (b.distance !== undefined) {
      if (!['near', 'hours', 'any'].includes(b.distance)) throw new HttpError(400, 'Pick how far you would go.');
      user.basics.distance = b.distance;
    }
    if (b.city !== undefined) {
      const city = normalizeCity(cleanText(b.city, 50));
      if (!city) throw new HttpError(400, 'Your city cannot be empty.');
      user.basics.city = city;
    }
    return { body: { user: meView(user) } };
  });

  // --- your data ---
  route('GET', '/api/me/export', async ({ user, res }) => {
    const mine = (table) => Object.entries(store.data[table] || {}).filter(([k]) => k.split('>')[0] === user.id).map(([k, at]) => ({ person: k.split('>')[1], at }));
    const data = {
      exportedAt: now().toISOString(),
      account: { name: user.name, email: user.email, createdAt: user.createdAt, basics: user.basics, settings: settingsOf(user) },
      sharedProfile: user.shared,
      hiddenProfile: { ...describeHidden(user), raw: user.hidden },
      // Kept only for matching and never shown in the app; included here because it is yours.
      // What people who met you said stays theirs: only how many answered is included.
      matchingSignals: { summary: summarizeSignals(signalsOf(store, user.id)), raw: { ...signalsOf(store, user.id), dateReviews: { count: Object.keys(signalsOf(store, user.id).dateReviews).length } } },
      photos: (user.photos || []).map((p) => p.id),
      conversationWithMatchmaker: store.data.conversations[user.id]?.messages || [],
      datePlans: Object.values(store.data.dates || {}).filter((d) => d.userId === user.id),
      likes: mine('likes'),
      passes: mine('passes'),
      matches: Object.values(store.data.matches).filter((m) => m.users.includes(user.id)).map((m) => ({
        with: store.data.users[m.users.find((u) => u !== user.id)]?.name,
        since: m.createdAt,
        messages: (store.data.messages[m.id] || []).map((x) => ({ mine: x.from === user.id, text: x.text, at: x.at })),
      })),
    };
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="pishi-my-data.json"',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(data, null, 2));
    return { handled: true };
  });

  route('DELETE', '/api/me', async ({ user }) => {
    const id = user.id;
    for (const p of user.photos || []) photos.remove(p.id);
    delete store.data.users[id];
    delete store.data.conversations[id];
    forget(store, id);
    delete store.data.suggested?.[id];
    delete store.data.notifications?.[id];
    endSessions(id);
    for (const [t, v] of Object.entries(store.data.tokens || {})) if (v.userId === id) delete store.data.tokens[t];
    for (const k of Object.keys(store.data.weeks)) if (k.startsWith(`${id}:`)) delete store.data.weeks[k];
    for (const [k, d] of Object.entries(store.data.dates || {})) if (d.userId === id) delete store.data.dates[k];
    for (const table of [store.data.likes, store.data.passes, store.data.blocks, store.data.likeNotes || {}]) {
      for (const k of Object.keys(table)) if (k.split('>').includes(id)) delete table[k];
    }
    for (const [mid, m] of Object.entries(store.data.matches)) {
      if (m.users.includes(id)) {
        delete store.data.matches[mid];
        delete store.data.messages[mid];
      }
    }
    return { body: { ok: true }, headers: { 'Set-Cookie': cookie('', 0) } };
  });
}
