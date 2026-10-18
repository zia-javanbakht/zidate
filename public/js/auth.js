// Signed-out screens: welcome (sign up / sign in), forgot and reset password, email confirmation, about.
import { h, api, render, setMe, state, toast, top, field } from './core.js';

let lastEmail = ''; // carried from sign-in to "forgot password" so it is not typed twice

export function welcome() {
  top.hidden = true;
  let mode = 'signup';
  const err = h('p', { class: 'error', role: 'alert' });
  const name = field({ id: 'name', label: 'First name', autocomplete: 'given-name', maxlength: 40, required: true });
  const email = field({ id: 'email', label: 'Email', type: 'email', autocomplete: 'email', required: true });
  const pass = field({ id: 'password', label: 'Password', type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Start talking');
  const toggle = h('button', { class: 'link', type: 'button' }, 'I already have an account');
  const forgot = h('a', { class: 'link small', href: '#/forgot', hidden: true, onclick: () => { lastEmail = email.input.value; } }, 'Forgot your password?');
  const form = h('form', { class: 'auth', novalidate: true },
    name.node, email.node, pass.node, err, submit, h('p', { class: 'switch' }, toggle), forgot);

  toggle.onclick = () => {
    mode = mode === 'signup' ? 'login' : 'signup';
    name.node.hidden = mode === 'login';
    forgot.hidden = mode === 'signup';
    submit.textContent = mode === 'signup' ? 'Start talking' : 'Sign in';
    toggle.textContent = mode === 'signup' ? 'I already have an account' : 'I am new here';
    pass.input.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    err.textContent = '';
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    err.textContent = '';
    submit.disabled = true;
    try {
      const body = { email: email.input.value, password: pass.input.value };
      if (mode === 'signup') Object.assign(body, { name: name.input.value, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
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
      h('img', { class: 'logo', src: '/logo.svg', alt: 'Pishi', width: 128, height: 128 }),
      h('h1', {}, 'Two people a week.', h('br'), h('span', { class: 'muted' }, 'Chosen through conversation.')),
      h('p', { class: 'lede' }, 'No swiping. Talk with your matchmaker, decide what others see, and meet two people each week.')),
    h('ol', { class: 'how' },
      h('li', {}, 'Answer a few questions in a conversation.'),
      h('li', {}, 'You approve every line on your public profile. The rest stays private and is only used for matching.'),
      h('li', {}, 'Every Monday, two suggestions. Like, pass, and tell me why.')),
    form,
    h('p', { class: 'small muted' }, h('a', { href: '#/about' }, 'How Pishi works and what it keeps private'))));
}

export function forgot() {
  top.hidden = !state.me;
  const email = field({ id: 'email', label: 'Email', type: 'email', autocomplete: 'email', value: lastEmail });
  const err = h('p', { class: 'error', role: 'alert' });
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Send me a link');
  const form = h('form', { class: 'auth', novalidate: true }, email.node, err, submit);
  form.onsubmit = async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      await api('POST', '/api/password/forgot', { email: email.input.value });
      render(h('div', { class: 'empty stack' },
        h('h2', {}, 'Check your inbox.'),
        h('p', { class: 'muted' }, 'If that email has an account, a link to choose a new password is on its way. It works for one hour.'),
        h('a', { class: 'btn ghost', href: '#/welcome' }, 'Back to sign in')));
    } catch (ex) {
      err.textContent = ex.message;
      submit.disabled = false;
    }
  };
  render(h('section', { class: 'stack' },
    h('a', { class: 'back', href: '#/welcome' }, '← Back'),
    h('h1', {}, 'New password'),
    h('p', { class: 'muted' }, 'Tell me your email and I will send you a link.'),
    form));
}

export function reset(token) {
  top.hidden = true;
  const pass = field({ id: 'password', label: 'New password', type: 'password', autocomplete: 'new-password', minlength: 8 });
  const err = h('p', { class: 'error', role: 'alert' });
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Save and sign in');
  const form = h('form', { class: 'auth', novalidate: true }, pass.node, err, submit);
  form.onsubmit = async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      const { user } = await api('POST', '/api/password/reset', { token, password: pass.input.value });
      setMe(user);
      toast('Password changed. You are signed in.');
      location.hash = user.ready ? '#/week' : '#/talk';
    } catch (ex) {
      err.textContent = ex.message;
      submit.disabled = false;
    }
  };
  render(h('section', { class: 'stack' }, h('h1', {}, 'Choose a new password'), h('p', { class: 'muted' }, 'At least 8 characters. Other devices will be signed out.'), form));
}

export async function verify(token) {
  top.hidden = !state.me;
  try {
    await api('POST', '/api/verify', { token });
    if (state.me) state.me.emailVerified = true;
    render(h('div', { class: 'empty stack' },
      h('h2', {}, 'Email confirmed.'),
      h('p', { class: 'muted' }, 'Thank you. I will let you know when your two people arrive.'),
      h('a', { class: 'btn', href: state.me ? '#/talk' : '#/welcome' }, 'Continue')));
  } catch (ex) {
    render(h('div', { class: 'empty stack' },
      h('h2', {}, 'That link did not work.'),
      h('p', { class: 'muted' }, ex.message),
      state.me ? h('a', { class: 'btn ghost', href: '#/settings' }, 'Send a new one from Settings') : h('a', { class: 'btn ghost', href: '#/welcome' }, 'Sign in')));
  }
}

export function about() {
  top.hidden = !state.me;
  const p = (t) => h('p', {}, t);
  render(h('article', { class: 'stack prose' },
    h('a', { class: 'back', href: state.me ? '#/settings' : '#/welcome' }, '← Back'),
    h('h1', {}, 'How Pishi works'),
    p('Pishi means cat in Farsi. Like a cat, it is picky: two people a week, no more.'),
    h('h2', {}, 'A conversation, not a form'),
    p('Your matchmaker asks one question at a time. From your answers it builds two profiles. You can skip anything except the basics: age, gender, who you want to meet, and city.'),
    h('h2', {}, 'Two profiles'),
    p('The shared profile is what your matches see. Your matchmaker only suggests lines for it; nothing appears until you approve it, and you can write your own.'),
    p('The hidden profile is how I choose people for you: personality, values, dealbreakers and what you want in a partner. Only you can see it, under You, and you can correct anything that is wrong.'),
    p('I also learn from what you do: who you like and pass on, how conversations with matches go, and when you are usually around. These signals are only used to choose people for you. They are not shown in the app, and they are included when you download your data.'),
    h('h2', {}, 'Two people a week'),
    p('Every week, on the day you choose, you get two suggestions, people near you first, and only as far away as you are both happy to go. Like or pass, and tell me why: it makes the next pair better. You can like one line or photo and add a note; they see it on your card. When you both like each other, you can talk.'),
    h('h2', {}, 'No one left waiting'),
    p('If someone has been waiting a couple of days for your reply, your next two wait too, until you answer or close that conversation kindly. Closing sends one polite last message, so nobody is left wondering.'),
    h('h2', {}, 'After you meet'),
    p('A week after you match, I ask whether you met and whether you would see them again. Only I see your answer. It teaches me what works for you in person, and, counted across everyone who met someone, nudges who I suggest. What you said about someone is deleted with your account.'),
    h('h2', {}, 'Privacy and safety'),
    p('Before a date, you can share who you are meeting, where and when with someone you trust. Afterwards I ask if you are home safe, and email them if I do not hear from you. Pishi never knows where you are and does not call emergency services.'),
    p('Photos can stay hidden until you match. Messages that look abusive are not sent. You can report or unmatch anyone, pause whenever you like, download all your data, and delete your account at any time. Photo verification compares a selfie in a random pose with your photos (by Claude, or by a moderator when the check is unsure); the selfie is never shown on your profile. Deleting removes everything, including photos, your verification selfie and conversations.')));
}
