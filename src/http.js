// Small HTTP toolkit: errors, body parsing, JSON responses, a router and a rate limiter.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function readBody(req, limit = 32 * 1024) {
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

export function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

export function router() {
  const routes = [];
  const route = (method, pattern, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
    routes.push({ method, re, keys, handler, auth: opts.auth !== false, admin: Boolean(opts.admin), bodyLimit: opts.bodyLimit, raw: Boolean(opts.raw), saves: Boolean(opts.saves) });
  };
  const match = (method, pathname) => {
    const r = routes.find((x) => x.method === method && x.re.test(pathname));
    if (!r) return null;
    const m = pathname.match(r.re);
    const params = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    return { r, params };
  };
  return { route, match };
}

// Fixed-window rate limiter, per key.
export function limiter() {
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
