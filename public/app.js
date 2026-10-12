// ziDate client. Plain modules, no build step. All text goes through textContent.
const main = document.getElementById('main');
const top = document.querySelector('.top');
const toastEl = document.querySelector('.toast');
let me = null;

// --- helpers ---
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v; // CSSOM, allowed by the CSP
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/login') && !url.startsWith('/api/signup')) {
    me = null;
    location.hash = '#/welcome';
  }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function setMe(user) {
  me = user;
  if (!me) return;
  top.querySelector('.dot').hidden = !me.unread;
}

function render(...nodes) {
  main.replaceChildren(...nodes);
  main.className = '';
}

function progress(value) {
  const pct = Math.round(value * 100);
  return h('div', {},
    h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'How well I know you' },
      h('i', { style: `width:${pct}%` })),
    h('div', { class: 'progress-label' }, h('span', {}, 'How well I know you'), h('span', {}, `${pct}%`)));
}

function relTime(iso) {
  const d = new Date(iso);
  const days = Math.round((d - Date.now()) / 864e5);
  if (days <= 0) return 'soon';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

// --- views ---
function welcome() {
  top.hidden = true;
  let mode = 'signup';
  const err = h('p', { class: 'error', role: 'alert' });
  const name = h('input', { type: 'text', id: 'name', autocomplete: 'given-name', maxlength: 40, required: true });
  const email = h('input', { type: 'email', id: 'email', autocomplete: 'email', required: true });
  const pass = h('input', { type: 'password', id: 'password', autocomplete: 'new-password', minlength: 8, required: true });
  const nameField = h('div', {}, h('label', { for: 'name' }, 'First name'), name);
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Start talking');
  const toggle = h('button', { class: 'link', type: 'button' }, 'I already have an account');
  const form = h('form', { class: 'auth', novalidate: true },
    nameField,
    h('div', {}, h('label', { for: 'email' }, 'Email'), email),
    h('div', {}, h('label', { for: 'password' }, 'Password'), pass),
    err, submit, h('p', { class: 'switch' }, toggle));

  toggle.onclick = () => {
    mode = mode === 'signup' ? 'login' : 'signup';
    nameField.hidden = mode === 'login';
    submit.textContent = mode === 'signup' ? 'Start talking' : 'Sign in';
    toggle.textContent = mode === 'signup' ? 'I already have an account' : 'I am new here';
    pass.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    err.textContent = '';
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    err.textContent = '';
    submit.disabled = true;
    try {
      const body = { email: email.value, password: pass.value };
      if (mode === 'signup') body.name = name.value;
      const { user } = await api('POST', mode === 'signup' ? '/api/signup' : '/api/login', body);
      setMe(user);
      location.hash = mode === 'signup' || !user.ready ? '#/talk' : '#/week';
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      submit.disabled = false;
    }
  };

  render(h('section', { class: 'welcome' },
    h('div', { class: 'stack' },
      h('h1', {}, 'Two people a week.', h('br'), h('span', { class: 'muted' }, 'Chosen through conversation.')),
      h('p', { class: 'lede' }, 'No swiping. Talk with your matchmaker, decide what others see, and meet two people each week.')),
    h('ol', { class: 'how' },
      h('li', {}, 'Answer a few questions in a conversation.'),
      h('li', {}, 'You approve every line on your public profile. The rest stays private and is only used for matching.'),
      h('li', {}, 'Every Monday, two suggestions. Like, pass, and tell me why.')),
    form));
}

async function talk() {
  const { messages, me: user } = await api('GET', '/api/chat');
  setMe(user);
  const bar = h('div', {}, progress(user.completeness));
  const log = h('div', { class: 'log', 'aria-live': 'polite' });
  const chips = h('div', { class: 'chips' });
  const input = h('textarea', { rows: 1, placeholder: 'Type your answer', 'aria-label': 'Your answer', maxlength: 1200 });
  const sendBtn = h('button', { class: 'btn', type: 'submit', 'aria-label': 'Send' }, 'Send');
  const form = h('form', { class: 'composer' }, input, sendBtn);

  const add = (m) => log.append(h('p', { class: `msg ${m.role}` }, m.text));
  messages.forEach(add);

  function showChips(m) {
    const list = (m?.choices || []).map((c) => h('button', { class: 'chip', type: 'button', onclick: () => send(c) }, c));
    // Any interview question can be skipped; the basics cannot.
    if (m?.qid && !m.qid.startsWith('b_')) list.push(h('button', { class: 'chip quiet', type: 'button', onclick: () => send('Skip') }, 'Skip'));
    chips.replaceChildren(...list);
  }
  showChips(messages.at(-1));

  let busy = false;
  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    add({ role: 'user', text });
    showChips(null);
    input.value = '';
    autosize();
    const typing = h('p', { class: 'msg agent typing', 'aria-label': 'Typing' }, h('i'), h('i'), h('i'));
    log.append(typing);
    scroll();
    try {
      const { message, me: u } = await api('POST', '/api/chat', { text });
      typing.remove();
      add(message);
      showChips(message);
      setMe(u);
      bar.replaceChildren(progress(u.completeness));
    } catch (ex) {
      typing.remove();
      toast(ex.message);
      input.value = text;
    } finally {
      busy = false;
      sendBtn.disabled = false;
      input.focus();
      scroll();
    }
  }

  function autosize() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }
  const scroll = () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send(input.value);
    }
  });
  form.onsubmit = (e) => {
    e.preventDefault();
    send(input.value);
  };

  render(h('section', { class: 'chat' }, bar, log, chips, form));
  window.scrollTo(0, document.body.scrollHeight);
  input.focus();
}

function personCard(p, { onDecide } = {}) {
  const card = h('article', { class: 'card person' },
    h('h2', {}, p.name),
    h('p', { class: 'meta' }, [p.age, p.city].filter(Boolean).join(' · ')),
    p.bio ? h('p', { class: 'bio' }, p.bio) : null,
    p.reason ? h('p', { class: 'why' }, p.reason) : null,
    p.interests?.length ? h('ul', { class: 'tags', 'aria-label': 'Interests' }, p.interests.map((i) => h('li', {}, i))) : null,
    p.items?.length ? h('dl', { class: 'qa' }, p.items.flatMap((i) => [h('dt', {}, i.prompt || 'About me'), h('dd', {}, i.text)])) : null);
  if (onDecide) {
    if (p.matchId) {
      card.append(h('p', { class: 'decided' }, 'It is mutual. ', h('a', { href: `#/match/${encodeURIComponent(p.matchId)}` }, `Say hello to ${p.name}`)));
    } else if (p.decision) {
      card.append(h('p', { class: 'decided' }, p.decision === 'like' ? 'You liked them. I will tell you if it is mutual.' : 'You passed.'));
    } else {
      const like = h('button', { class: 'btn accent' }, 'Like');
      const pass = h('button', { class: 'btn ghost' }, 'Pass');
      like.onclick = () => onDecide('like', [like, pass]);
      pass.onclick = () => onDecide('pass', [like, pass]);
      card.append(h('div', { class: 'actions' }, pass, like));
    }
  }
  return card;
}

async function week() {
  const data = await api('GET', '/api/week');
  if (!data.ready) {
    render(h('div', { class: 'empty stack' },
      h('h2', {}, 'Not yet.'),
      h('p', { class: 'muted' }, 'I need to know you a little better before I introduce anyone. A few more answers will do it.'),
      me ? progress(me.completeness) : null,
      h('a', { class: 'btn', href: '#/talk' }, 'Keep talking')));
    return;
  }
  if (!data.picks.length) {
    render(h('div', { class: 'empty stack' },
      h('h2', {}, 'No one this week.'),
      h('p', { class: 'muted' }, `I would rather suggest no one than the wrong people. New suggestions arrive ${relTime(data.next)}.`),
      h('a', { class: 'btn ghost', href: '#/talk' }, 'Tell me more about you')));
    return;
  }
  const cards = data.picks.map((p) => personCard(p, {
    onDecide: async (decision, buttons) => {
      buttons.forEach((b) => (b.disabled = true));
      try {
        const res = await api('POST', `/api/week/${p.id}`, { decision });
        if (res.match) {
          toast(`It is mutual. Say hello to ${p.name}.`);
          location.hash = `#/match/${encodeURIComponent(res.match.id)}`;
          return;
        }
        toast(decision === 'like' ? `I will let you know if ${p.name} likes you too.` : 'Passed. Tell me why when you have a moment.');
        week();
      } catch (ex) {
        toast(ex.message);
        buttons.forEach((b) => (b.disabled = false));
      }
    },
  }));
  render(h('div', { class: 'stack' },
    h('div', {}, h('h1', {}, 'This week'), h('p', { class: 'muted' }, `Two people, chosen for you. Next pair ${relTime(data.next)}.`)),
    h('div', { class: 'picks two' }, cards)));
  main.className = 'wide';
}

async function matches() {
  const { matches: list } = await api('GET', '/api/matches');
  if (!list.length) {
    render(h('div', { class: 'empty stack' },
      h('h2', {}, 'No matches yet.'),
      h('p', { class: 'muted' }, 'When you and someone like each other, you can talk here.')));
    return;
  }
  render(h('div', { class: 'stack' }, h('h1', {}, 'Matches'),
    h('ul', { class: 'list' }, list.map((m) => h('li', {},
      h('a', { href: `#/match/${encodeURIComponent(m.id)}` },
        h('div', {},
          h('div', { class: 'name' }, m.person.name),
          h('div', { class: 'preview' }, m.last ? `${m.last.mine ? 'You: ' : ''}${m.last.text}` : 'Say hello')),
        m.unread ? h('span', { class: 'badge' }, String(m.unread)) : m.isNew ? h('span', { class: 'badge' }, 'New') : null))))));
}

async function matchThread(id) {
  const data = await api('GET', `/api/matches/${encodeURIComponent(id)}`);
  const log = h('div', { class: 'log' });
  const add = (m) => log.append(h('p', { class: `msg ${m.mine ? 'user' : 'agent'}` }, m.text));
  data.messages.forEach(add);
  if (!data.messages.length) log.append(h('p', { class: 'muted small center' }, `You matched with ${data.person.name}. Their profile is below.`));
  const input = h('textarea', { rows: 1, placeholder: `Message ${data.person.name}`, 'aria-label': 'Message', maxlength: 1000 });
  const form = h('form', { class: 'composer' }, input, h('button', { class: 'btn', type: 'submit' }, 'Send'));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      const { message } = await api('POST', `/api/matches/${encodeURIComponent(id)}`, { text });
      add(message);
    } catch (ex) {
      toast(ex.message);
      input.value = text;
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  const unmatch = h('button', { class: 'link small', type: 'button' }, 'Unmatch or report');
  unmatch.onclick = async () => {
    const reason = prompt(`Unmatch ${data.person.name}? Add a reason to also report them, or leave it empty.`);
    if (reason === null) return;
    await api('POST', `/api/matches/${encodeURIComponent(id)}/unmatch`, { report: Boolean(reason.trim()), reason });
    toast('Done.');
    location.hash = '#/matches';
  };
  render(h('section', { class: 'chat' },
    h('div', { class: 'section-head' }, h('a', { class: 'back', href: '#/matches' }, '← Matches'), unmatch),
    personCard(data.person), log, form));
}

async function profile() {
  const data = await api('GET', '/api/profile');
  setMe(data.me);
  const { shared, hidden, preview } = data;

  const items = shared.items.filter((i) => i.status !== 'hidden' || true);
  const itemNodes = items.map((it) => {
    const text = h('p', { class: 'text' }, it.text);
    const state = h('span', { class: `state ${it.status}` }, it.status === 'approved' ? 'Visible to matches' : it.status === 'hidden' ? 'Hidden' : 'Suggested by your matchmaker');
    const setStatus = async (status) => {
      await api('PATCH', `/api/profile/items/${it.id}`, { status });
      profile();
    };
    const edit = async () => {
      const next = prompt('Edit this line', it.text);
      if (next == null) return;
      await api('PATCH', `/api/profile/items/${it.id}`, { text: next });
      profile();
    };
    return h('div', { class: 'item' },
      h('div', { class: 'prompt' }, it.prompt || 'About me'), text,
      h('div', { class: 'row' }, state,
        it.status !== 'approved' ? h('button', { class: 'btn small', onclick: () => setStatus('approved') }, 'Show on profile') : h('button', { class: 'btn small ghost', onclick: () => setStatus('hidden') }, 'Hide'),
        h('button', { class: 'btn small ghost', onclick: edit }, 'Edit'),
        h('button', { class: 'link small', onclick: async () => { await api('DELETE', `/api/profile/items/${it.id}`); profile(); } }, 'Remove')));
  });

  const bioBlock = h('div', { class: 'item' },
    h('div', { class: 'prompt' }, 'Bio'),
    h('p', { class: 'text' }, shared.bio || h('span', { class: 'muted' }, 'No bio yet.')),
    shared.bioDraft && shared.bioDraft !== shared.bio
      ? h('div', { class: 'stack' },
        h('p', { class: 'small muted' }, `Suggested: “${shared.bioDraft}”`),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: async () => { await api('PUT', '/api/profile/bio', { useDraft: true }); profile(); } }, 'Use this'),
          h('button', { class: 'btn small ghost', onclick: editBio }, 'Write my own')))
      : h('div', { class: 'row' }, h('button', { class: 'btn small ghost', onclick: editBio }, shared.bio ? 'Edit' : 'Write one')));
  async function editBio() {
    const next = prompt('Your bio', shared.bio || shared.bioDraft || '');
    if (next == null) return;
    await api('PUT', '/api/profile/bio', { text: next });
    profile();
  }

  const traits = hidden.traits.map((t) => h('div', { class: 'trait' },
    h('div', { class: 'label' },
      h('span', {}, t.key[0].toUpperCase() + t.key.slice(1)),
      h('span', { class: 'muted' }, t.label,
        t.confidence >= 0.15 ? h('button', { class: 'link small fix', 'aria-label': `${t.key} is not right`, onclick: async () => {
          await api('POST', `/api/profile/traits/${t.key}/recheck`);
          toast('Got it. I will ask you about that next.');
          location.hash = '#/talk';
        } }, 'Not me') : null)),
    h('div', { class: `bar ${t.confidence < 0.15 ? 'unsure' : ''}`, 'aria-hidden': 'true' }, h('i', { style: `left:${t.value * 100}%` }))));

  const signOut = h('button', { class: 'btn ghost', onclick: async () => { await api('POST', '/api/logout'); me = null; location.hash = '#/welcome'; } }, 'Sign out');
  const del = h('button', { class: 'link danger', onclick: async () => {
    if (!confirm('Delete your account, both profiles and all conversations? This cannot be undone.')) return;
    await api('DELETE', '/api/me');
    me = null;
    location.hash = '#/welcome';
  } }, 'Delete my account');

  render(h('div', { class: 'stack' },
    h('h1', {}, me.name),
    progress(me.completeness),
    h('section', { class: 'card stack' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Shared profile'), h('span', { class: 'small muted' }, 'What matches see')),
      h('p', { class: 'small muted' }, 'Your matchmaker suggests lines from your answers. Nothing appears here until you approve it.'),
      bioBlock,
      ...itemNodes,
      shared.interests.length
        ? h('div', { class: 'item' }, h('div', { class: 'prompt' }, 'Interests'),
          h('ul', { class: 'tags' }, shared.interests.map((i) => h('li', {}, i, h('button', { 'aria-label': `Remove ${i}`, onclick: async () => { await api('DELETE', `/api/profile/interests/${encodeURIComponent(i)}`); profile(); } }, '×')))))
        : null),
    h('details', { class: 'card' },
      h('summary', {}, 'Preview as a match sees it'),
      h('div', { style: 'margin-top:16px' }, personCard(preview))),
    h('section', { class: 'card stack' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Hidden profile'), h('span', { class: 'small muted' }, 'Only used for matching')),
      h('p', { class: 'small muted' }, 'No one else ever sees this. It is how I choose your two people, and it changes as we talk and as you react to suggestions.'),
      h('div', {}, traits),
      hidden.tags.length ? h('div', {}, h('div', { class: 'prompt small muted' }, 'Noted'), h('ul', { class: 'tags' }, hidden.tags.map((t) => h('li', {}, t)))) : null,
      hidden.dealbreakers.length ? h('div', {}, h('div', { class: 'prompt small muted' }, 'Dealbreakers'), h('ul', { class: 'tags' }, hidden.dealbreakers.map((t) => h('li', {}, t)))) : null,
      hidden.notes.length ? h('div', {}, h('div', { class: 'prompt small muted' }, 'Notes'), h('ul', { class: 'notes' }, hidden.notes.map((n) => h('li', {}, n)))) : null),
    h('div', { class: 'row', style: 'display:flex;justify-content:space-between;align-items:center' }, signOut, del)));
}

// --- router ---
const routes = { talk, week, matches, profile };

async function route() {
  const [, name = '', arg] = location.hash.match(/^#\/([^/]*)\/?(.*)$/) || [];
  // Refresh on every navigation so the Matches dot stays current.
  try {
    setMe((await api('GET', '/api/me')).user);
  } catch {
    me = null;
  }
  if (!me) return welcome();
  if (name === 'welcome' || !name) {
    location.hash = me.ready ? '#/week' : '#/talk';
    return;
  }
  top.hidden = false;
  const tab = name === 'match' ? 'matches' : name;
  for (const a of top.querySelectorAll('nav a')) {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  try {
    if (name === 'match') await matchThread(decodeURIComponent(arg));
    else if (routes[name]) await routes[name]();
    else location.hash = '#/talk';
  } catch (ex) {
    render(h('div', { class: 'empty stack' }, h('h2', {}, 'Hmm.'), h('p', { class: 'muted' }, ex.message)));
  }
  main.focus({ preventScroll: true });
}

window.addEventListener('hashchange', route);
route();
