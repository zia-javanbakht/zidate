// Router and app start.
import { h, api, render, setMe, state, top, main, live, skeleton, toast, applyTheme } from './core.js';
import { welcome, forgot, reset, verify, about } from './auth.js';
import { talk } from './talk.js';
import { week, matches, thread } from './people.js';
import { profile } from './profile.js';
import { settings, notifications, adminView } from './settings.js';

applyTheme();

// Screens anyone can open, signed in or not.
const open = { forgot, reset, verify, about };
const signedIn = { talk, week, matches, match: thread, profile, settings, notifications, admin: adminView };
const tabOf = { match: 'matches', settings: 'profile', admin: 'profile' };

// Live events that matter on every screen.
live.on('notification', (n) => {
  if (!state.me) return;
  state.me.notifications += 1;
  setMe(state.me);
  if (!location.hash.startsWith('#/notifications')) toast(n.text);
}, { view: false });
live.on('message', (ev) => {
  if (!state.me || location.hash === `#/match/${encodeURIComponent(ev.matchId)}`) return;
  state.me.unread += 1;
  setMe(state.me);
}, { view: false });

function notFound() {
  render(h('div', { class: 'empty stack' },
    h('h2', {}, 'Nothing here.'),
    h('p', { class: 'muted' }, 'That page does not exist, or it is no longer there.'),
    h('a', { class: 'btn ghost', href: '#/' }, 'Go home')));
}

let seq = 0;
async function route() {
  const n = ++seq;
  const [, name = '', arg = ''] = location.hash.match(/^#\/([^/]*)\/?(.*)$/) || [];
  live.clearViews();
  // Show a placeholder only if loading is slow, so fast screens do not flicker.
  const slow = setTimeout(() => n === seq && render(skeleton()), 150);
  try {
    // Refresh on every navigation so the header dots stay current.
    try {
      setMe((await api('GET', '/api/me')).user);
    } catch {
      setMe(null);
    }
    if (n !== seq) return;
    window.scrollTo(0, 0); // each screen starts at the top; conversations scroll themselves to the latest message
    if (open[name]) {
      await open[name](decodeURIComponent(arg));
    } else if (!state.me) {
      welcome();
    } else if (name === 'welcome' || !name) {
      location.replace(state.me.ready ? '#/week' : '#/talk');
      return;
    } else if (signedIn[name]) {
      top.hidden = false;
      const tab = tabOf[name] || name;
      for (const a of top.querySelectorAll('nav a, .bell')) {
        if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      }
      await signedIn[name](decodeURIComponent(arg));
    } else {
      top.hidden = false;
      notFound();
    }
  } catch (ex) {
    if (n !== seq) return;
    if (ex.status === 404) notFound();
    else if (ex.status !== 401) render(h('div', { class: 'empty stack' }, h('h2', {}, 'Hmm.'), h('p', { class: 'muted' }, ex.message), h('button', { class: 'btn ghost', type: 'button', onclick: route }, 'Try again')));
  } finally {
    clearTimeout(slow);
  }
  if (n === seq) main.focus({ preventScroll: true });
}

window.addEventListener('hashchange', route);
route();

// Works offline as an installed app: the shell is cached, the API never is.
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});
