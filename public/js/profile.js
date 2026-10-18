// "You": photos, the shared profile (with approvals), a preview, and the hidden profile.
import { h, api, render, setMe, state, toast, progress, ask, cap, pretty } from './core.js';
import { personCard } from './people.js';

// Shrink a picked image in the browser so uploads stay small (and drop camera metadata).
async function toDataUrl(file, max = 1280) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function profile(section = '') {
  const data = await api('GET', '/api/profile');
  setMe(data.me);
  const { shared, hidden, preview, photos } = data;
  const me = state.me;
  const reload = () => profile();
  const { guide } = data;
  const act = (fn) => async () => {
    try {
      await fn();
    } catch (ex) {
      toast(ex.message);
    }
  };

  // --- photos ---
  const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true, 'aria-label': 'Choose a photo' });
  file.onchange = act(async () => {
    const f = file.files[0];
    if (!f) return;
    toast('Uploading…');
    await api('POST', '/api/photos', { data: await toDataUrl(f) });
    toast('Photo added.');
    reload();
  });
  const photoBlock = h('section', { class: 'card stack', id: 'photos' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Photos'), h('span', { class: 'small muted' }, `${photos.length} of 4`)),
    h('div', { class: 'photos' },
      photos.map((p, i) => h('div', { class: 'photo' },
        h('img', { src: p.url, alt: i === 0 ? 'Your main photo' : `Your photo ${i + 1}` }),
        h('div', { class: 'tools' },
          i > 0 ? h('button', { type: 'button', 'aria-label': `Make photo ${i + 1} your main photo`, onclick: act(async () => { await api('POST', `/api/photos/${p.id}/main`); reload(); }) }, 'Main') : h('span'),
          h('button', { type: 'button', 'aria-label': `Remove photo ${i + 1}`, onclick: act(async () => { await api('DELETE', `/api/photos/${p.id}`); reload(); }) }, '×')))),
      photos.length < 4 ? h('button', { class: 'photo add', type: 'button', onclick: () => file.click() }, '+ Add photo') : null),
    file,
    h('p', { class: 'hint' }, me.settings.photosAfterMatch ? 'Photos are shown only to people you match with. You can change this in Settings.' : 'Your two weekly suggestions can see your photos.'));

  // --- shared profile ---
  const items = shared.items;
  const itemNodes = items.map((it) => {
    const state_ = h('span', { class: `state ${it.status}` }, it.status === 'approved' ? 'Visible to matches' : it.status === 'hidden' ? 'Hidden' : it.own ? 'Yours' : 'Suggested by your matchmaker');
    const setStatus = (status) => act(async () => { await api('PATCH', `/api/profile/items/${it.id}`, { status }); reload(); });
    const edit = act(async () => {
      const v = await ask({ title: 'Edit this line', text: it.prompt || 'About me', fields: [{ name: 'text', label: 'Text', type: 'textarea', value: it.text, maxlength: 300 }] });
      if (!v) return;
      await api('PATCH', `/api/profile/items/${it.id}`, { text: v.text });
      reload();
    });
    return h('div', { class: 'item' },
      h('div', { class: 'prompt' }, it.prompt || 'About me'), h('p', { class: 'text' }, it.text),
      h('div', { class: 'row' }, state_,
        it.status !== 'approved' ? h('button', { class: 'btn small', onclick: setStatus('approved') }, 'Show on profile') : h('button', { class: 'btn small ghost', onclick: setStatus('hidden') }, 'Hide'),
        h('button', { class: 'btn small ghost', onclick: edit }, 'Edit'),
        h('button', { class: 'link small', onclick: act(async () => { await api('DELETE', `/api/profile/items/${it.id}`); reload(); }) }, 'Remove')));
  });

  const editBio = act(async () => {
    const v = await ask({ title: 'Your bio', text: 'One or two sentences. Matches see this first.', fields: [{ name: 'text', label: 'Bio', type: 'textarea', value: shared.bio || shared.bioDraft || '', maxlength: 300 }] });
    if (!v) return;
    await api('PUT', '/api/profile/bio', { text: v.text });
    reload();
  });
  const bioBlock = h('div', { class: 'item', id: 'bio' },
    h('div', { class: 'prompt' }, 'Bio'),
    h('p', { class: 'text' }, shared.bio || h('span', { class: 'muted' }, 'No bio yet.')),
    shared.bioDraft && shared.bioDraft !== shared.bio
      ? h('div', { class: 'stack' },
        h('p', { class: 'small muted' }, `Suggested: “${shared.bioDraft}”`),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: act(async () => { await api('PUT', '/api/profile/bio', { useDraft: true }); reload(); }) }, 'Use this'),
          h('button', { class: 'btn small ghost', onclick: editBio }, 'Write my own')))
      : h('div', { class: 'row' }, h('button', { class: 'btn small ghost', onclick: editBio }, shared.bio ? 'Edit' : 'Write one')));

  const addLine = act(async () => {
    const v = await ask({
      title: 'Add a line',
      text: 'Pick a prompt and answer it in your own words. Contact details are not allowed.',
      fields: [
        { name: 'prompt', label: 'Prompt', type: 'select', options: data.prompts },
        { name: 'text', label: 'Your answer', type: 'textarea', maxlength: 300 },
      ],
      confirm: 'Add',
      validate: (x) => (x.text.trim() ? '' : 'Write a few words first.'),
    });
    if (!v) return;
    await api('POST', '/api/profile/items', v);
    toast('Added to your profile.');
    reload();
  });

  const addInterest = act(async () => {
    const left = data.interests.filter((i) => !shared.interests.includes(i));
    const v = await ask({ title: 'Add an interest', fields: [{ name: 'name', label: 'Interest', type: 'select', options: left }], confirm: 'Add' });
    if (!v) return;
    await api('POST', '/api/profile/interests', v);
    reload();
  });

  // --- facts: work, languages, kids… ---
  const facts = shared.facts || {};
  const factKeys = Object.keys(data.facts);
  const editFacts = act(async () => {
    const v = await ask({
      title: 'About you',
      text: 'Fill in what you are happy to show. Leave anything blank to keep it off your profile.',
      fields: factKeys.map((k) => {
        const def = data.facts[k];
        const value = facts[k]?.status === 'hidden' ? '' : facts[k]?.value || '';
        return def.options
          ? { name: k, label: def.label, type: 'select', value, options: [['', 'Not shown'], ...def.options] }
          : { name: k, label: def.label, value, maxlength: 60 };
      }),
    });
    if (!v) return;
    await api('PUT', '/api/profile/facts', { facts: v });
    reload();
  });
  const shownFacts = factKeys.filter((k) => facts[k] && facts[k].status !== 'hidden');
  const suggestedFacts = shownFacts.filter((k) => facts[k].status === 'suggested');
  const factsBlock = h('div', { class: 'item', id: 'facts' },
    h('div', { class: 'prompt' }, 'About'),
    shownFacts.length
      ? h('ul', { class: 'facts' }, shownFacts.map((k) => h('li', {},
        h('span', {}, `${data.facts[k].label}:`), facts[k].value,
        facts[k].status === 'suggested' ? h('em', { class: 'small muted' }, ' (suggested)') : null)))
      : h('p', { class: 'text muted' }, 'Work, languages, kids and more. Only what you choose to show.'),
    h('div', { class: 'row' },
      suggestedFacts.length ? h('button', { class: 'btn small', onclick: act(async () => { await api('POST', '/api/profile/facts/approve-all'); reload(); }) }, suggestedFacts.length > 1 ? `Show these ${suggestedFacts.length} suggestions` : 'Show the suggestion') : null,
      h('button', { class: 'btn small ghost', onclick: editFacts }, shownFacts.length ? 'Edit' : 'Add')));

  const suggested = items.filter((i) => i.status === 'suggested').length;
  const sharedBlock = h('section', { class: 'card stack' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Shared profile'), h('span', { class: 'small muted' }, 'What matches see')),
    h('p', { class: 'small muted' }, 'Your matchmaker suggests lines from your answers. Nothing appears here until you approve it.'),
    suggested >= 2
      ? h('div', {}, h('button', { class: 'btn small', onclick: act(async () => {
        const { approved } = await api('POST', '/api/profile/items/approve-all');
        toast(`${approved} lines are now on your profile.`);
        reload();
      }) }, `Show all ${suggested} suggestions`))
      : null,
    bioBlock,
    factsBlock,
    h('div', { id: 'lines', class: 'stack' }, ...itemNodes),
    h('div', { class: 'item' }, h('button', { class: 'btn small ghost', onclick: addLine }, '+ Add a line of my own')),
    h('div', { class: 'item', id: 'interests' }, h('div', { class: 'prompt' }, 'Interests'),
      h('ul', { class: 'tags' },
        shared.interests.map((i) => h('li', {}, i, h('button', { 'aria-label': `Remove ${i}`, onclick: act(async () => { await api('DELETE', `/api/profile/interests/${encodeURIComponent(i)}`); reload(); }) }, '×'))),
        shared.interests.length < 12 ? h('li', {}, h('button', { class: 'add-tag', onclick: addInterest }, '+ Add')) : null)));

  // --- hidden profile ---
  const traits = hidden.traits.map((t) => h('div', { class: 'trait' },
    h('div', { class: 'label' },
      h('span', {}, cap(t.key)),
      h('span', { class: 'muted' }, t.label,
        t.confidence >= 0.15 ? h('button', { class: 'link small fix', 'aria-label': `${t.key} is not right`, onclick: act(async () => {
          await api('POST', `/api/profile/traits/${t.key}/recheck`);
          toast('Got it. I will ask you about that next.');
          location.hash = '#/talk';
        }) }, 'Not me') : null)),
    h('div', { class: `bar ${t.confidence < 0.15 ? 'unsure' : ''}`, 'aria-hidden': 'true' }, h('i', { style: `left:${t.value * 100}%;opacity:${(0.35 + t.confidence).toFixed(2)}` }))));

  const addDealbreaker = act(async () => {
    const left = data.tags.filter((t) => !hidden.dealbreakers.includes(t));
    const v = await ask({
      title: 'Add a dealbreaker',
      text: 'I will never suggest someone who has this on their profile.',
      fields: [{ name: 'tag', label: 'Dealbreaker', type: 'select', options: left.map((t) => [t, pretty(t)]) }],
      confirm: 'Add',
    });
    if (!v) return;
    await api('POST', '/api/profile/dealbreakers', v);
    reload();
  });

  const hiddenBlock = h('section', { class: 'card stack' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Hidden profile'), h('span', { class: 'small muted' }, 'Only used for matching')),
    h('p', { class: 'small muted' }, 'No one else ever sees this. It is how I choose your two people, and it changes as we talk and as you react to suggestions.'),
    hidden.summary ? h('p', { class: 'bio summary' }, hidden.summary) : null,
    h('div', {}, traits),
    hidden.tags.length ? h('div', {}, h('div', { class: 'prompt small muted' }, 'Noted'), h('ul', { class: 'tags' }, hidden.tags.map((t) => h('li', {}, pretty(t))))) : null,
    h('div', { id: 'dealbreakers' }, h('div', { class: 'prompt small muted' }, 'Dealbreakers'),
      h('ul', { class: 'tags' },
        hidden.dealbreakers.map((t) => h('li', {}, pretty(t), h('button', { 'aria-label': `Remove dealbreaker ${pretty(t)}`, onclick: act(async () => { await api('DELETE', `/api/profile/dealbreakers/${encodeURIComponent(t)}`); reload(); }) }, '×'))),
        h('li', {}, h('button', { class: 'add-tag', onclick: addDealbreaker }, '+ Add')),
        !hidden.dealbreakers.length && guide.hidden.steps.find((s) => s.id === 'dealbreakers')?.done === false
          ? h('li', {}, h('button', { class: 'add-tag', onclick: act(async () => { await api('POST', '/api/profile/dealbreakers/none'); toast('Noted: no dealbreakers.'); reload(); }) }, 'I have none'))
          : null)),
    hidden.aspects?.length ? h('div', {}, h('div', { class: 'prompt small muted' }, 'Also noted'), h('ul', { class: 'tags' }, hidden.aspects.map((a) => h('li', {}, cap(a.label))))) : null,
    hidden.limits?.length ? h('div', {}, h('div', { class: 'prompt small muted' }, 'Learned from your passes'),
      h('ul', { class: 'tags' }, hidden.limits.map((l) => h('li', {}, l.text,
        h('button', { 'aria-label': `Stop: ${l.text}`, onclick: act(async () => { await api('DELETE', `/api/profile/limits/${l.key}`); reload(); }) }, '×'))))) : null,
    hidden.passReasons?.length ? h('p', { class: 'small muted' }, `Why you passed so far: ${hidden.passReasons.map((r) => (r.count > 1 ? `${r.label} (${r.count})` : r.label)).join(', ')}.`) : null,
    hidden.notes.length ? h('div', {}, h('div', { class: 'prompt small muted' }, 'Notes'), h('ul', { class: 'notes' }, hidden.notes.map((n) => h('li', {}, n)))) : null);

  render(h('div', { class: 'stack' },
    h('div', { class: 'section-head' }, h('h1', {}, me.name), h('a', { class: 'btn small ghost', href: '#/settings' }, 'Settings')),
    guide.complete ? progress(me.completeness) : guideCard(guide),
    me.settings.paused ? h('div', { class: 'banner' }, h('span', {}, 'You are paused, so no one sees you.'), h('a', { href: '#/settings' }, 'Change')) : null,
    photoBlock,
    sharedBlock,
    h('details', { class: 'card' },
      h('summary', {}, 'Preview as a match sees it'),
      h('div', { style: 'margin-top:16px' }, personCard(preview))),
    hiddenBlock));
  // Links like #/profile/bio open the page at that part.
  if (section) document.getElementById(section)?.scrollIntoView({ block: 'center' });
}

// "Finish your profile": both profiles' progress and the next few things to do.
function guideCard(guide) {
  const bar = (label, pct) => h('div', { class: 'guide-bar' },
    h('div', { class: 'label' }, h('span', {}, label), h('span', { class: 'muted' }, `${pct}%`)),
    h('div', { class: 'meter', role: 'progressbar', 'aria-label': label, 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: `width:${pct}%` })));
  const todo = [...guide.shared.steps, ...guide.hidden.steps].filter((s) => !s.done && s.id !== guide.next?.id).slice(0, 2);
  const go = (href) => () => {
    if (location.hash === href) document.getElementById(href.split('/')[2])?.scrollIntoView({ block: 'center' });
    location.hash = href;
  };
  return h('section', { class: 'card stack guide' },
    h('h2', {}, 'Finish your profile'),
    bar('Shared profile (what matches see)', guide.shared.percent),
    bar('Hidden profile (how I choose)', guide.hidden.percent),
    guide.next ? h('div', { class: 'next' },
      h('p', {}, h('strong', {}, 'Next: '), guide.next.label),
      h('button', { class: 'btn small accent', type: 'button', onclick: go(guide.next.action.href) }, guide.next.action.label)) : null,
    todo.length ? h('ul', { class: 'todo' }, todo.map((s) => h('li', {}, h('button', { class: 'link', type: 'button', onclick: go(s.action.href) }, s.label)))) : null);
}
