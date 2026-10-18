// Other people: this week's two, matches, and conversations with a match.
import { h, api, render, setMe, state, toast, progress, ask, live, ago, until, clock, main } from './core.js';

// One photo at a time: swipe, tap the left or right edge, use the arrows or the
// dots, or the arrow keys once the gallery has focus.
export function gallery(photos, name) {
  const track = h('div', { class: 'track' }, photos.map((src, i) => h('img', {
    src, alt: i === 0 ? `Photo of ${name}` : `${name}, photo ${i + 1}`, loading: i === 0 ? null : 'lazy', draggable: 'false',
  })));
  const box = h('div', { class: 'gallery', role: 'region', 'aria-roledescription': 'carousel', 'aria-label': `Photos of ${name}` }, track);
  let at = 0;
  box.current = () => at; // which photo is showing, for "Like this photo"
  if (photos.length < 2) return box;

  const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  const go = (i) => {
    const to = Math.max(0, Math.min(photos.length - 1, i));
    track.scrollTo({ left: to * track.clientWidth, behavior: smooth() });
    show(to);
  };
  const prev = h('button', { class: 'nav prev', type: 'button', 'aria-label': 'Previous photo', onclick: () => go(at - 1) }, '‹');
  const next = h('button', { class: 'nav next', type: 'button', 'aria-label': 'Next photo', onclick: () => go(at + 1) }, '›');
  const count = h('span', { class: 'count', 'aria-live': 'polite' });
  const dots = photos.map((_, i) => h('button', { type: 'button', 'aria-label': `Photo ${i + 1} of ${photos.length}`, onclick: () => go(i) }));
  function show(i) {
    at = i;
    prev.disabled = i === 0;
    next.disabled = i === photos.length - 1;
    count.textContent = `${i + 1} / ${photos.length}`;
    dots.forEach((d, j) => (j === i ? d.setAttribute('aria-current', 'true') : d.removeAttribute('aria-current')));
  }
  // Swiping moves the track itself; keep the arrows, dots and count in step with it.
  let settle;
  track.addEventListener('scroll', () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      const i = Math.round(track.scrollLeft / (track.clientWidth || 1));
      if (i !== at) show(i);
    }, 60);
  }, { passive: true });
  track.addEventListener('click', (e) => {
    const { left, width } = track.getBoundingClientRect();
    const x = (e.clientX - left) / width;
    if (x < 0.3) go(at - 1);
    else if (x > 0.7) go(at + 1);
  });
  box.tabIndex = 0;
  box.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(at - 1);
    else if (e.key === 'ArrowRight') go(at + 1);
    else return;
    e.preventDefault();
  });
  box.append(prev, next, count, h('div', { class: 'dots' }, dots));
  show(0);
  return box;
}

// A like on one part of someone's profile, as a quote: a line, or one of their photos.
function quote(on, alt) {
  if (!on) return null;
  return h('blockquote', { class: 'about' }, on.photo
    ? h('img', { src: on.photo, alt, onerror: (e) => e.target.remove() })
    : [on.prompt ? h('span', { class: 'prompt' }, on.prompt) : null, h('span', {}, on.text)]);
}

export function personCard(p, { onDecide, onReport } = {}) {
  const open = onDecide && !p.matchId && !p.decision;
  const pics = p.photos?.length ? gallery(p.photos, p.name) : null;
  // Like one particular line or photo, with a note if you want: it gives them something to answer.
  const likePart = async (on, what) => {
    const v = await ask({
      title: `Like ${p.name}'s ${what}`,
      text: on.kind === 'item' ? `“${p.items[on.index].text}”` : 'They will see which photo you liked.',
      fields: [{ name: 'note', label: 'Add a note (optional)', type: 'textarea', maxlength: 200, placeholder: 'Something they can answer' }],
      confirm: 'Send like',
    });
    if (v) onDecide('like', [...card.querySelectorAll('.actions button, .heart')], { on, note: v.note });
  };
  const heart = (label, on, what) => h('button', { class: 'heart', type: 'button', 'aria-label': label, title: label, onclick: () => likePart(on, what) }, '♥');
  const card = h('article', { class: 'card person' },
    pics,
    open && pics ? h('p', { class: 'like-photo' }, h('button', { class: 'link small', type: 'button', onclick: () => likePart({ kind: 'photo', index: pics.current() }, 'photo') }, '♥ Like this photo')) : null,
    h('h2', {}, p.name),
    h('p', { class: 'meta' }, [p.age, p.city, p.demo ? 'demo profile' : null].filter(Boolean).join(' · ')),
    p.photosHidden ? h('p', { class: 'hint' }, `${p.name} shares photos after you match.`) : null,
    p.bio ? h('p', { class: 'bio' }, p.bio) : null,
    p.reason ? h('p', { class: 'why' }, p.reason) : null,
    p.facts?.length ? h('ul', { class: 'facts', 'aria-label': 'About' }, p.facts.map((f) => h('li', {}, h('span', {}, `${f.label}:`), f.value))) : null,
    p.interests?.length ? h('ul', { class: 'tags', 'aria-label': 'Interests' }, p.interests.map((i) => h('li', {}, i))) : null,
    p.items?.length ? h('dl', { class: 'qa' }, p.items.flatMap((i, index) => [h('dt', {}, i.prompt || 'About me'),
      h('dd', {}, i.text, open ? heart(`Like this line: ${i.prompt || 'About me'}`, { kind: 'item', index }, 'line') : null)])) : null);
  if (p.likedYou) {
    card.prepend(h('div', { class: 'liked-you' },
      h('p', {}, h('strong', {}, p.likedYou.on ? `${p.name} liked your ${p.likedYou.on.photo ? 'photo' : 'line'}` : `${p.name} likes you`)),
      quote(p.likedYou.on, 'Your photo'),
      p.likedYou.note ? h('p', { class: 'note' }, `“${p.likedYou.note}”`) : null));
  }
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
  if (onReport) card.append(h('p', { class: 'report-link' }, h('button', { class: 'link small', type: 'button', onclick: onReport }, `Report ${p.name}`)));
  return card;
}

const empty = (...children) => h('div', { class: 'empty stack' }, ...children);

export async function week() {
  const data = await api('GET', '/api/week');
  if (data.paused) {
    const resume = h('button', { class: 'btn', type: 'button' }, 'Resume');
    resume.onclick = async () => {
      resume.disabled = true;
      const { user } = await api('PUT', '/api/settings', { paused: false });
      setMe(user);
      toast('Welcome back. You are visible again.');
      week();
    };
    render(empty(h('h2', {}, 'You are paused.'),
      h('p', { class: 'muted' }, 'No one sees you and I am not choosing anyone for you. Your profiles and matches are kept.'),
      resume));
    return;
  }
  if (data.held) {
    render(empty(
      h('h2', {}, 'Your two are waiting.'),
      h('p', { class: 'muted' }, 'Before I introduce anyone new, answer the people already waiting on you, or close those conversations kindly. Nobody here gets left on read.'),
      h('ul', { class: 'list' }, data.owed.map((o) => h('li', {}, h('a', { href: `#/match/${encodeURIComponent(o.matchId)}` }, h('span', { class: 'name' }, `Reply to ${o.name}`), h('span', { class: 'when' }, '→')))))));
    return;
  }
  if (!data.ready) {
    render(empty(
      h('h2', {}, 'Not yet.'),
      h('p', { class: 'muted' }, 'I need to know you a little better before I introduce anyone. A few more answers will do it.'),
      data.missing?.length ? h('p', { class: 'small muted' }, `Still to talk about: ${data.missing.join('; ')}.`) : null,
      state.me ? progress(state.me.completeness) : null,
      h('a', { class: 'btn', href: '#/talk' }, 'Keep talking')));
    return;
  }
  const widen = data.widen ? h('button', { class: 'btn ghost small', type: 'button' }, 'Widen my search') : null;
  if (widen) {
    widen.onclick = async () => {
      widen.disabled = true;
      try {
        const res = await api('POST', '/api/week/widen');
        const also = res.lifted?.includes('city') ? ', and beyond your area' : '';
        toast(res.added ? `Found ${res.added === 1 ? 'someone' : `${res.added} people`} within ${res.ageRange} years of you${also}.` : `Now looking within ${res.ageRange} years of you${also}. No one new yet.`);
        week();
      } catch (ex) {
        toast(ex.message);
        widen.disabled = false;
      }
    };
  }
  if (!data.picks.length) {
    render(empty(
      h('h2', {}, 'No one this week.'),
      h('p', { class: 'muted' }, `I would rather suggest no one than the wrong people. New suggestions arrive ${until(data.next)}.`),
      widen ? h('p', { class: 'muted small' }, 'Being a little more open on age or distance could help.') : null,
      widen,
      h('a', { class: 'btn ghost', href: '#/talk' }, 'Tell me more about you')));
    return;
  }
  const cards = data.picks.map((p) => personCard(p, {
    onDecide: async (decision, buttons, extra = {}) => {
      buttons.forEach((b) => (b.disabled = true));
      try {
        const res = await api('POST', `/api/week/${encodeURIComponent(p.id)}`, { decision, ...extra });
        if (res.match) {
          toast(`It is mutual. Say hello to ${p.name}.`);
          location.hash = `#/match/${encodeURIComponent(res.match.id)}`;
          return;
        }
        if (decision === 'pass') {
          // The matchmaker asks why straight away; the answers shape next week's two.
          toast(`Passed. A quick question about ${p.name}, then you can come back.`);
          location.hash = '#/talk';
          return;
        }
        toast(`I will let you know if ${p.name} likes you too.`);
        week();
      } catch (ex) {
        toast(ex.message);
        buttons.forEach((b) => (b.disabled = false));
      }
    },
    onReport: p.matchId ? null : async () => {
      const v = await ask({
        title: `Report ${p.name}`,
        text: 'They will not be shown to you again. A moderator will look at your report.',
        fields: [{ name: 'reason', label: 'What is wrong?', type: 'textarea', maxlength: 500, placeholder: 'For example: fake photos, offensive profile' }],
        confirm: 'Report',
        danger: true,
        validate: (x) => (x.reason.trim() ? '' : 'Tell me briefly what is wrong.'),
      });
      if (!v) return;
      await api('POST', `/api/week/${encodeURIComponent(p.id)}/report`, { reason: v.reason });
      toast('Thank you. You will not see them again.');
      week();
    },
  }));
  const done = data.picks.every((p) => p.decision);
  render(h('div', { class: 'stack' },
    h('div', {}, h('h1', {}, 'This week'), h('p', { class: 'muted' }, done
      ? `That is this week done. Your next two arrive ${until(data.next)}. Talking more in the meantime makes them better.`
      : `${data.picks.length === 1 ? 'One person this week, chosen for you.' : 'Two people, chosen for you.'} Decide before the next ${data.picks.length === 1 ? 'suggestions arrive' : 'pair arrives'} ${until(data.next)}: undecided suggestions go then.`)),
    h('div', { class: `picks ${data.picks.length > 1 ? 'two' : ''}` }, cards),
    widen ? h('div', { class: 'banner' }, h('span', {}, 'Only one person fit this week.'), widen) : null));
  main.className = 'wide';
}

function avatar(person) {
  return person.photos?.[0]
    ? h('img', { class: 'avatar', src: person.photos[0], alt: '' })
    : h('span', { class: 'avatar', 'aria-hidden': 'true' }, person.name.charAt(0));
}

export async function matches() {
  const { matches: list } = await api('GET', '/api/matches');
  if (!list.length) {
    render(empty(
      h('h2', {}, 'No matches yet.'),
      h('p', { class: 'muted' }, 'When you and someone like each other, you can talk here.'),
      h('a', { class: 'btn ghost', href: '#/week' }, 'See this week')));
    return;
  }
  render(h('div', { class: 'stack' }, h('h1', {}, 'Matches'),
    h('ul', { class: 'list' }, list.map((m) => h('li', {},
      h('a', { href: `#/match/${encodeURIComponent(m.id)}` },
        h('div', { class: 'who' }, avatar(m.person),
          h('div', { style: 'min-width:0' },
            h('div', { class: 'name' }, m.person.name),
            h('div', { class: 'preview' }, m.closed ? 'Closed' : m.last ? `${m.last.mine ? 'You: ' : ''}${m.last.text}` : 'Say hello'))),
        h('div', { class: 'stack', style: 'text-align:right' },
          h('div', { class: 'when' }, ago(m.last?.at || m.createdAt)),
          m.unread ? h('span', { class: 'badge' }, String(m.unread)) : m.isNew ? h('span', { class: 'badge' }, 'New') : m.yourTurn ? h('span', { class: 'turn small' }, 'Your turn') : null)))))));
  // A new message elsewhere refreshes the list.
  live.on('message', () => matches());
}

export async function thread(id) {
  const data = await api('GET', `/api/matches/${encodeURIComponent(id)}`);
  const name = data.person.name;
  api('GET', '/api/me').then((r) => setMe(r.user)).catch(() => {}); // opening the thread read it, so the dot can clear
  const log = h('div', { class: 'log', 'aria-live': 'polite' });
  const seen = h('p', { class: 'seen', hidden: true }, 'Seen');
  let lastMineAt = '';
  let seenAt = data.seenByThem || '';
  const showSeen = () => {
    seen.hidden = !(lastMineAt && seenAt && seenAt >= lastMineAt);
    log.append(seen); // stays under the newest message
  };
  const add = (m) => {
    log.querySelector('.hello')?.remove();
    if (m.about) log.append(h('div', { class: `liked ${m.mine ? 'user' : 'them'}` }, h('span', { class: 'small muted' }, m.mine ? 'You liked' : `${name} liked`), quote(m.about, m.mine ? `${name}'s photo` : 'Your photo')));
    log.append(h('p', { class: `msg ${m.mine ? 'user' : 'them'}` }, m.text, h('time', { datetime: m.at }, clock(m.at))));
    if (m.closing) log.append(h('p', { class: 'muted small center closed-note' }, m.mine ? 'You closed this conversation.' : `${name} closed this conversation kindly.`));
    if (m.mine) lastMineAt = m.at;
    showSeen();
  };
  data.messages.forEach(add);
  if (!data.messages.length) log.append(h('p', { class: 'muted small center hello' }, `You matched with ${name} ${ago(data.createdAt)}. Their profile is below.`));
  showSeen();

  const input = h('textarea', { rows: 1, placeholder: `Message ${name}`, 'aria-label': 'Message', maxlength: 1000 });
  const form = h('form', { class: 'composer' }, input, h('button', { class: 'btn', type: 'submit' }, 'Send'));
  const ice = h('div', { class: 'chips', 'aria-label': 'Ways to start' },
    (data.icebreakers || []).map((t) => h('button', { class: 'chip', type: 'button', onclick: () => { input.value = t; input.focus(); } }, t)));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      const { message, reply } = await api('POST', `/api/matches/${encodeURIComponent(id)}`, { text });
      ice.remove();
      add(message);
      if (reply) setTimeout(() => { seenAt = reply.at; add(reply); }, 900);
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

  live.on('message', (ev) => {
    if (ev.matchId !== id) return;
    if (ev.message.closing) return thread(id); // they closed it: show it read-only
    ice.remove();
    add(ev.message);
    api('GET', `/api/matches/${encodeURIComponent(id)}`).catch(() => {}); // marks it read, and tells them it was seen
  });
  live.on('seen', (ev) => {
    if (ev.matchId !== id) return;
    seenAt = ev.at;
    showSeen();
  });
  live.on('unmatched', (ev) => {
    if (ev.matchId !== id) return;
    toast(`${name} ended this match.`);
    location.hash = '#/matches';
  });

  // "Did you meet?" any time, not only when the matchmaker asks a week on.
  const MET = { again: 'We met, and I want to see them again', once: 'We met, but once was enough', talking: 'We are talking, not met yet', quiet: 'We did not really talk' };
  const metBtn = h('button', { class: 'link small', type: 'button' }, data.met ? `You said: ${MET[data.met].toLowerCase()}` : 'Did you meet?');
  metBtn.onclick = async () => {
    const v = await ask({
      title: `Did you meet ${name}?`,
      text: 'Only your matchmaker sees this. It helps me pick better people for you.',
      fields: [{ name: 'answer', label: 'How it went', type: 'select', value: data.met || 'again', options: Object.entries(MET) }],
    });
    if (!v) return;
    try {
      const res = await api('POST', `/api/matches/${encodeURIComponent(id)}/met`, v);
      data.met = res.met;
      metBtn.textContent = `You said: ${MET[res.met].toLowerCase()}`;
      if (res.ask) {
        toast('Thank you. Your matchmaker has one quick question.');
        location.hash = '#/talk';
      } else toast('Thank you, noted.');
    } catch (ex) {
      toast(ex.message);
    }
  };

  // Close kindly: a last message, so nobody is left wondering. The thread stays readable.
  const closeBtn = data.closed ? null : h('button', { class: 'link small', type: 'button' }, 'Close kindly');
  if (closeBtn) closeBtn.onclick = async () => {
    const v = await ask({
      title: `Close your conversation with ${name}?`,
      text: 'I will send one last message for you. You can pick one of these or write your own.',
      fields: [
        { name: 'line', label: 'Message', type: 'select', options: data.closeLines.map((l, i) => [String(i), l]) },
        { name: 'text', label: 'Or in your own words (optional)', type: 'textarea', maxlength: 300 },
      ],
      confirm: 'Send and close',
    });
    if (!v) return;
    try {
      await api('POST', `/api/matches/${encodeURIComponent(id)}/close`, { line: Number(v.line), text: v.text });
      toast(`Closed. Thank you for letting ${name} know.`);
      thread(id);
    } catch (ex) {
      toast(ex.message);
    }
  };

  // Share Date: tell someone you trust who, where and when. Only they and you see it.
  const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const sharePlan = async () => {
    const tomorrow = new Date(Date.now() + 864e5);
    tomorrow.setHours(19, 0, 0, 0);
    const fields = [
      { name: 'when', label: 'When', type: 'datetime-local', value: data.date ? local(new Date(data.date.when)) : local(tomorrow) },
      { name: 'place', label: 'Where', maxlength: 120, value: data.date?.place || '', placeholder: 'For example: Café Nero, Market Street' },
    ];
    if (!data.trustedContact) {
      fields.push({ name: 'contactName', label: 'Trusted contact: first name', maxlength: 40 }, { name: 'contactEmail', label: 'Their email', type: 'email', maxlength: 200 });
    }
    const v = await ask({
      title: data.date ? 'Change your plans' : `Share your plans with ${data.trustedContact || 'someone you trust'}`,
      text: `I will email them who you are meeting, where and when. After the date I will ask if you are home safe, and tell them if I do not hear from you. ${name} is not told.`,
      fields,
      confirm: 'Share plans',
      validate: (x) => (!x.when ? 'When are you meeting?' : !x.place.trim() ? 'Where are you meeting?' : !data.trustedContact && (!x.contactName.trim() || !x.contactEmail.includes('@')) ? 'Who should I tell?' : ''),
    });
    if (!v) return;
    try {
      if (!data.trustedContact) {
        const res = await api('PUT', '/api/settings', { trustedContact: { name: v.contactName, email: v.contactEmail } });
        setMe(res.user);
      }
      const res = await api('POST', `/api/matches/${encodeURIComponent(id)}/date`, { when: new Date(v.when).toISOString(), place: v.place });
      toast(`Shared with ${res.date.contact}.`);
      thread(id);
    } catch (ex) {
      toast(ex.message);
    }
  };
  const planAction = (path, msg) => async () => {
    try {
      await api('POST', `/api/dates/${encodeURIComponent(data.date.id)}/${path}`);
      toast(msg);
      thread(id);
    } catch (ex) {
      toast(ex.message);
    }
  };
  const plan = data.date
    ? h('div', { class: 'banner plan' },
      h('span', {}, `Shared with ${data.date.contact}: ${data.date.whenText}, ${data.date.place}.`),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn small', type: 'button', onclick: planAction('safe', `Thank you. I have told ${data.date.contact}.`) }, 'I am home safe'),
        h('button', { class: 'link small', type: 'button', onclick: sharePlan }, 'Change'),
        h('button', { class: 'link small', type: 'button', onclick: planAction('cancel', `Called off. I have told ${data.date.contact}.`) }, 'Call off')))
    : null;
  const shareBtn = data.date ? null : h('button', { class: 'link small', type: 'button', onclick: sharePlan }, 'Share date plans');

  const unmatch = h('button', { class: 'link small', type: 'button' }, 'Unmatch or report');
  unmatch.onclick = async () => {
    const v = await ask({
      title: `Unmatch ${name}?`,
      text: 'You will not be able to message each other again.',
      fields: [
        { name: 'report', label: 'Also report them to a moderator', type: 'checkbox' },
        { name: 'reason', label: 'Reason (needed for a report)', type: 'textarea', maxlength: 500 },
      ],
      confirm: 'Unmatch',
      danger: true,
      validate: (x) => (x.report && !x.reason.trim() ? 'Tell the moderator briefly what happened.' : ''),
    });
    if (!v) return;
    await api('POST', `/api/matches/${encodeURIComponent(id)}/unmatch`, { report: v.report, reason: v.reason });
    toast(v.report ? 'Unmatched and reported. Thank you for telling us.' : 'Unmatched.');
    location.hash = '#/matches';
  };
  render(h('section', { class: 'chat' },
    h('div', { class: 'section-head' }, h('a', { class: 'back', href: '#/matches' }, '← Matches'), h('div', { class: 'row wrap' }, metBtn, shareBtn, closeBtn, unmatch)),
    plan,
    personCard(data.person), log, data.closed ? null : ice, data.closed ? null : form));
  window.scrollTo(0, document.body.scrollHeight);
}
