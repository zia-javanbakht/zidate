// The conversation with the matchmaker.
import { h, api, render, setMe, toast, progress, counter, prefs } from './core.js';

export async function talk() {
  const { messages, me: user } = await api('GET', '/api/chat');
  setMe(user);
  const bar = h('div', {}, progress(user.completeness));
  const log = h('div', { class: 'log', 'aria-live': 'polite' });
  const chips = h('div', { class: 'chips' });
  const draftKey = `draft:${user.id}`;
  const input = h('textarea', { rows: 1, placeholder: 'Type your answer', 'aria-label': 'Your answer', maxlength: 1200 });
  input.value = prefs.get(draftKey, '');
  const sendBtn = h('button', { class: 'btn', type: 'submit' }, 'Send');
  const form = h('form', { class: 'composer' }, h('div', { class: 'grow' }, input, counter(input, 1200)), sendBtn);

  const add = (m) => {
    if (m.notice === 'ready') {
      log.append(h('div', { class: 'notice' }, h('p', {}, m.text), h('a', { class: 'btn accent small', href: '#/week' }, 'Meet this week’s two')));
      return;
    }
    if (m.notice === 'guide') {
      log.append(h('div', { class: 'notice' }, h('p', {}, m.text), h('a', { class: 'btn small ghost', href: m.link }, m.label)));
      return;
    }
    log.append(h('p', { class: `msg ${m.role}` }, m.text));
  };
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
    prefs.set(draftKey, null);
    autosize();
    const typing = h('p', { class: 'msg agent typing', 'aria-label': 'Typing' }, h('i'), h('i'), h('i'));
    log.append(typing);
    scroll();
    try {
      const { message, messages: fresh, me: u } = await api('POST', '/api/chat', { text });
      typing.remove();
      (fresh || [message]).forEach(add);
      showChips(message);
      setMe(u);
      bar.replaceChildren(progress(u.completeness));
    } catch (ex) {
      typing.remove();
      log.lastChild?.remove(); // the unsent answer goes back into the box
      toast(ex.message);
      input.value = text;
      prefs.set(draftKey, text);
      showChips(messages.at(-1));
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

  input.addEventListener('input', () => {
    autosize();
    prefs.set(draftKey, input.value); // a half-written answer survives a reload
  });
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
  autosize();
  window.scrollTo(0, document.body.scrollHeight);
  input.focus({ preventScroll: true });
}
