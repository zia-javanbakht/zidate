// Shared client pieces: DOM helper, API calls, toasts, dialogs, live events, small formatters.
// All text reaches the page through textContent; inline styles go through CSSOM (allowed by the CSP).

export const main = document.getElementById('main');
export const top = document.querySelector('.top');
const toastEl = document.querySelector('.toast');

export const state = { me: null };

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// --- network ---
const offlineBanner = h('div', { class: 'banner offline', role: 'status', hidden: true }, 'You are offline. I will catch up when the connection is back.');
document.body.append(offlineBanner);
const setOffline = (off) => { offlineBanner.hidden = !off; };
window.addEventListener('offline', () => setOffline(true));
window.addEventListener('online', () => setOffline(false));

export async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
      credentials: 'same-origin',
    });
  } catch {
    setOffline(true);
    throw new Error('You seem to be offline. Try again in a moment.');
  }
  setOffline(false);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !/^\/api\/(login|signup|password|verify)/.test(url)) {
    setMe(null);
    if (!location.hash.startsWith('#/welcome')) location.hash = '#/welcome';
  }
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong.');
    err.status = res.status;
    throw err;
  }
  return data;
}

export function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

// --- who is signed in, and the header dots ---
export function setMe(user) {
  state.me = user;
  if (!user) {
    live.stop();
    return;
  }
  top.querySelector('nav .dot').hidden = !user.unread;
  const bellDot = top.querySelector('.bell .dot');
  bellDot.hidden = !user.notifications;
  top.querySelector('.bell').setAttribute('aria-label', user.notifications ? `Notifications, ${user.notifications} new` : 'Notifications');
  live.start();
}

// --- live events (server-sent) ---
export const live = {
  source: null,
  handlers: new Map(),
  start() {
    if (this.source || typeof EventSource === 'undefined') return;
    this.source = new EventSource('/api/events');
    for (const type of ['notification', 'message', 'seen', 'unmatched']) {
      this.source.addEventListener(type, (e) => {
        let data = {};
        try { data = JSON.parse(e.data); } catch { /* ignore */ }
        for (const fn of this.handlers.get(type) || []) fn(data);
      });
    }
  },
  stop() {
    this.source?.close();
    this.source = null;
  },
  // Views subscribe for as long as they are on screen; the router clears view handlers on navigation.
  on(type, fn, { view = true } = {}) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    fn.view = view;
    this.handlers.get(type).add(fn);
  },
  clearViews() {
    for (const set of this.handlers.values()) for (const fn of set) if (fn.view) set.delete(fn);
  },
};

// --- rendering ---
export function render(...nodes) {
  main.replaceChildren(...nodes);
  main.className = '';
}

export function skeleton() {
  return h('div', { class: 'skeleton', 'aria-label': 'Loading' }, h('i'), h('i'), h('i'), h('i'));
}

export function progress(value) {
  const pct = Math.round(value * 100);
  return h('div', {},
    h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'How well I know you' },
      h('i', { style: `width:${pct}%` })),
    h('div', { class: 'progress-label' }, h('span', {}, 'How well I know you'), h('span', {}, `${pct}%`)));
}

export function field({ id, label, type = 'text', value = '', options, ...rest }) {
  let input;
  if (type === 'textarea') input = h('textarea', { id, rows: 4, ...rest });
  else if (type === 'select') input = h('select', { id, ...rest }, options.map((o) => (Array.isArray(o) ? h('option', { value: o[0] }, o[1]) : h('option', { value: o }, o))));
  else input = h('input', { id, type, ...rest });
  if (type !== 'select' || value) input.value = value ?? ''; // a select keeps its first option by default
  return { input, node: h('div', {}, h('label', { for: id }, label), input) };
}

// --- dialogs (instead of prompt/confirm) ---
let dialogCount = 0;
// fields: [{ name, label, type, value, options, maxlength, placeholder }]
// Resolves to { name: value } on confirm, or null when cancelled.
export function ask({ title, text, fields = [], confirm = 'Save', danger = false, validate }) {
  return new Promise((resolve) => {
    const n = ++dialogCount;
    const err = h('p', { class: 'error', role: 'alert' });
    const inputs = {};
    const nodes = fields.map((f) => {
      if (f.type === 'checkbox') {
        const input = h('input', { type: 'checkbox', id: `d${n}-${f.name}` });
        input.checked = Boolean(f.value);
        inputs[f.name] = input;
        return h('label', { class: 'switch-row', for: input.id }, h('span', {}, f.label), input);
      }
      const { input, node } = field({ id: `d${n}-${f.name}`, label: f.label, type: f.type, value: f.value, options: f.options, maxlength: f.maxlength, placeholder: f.placeholder, autocomplete: f.autocomplete });
      inputs[f.name] = input;
      if (f.maxlength && (f.type === 'textarea' || !f.type)) node.append(counter(input, f.maxlength));
      return node;
    });
    const ok = h('button', { class: `btn small ${danger ? 'danger' : ''}`, type: 'submit' }, confirm);
    const cancel = h('button', { class: 'btn small ghost', type: 'button' }, 'Cancel');
    const form = h('form', { method: 'dialog' },
      h('h2', {}, title), text ? h('p', { class: 'muted' }, text) : null, ...nodes, err, h('div', { class: 'row' }, cancel, ok));
    const dlg = h('dialog', { 'aria-label': title }, form);
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      dlg.close();
      dlg.remove();
      resolve(value);
    };
    cancel.onclick = () => finish(null);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    form.onsubmit = (e) => {
      e.preventDefault();
      const values = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.type === 'checkbox' ? el.checked : el.value]));
      const problem = validate?.(values);
      if (problem) {
        err.textContent = problem;
        return;
      }
      finish(values);
    };
    document.body.append(dlg);
    dlg.showModal();
    (Object.values(inputs)[0] || ok).focus();
  });
}

export function counter(input, max) {
  const out = h('div', { class: 'count', 'aria-live': 'polite' });
  const update = () => {
    const left = max - input.value.length;
    out.textContent = left < max * 0.25 ? `${left} characters left` : '';
  };
  input.addEventListener('input', update);
  update();
  return out;
}

// --- time ---
export function ago(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function until(iso) {
  const days = Math.round((Date.parse(iso) - Date.now()) / 864e5);
  if (days <= 0) return 'soon';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

export function clock(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// --- local preferences (best effort; storage can be unavailable) ---
export const prefs = {
  get(k, d = null) {
    try { return localStorage.getItem(`pishi:${k}`) ?? d; } catch { return d; }
  },
  set(k, v) {
    try {
      if (v == null || v === '') localStorage.removeItem(`pishi:${k}`);
      else localStorage.setItem(`pishi:${k}`, v);
    } catch { /* ignore */ }
  },
};

export function applyTheme(theme = prefs.get('theme', 'auto')) {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
}

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const pretty = (tag) => tag.replace(/-/g, ' ');
