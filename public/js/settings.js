// Settings, notifications, and the moderator view.
import { h, api, render, setMe, state, toast, ask, field, ago, prefs, applyTheme, live } from './core.js';

export async function settings() {
  const { user } = await api('GET', '/api/me');
  setMe(user);
  const me = state.me;
  const s = me.settings;
  const b = me.basics;

  const save = async (patch, msg = 'Saved.') => {
    try {
      const res = await api('PUT', '/api/settings', patch);
      setMe(res.user);
      toast(msg);
      return true;
    } catch (ex) {
      toast(ex.message);
      return false;
    }
  };

  // --- basics ---
  const f = {
    name: field({ id: 's-name', label: 'First name', value: me.name, maxlength: 40, autocomplete: 'given-name' }),
    age: field({ id: 's-age', label: 'Age', type: 'number', value: b.age ?? '', min: 18, max: 99, inputmode: 'numeric' }),
    gender: field({ id: 's-gender', label: 'I am', type: 'select', value: b.gender || 'woman', options: [['woman', 'a woman'], ['man', 'a man'], ['nonbinary', 'non-binary']] }),
    seeking: field({ id: 's-seeking', label: 'I want to meet', type: 'select', value: b.seeking || 'everyone', options: [['women', 'women'], ['men', 'men'], ['everyone', 'everyone']] }),
    ageRange: field({ id: 's-range', label: 'Age range', type: 'select', value: String(b.ageRange ?? 8), options: [3, 5, 8, 10, 15, 20].map((n) => [String(n), `within ${n} years`]) }),
    city: field({ id: 's-city', label: 'City', value: b.city || '', maxlength: 50, autocomplete: 'address-level2' }),
  };
  const basicsForm = h('form', { class: 'stack', novalidate: true },
    f.name.node,
    h('div', { class: 'field-row' }, f.age.node, f.city.node),
    h('div', { class: 'field-row' }, f.gender.node, f.seeking.node),
    f.ageRange.node,
    h('div', {}, h('button', { class: 'btn small', type: 'submit' }, 'Save basics')));
  basicsForm.onsubmit = async (e) => {
    e.preventDefault();
    const basics = { name: f.name.input.value, city: f.city.input.value, gender: f.gender.input.value, seeking: f.seeking.input.value, ageRange: Number(f.ageRange.input.value) };
    if (f.age.input.value) basics.age = Number(f.age.input.value);
    if (await save({ basics })) settings();
  };

  // --- switches ---
  const toggle = (label, hint, checked, onchange) => {
    const id = `t-${label.replace(/\W+/g, '-').toLowerCase()}`;
    const input = h('input', { type: 'checkbox', id, role: 'switch' });
    input.checked = checked;
    input.onchange = () => onchange(input.checked, input);
    return h('label', { class: 'switch-row', for: id }, h('span', {}, label, hint ? h('small', {}, hint) : null), input);
  };
  const privacy = h('section', { class: 'card' },
    h('h2', {}, 'Visibility'),
    toggle('Pause my account', 'Stop new suggestions and hide me from others. Matches stay.', s.paused, async (v, el) => {
      if (!(await save({ paused: v }, v ? 'Paused. No one new will see you.' : 'Welcome back. You are visible again.'))) el.checked = !v;
    }),
    toggle('Show photos only after a match', 'Weekly suggestions see your profile without photos.', s.photosAfterMatch, async (v, el) => {
      if (!(await save({ photosAfterMatch: v }))) el.checked = !v;
    }));

  const emails = h('section', { class: 'card' },
    h('h2', {}, 'Emails'),
    h('p', { class: 'hint' }, 'Only sent when you do not have Pishi open.'),
    ...[['picks', 'New weekly suggestions'], ['match', 'A new match'], ['message', 'A new message']].map(([k, label]) =>
      toggle(label, null, s.email[k], async (v, el) => {
        if (!(await save({ email: { [k]: v } }))) el.checked = !v;
      })));

  // --- theme ---
  const theme = prefs.get('theme', 'auto');
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Theme' },
    [['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']].map(([k, label]) => {
      const btn = h('button', { type: 'button', 'aria-pressed': String(theme === k) }, label);
      btn.onclick = () => {
        prefs.set('theme', k === 'auto' ? null : k);
        applyTheme(k);
        for (const x of seg.children) x.setAttribute('aria-pressed', String(x === btn));
      };
      return btn;
    }));

  // --- account ---
  const verifyBanner = me.emailVerified ? null : h('div', { class: 'banner' },
    h('span', {}, `Please confirm ${me.email}.`),
    h('button', { class: 'btn small ghost', type: 'button', onclick: async (e) => {
      e.target.disabled = true;
      await api('POST', '/api/verify/resend');
      toast('Sent. Check your inbox.');
    } }, 'Resend email'));

  const changePassword = async () => {
    const v = await ask({
      title: 'Change password',
      fields: [
        { name: 'current', label: 'Current password', type: 'password', autocomplete: 'current-password' },
        { name: 'password', label: 'New password', type: 'password', autocomplete: 'new-password' },
      ],
      validate: (x) => (x.password.length < 8 ? 'Use at least 8 characters for the new password.' : ''),
    });
    if (!v) return;
    try {
      await api('POST', '/api/password/change', v);
      toast('Password changed. Other devices are signed out.');
    } catch (ex) {
      toast(ex.message);
    }
  };
  const logoutOthers = async () => {
    const { ended } = await api('POST', '/api/logout-others');
    toast(ended ? `Signed out ${ended} other ${ended === 1 ? 'device' : 'devices'}.` : 'No other devices were signed in.');
  };
  const signOut = async () => {
    await api('POST', '/api/logout');
    setMe(null);
    location.hash = '#/welcome';
  };
  const del = async () => {
    const v = await ask({
      title: 'Delete your account?',
      text: 'This removes both profiles, your photos, matches and all conversations. It cannot be undone.',
      fields: [{ name: 'confirm', label: 'Type DELETE to confirm', autocomplete: 'off' }],
      confirm: 'Delete everything',
      danger: true,
      validate: (x) => (x.confirm.trim().toUpperCase() === 'DELETE' ? '' : 'Type DELETE to confirm.'),
    });
    if (!v) return;
    await api('DELETE', '/api/me');
    setMe(null);
    location.hash = '#/welcome';
  };

  render(h('div', { class: 'stack settings' },
    h('a', { class: 'back', href: '#/profile' }, '← You'),
    h('h1', {}, 'Settings'),
    verifyBanner,
    h('section', { class: 'card' }, h('h2', {}, 'Basics'), basicsForm),
    privacy,
    emails,
    h('section', { class: 'card' }, h('h2', {}, 'Appearance'), h('div', {}, seg)),
    h('section', { class: 'card' },
      h('h2', {}, 'Account'),
      h('p', { class: 'hint' }, `Signed in as ${me.email}.`),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn small ghost', type: 'button', onclick: changePassword }, 'Change password'),
        h('button', { class: 'btn small ghost', type: 'button', onclick: logoutOthers }, 'Sign out other devices'),
        h('a', { class: 'btn small ghost', href: '/api/me/export', download: 'pishi-my-data.json' }, 'Download my data'),
        me.admin ? h('a', { class: 'btn small ghost', href: '#/admin' }, 'Moderation') : null),
      h('div', { class: 'row spread' },
        h('button', { class: 'btn ghost', type: 'button', onclick: signOut }, 'Sign out'),
        h('button', { class: 'link danger', type: 'button', onclick: del }, 'Delete my account'))),
    h('p', { class: 'small muted center' }, h('a', { href: '#/about' }, 'How Pishi works'), ` · matchmaker: ${me.engine === 'claude' ? 'Claude' : 'offline'}`)));
}

export async function notifications() {
  const { notifications: list } = await api('GET', '/api/notifications');
  const open = async (n) => {
    if (!n.read) await api('POST', '/api/notifications/read', { id: n.id }).catch(() => {});
  };
  const markAll = h('button', { class: 'link small', type: 'button' }, 'Mark all as read');
  markAll.onclick = async () => {
    await api('POST', '/api/notifications/read', {});
    notifications();
    setMe((await api('GET', '/api/me')).user);
  };
  render(h('div', { class: 'stack' },
    h('div', { class: 'section-head' }, h('h1', {}, 'Notifications'), list.some((n) => !n.read) ? markAll : null),
    list.length
      ? h('ul', { class: 'notes-list' }, list.map((n) => h('li', { class: n.read ? '' : 'unread' },
        h('a', { href: n.link || '#/week', onclick: () => open(n) }, n.text, h('time', { datetime: n.at }, ago(n.at))))))
      : h('div', { class: 'empty' }, h('p', { class: 'muted' }, 'Nothing yet. I will tell you here when your two people arrive and when someone likes you back.'))));
  live.on('notification', () => notifications());
}

export async function adminView() {
  if (!state.me?.admin) throw new Error('Only for moderators.');
  const [{ reports }, stats] = await Promise.all([api('GET', '/api/admin/reports'), api('GET', '/api/admin/stats')]);
  const label = { people: 'People', ready: 'Ready to match', paused: 'Paused', suspended: 'Suspended', picksThisWeek: 'Weeks served', matches: 'Matches', messagesThisWeek: 'Messages, 7 days', openReports: 'Open reports', demo: 'Demo profiles' };
  const actOn = (r, action) => async () => {
    if (action === 'suspend') {
      const v = await ask({ title: `Suspend ${r.about.name}?`, text: 'They are signed out everywhere and get an email.', confirm: 'Suspend', danger: true });
      if (!v) return;
    }
    try {
      await api('POST', `/api/admin/reports/${encodeURIComponent(r.id)}`, { action });
      toast('Done.');
      adminView();
    } catch (ex) {
      toast(ex.message);
    }
  };
  render(h('div', { class: 'stack' },
    h('a', { class: 'back', href: '#/settings' }, '← Settings'),
    h('h1', {}, 'Moderation'),
    h('div', { class: 'stat-grid' }, Object.entries(label).map(([k, l]) => h('div', {}, h('b', {}, String(stats[k] ?? 0)), h('span', { class: 'small muted' }, l)))),
    h('section', { class: 'card' },
      h('h2', {}, 'Reports'),
      reports.length ? reports.map((r) => h('div', { class: 'report' },
        h('div', { class: 'section-head' },
          h('strong', {}, `${r.about.name}${r.about.suspended ? ' (suspended)' : ''}`),
          h('span', { class: 'small muted' }, `${r.status} · ${ago(r.at)} · from ${r.by.name}${r.source ? ` · ${r.source}` : ''}`)),
        r.reason ? h('p', {}, r.reason) : null,
        r.context?.length ? h('blockquote', {}, r.context.map((c) => h('div', {}, `${c.from}: ${c.text}`))) : null,
        r.status === 'open' ? h('div', { class: 'row wrap' },
          h('button', { class: 'btn small ghost', type: 'button', onclick: actOn(r, 'dismiss') }, 'Dismiss'),
          h('button', { class: 'btn small danger', type: 'button', onclick: actOn(r, 'suspend') }, 'Suspend')) : null,
        r.about.suspended ? h('div', {}, h('button', { class: 'link small', type: 'button', onclick: actOn(r, 'restore') }, 'Restore account')) : null))
        : h('p', { class: 'muted' }, 'No reports. Good.'))));
}
