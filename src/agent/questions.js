// The interviewer's question bank, used by the offline agent and as a guide for Claude.
// mode 'self'    -> answers describe the person (hidden traits)
// mode 'partner' -> answers describe what they want (hidden preferences)
// share          -> a good answer can become a suggested item on the shared profile
// choices        -> quick replies; each maps straight to trait values (set), and may also
//                   carry tags, aspects, facts (shared-profile suggestions), partner
//                   preferences (prefer), search limits, a pass reason (reason), or the
//                   next question to ask (then)

export const BASICS = [
  {
    id: 'b_gender', key: 'gender', text: 'First, a few basics so I only suggest people who fit. How do you describe yourself?',
    choices: ['Woman', 'Man', 'Non-binary'],
  },
  { id: 'b_seeking', key: 'seeking', text: 'And who would you like to meet?', choices: ['Women', 'Men', 'Non-binary people', 'Everyone'] },
  { id: 'b_age', key: 'age', text: 'How old are you?' },
  { id: 'b_city', key: 'city', text: 'Which city are you in?' },
];

export const QUESTIONS = [
  {
    // Asked early: it decides who can be suggested at all. Settings can change it later.
    id: 'q_distance', mode: 'self', traits: [], early: true, skipIf: (u) => u.basics.distance != null,
    text: 'Would you date someone who lives in another city?',
    choices: [
      { label: 'Only someone near me', ack: 'Close to home it is. I will keep to your area.', set: {}, basics: { distance: 'near' } },
      { label: 'Up to a few hours away', ack: 'A few hours away is fine. Noted.', set: {}, basics: { distance: 'hours' } },
      { label: 'Distance is no problem', ack: 'Open to long distance. Noted, I will still favour people closer by.', set: {}, basics: { distance: 'any' } },
    ],
  },
  {
    id: 'q_weekend', mode: 'self', share: 'My ideal Sunday',
    text: 'Describe a Sunday you would happily repeat every week.',
    traits: ['social', 'activity', 'adventure'],
  },
  {
    id: 'q_recharge', mode: 'self',
    text: 'After a long week, what sounds best?',
    traits: ['social'],
    choices: [
      { label: 'A big night out', ack: 'A night out it is.', set: { social: 0.9, activity: 0.6 } },
      { label: 'Dinner with one or two friends', ack: 'Small and good. Same.', set: { social: 0.55 } },
      { label: 'A quiet night in', ack: 'A quiet night in is underrated.', set: { social: 0.15, activity: 0.3 } },
    ],
  },
  {
    id: 'q_travel', mode: 'self', share: 'A trip I still think about',
    text: 'Tell me about a trip, or a day, you still think about.',
    traits: ['adventure', 'intellect'],
  },
  {
    id: 'q_plans', mode: 'self',
    text: 'Friends invite you away for the weekend, leaving in two hours. You…',
    traits: ['planning', 'adventure'],
    choices: [
      { label: 'Pack and go', ack: 'Bold. I like it.', set: { planning: 0.1, adventure: 0.9 } },
      { label: 'Go, after a few calls', ack: 'Up for it, with a plan B. Noted.', set: { planning: 0.5, adventure: 0.6 } },
      { label: 'Pass, my weekend is planned', ack: 'A person with plans. Noted.', set: { planning: 0.9, adventure: 0.25 } },
    ],
  },
  {
    id: 'q_work', mode: 'self', share: 'What I do and why I like it',
    text: 'What do you do for work, and how much of your life do you want it to take up?',
    traits: ['ambition'],
  },
  {
    id: 'q_family', mode: 'self',
    text: 'Where do kids and family fit in your future?',
    traits: ['family'],
    choices: [
      { label: 'I want kids', ack: 'Thank you, that matters a lot for matching.', set: { family: 0.9 }, tags: ['wants-kids'] },
      { label: 'Open to it', ack: 'Open is good. Noted.', set: { family: 0.6 }, facts: { kids: 'Open to kids' } },
      { label: "I don't want kids", ack: 'Thank you, that matters a lot for matching.', set: { family: 0.2 }, tags: ['no-kids'] },
      { label: 'I already have kids', ack: 'Thank you for telling me.', set: { family: 0.85 }, tags: ['has-kids'] },
    ],
  },
  {
    id: 'q_curious', mode: 'self', share: "Something I could talk about for hours",
    text: 'What could you talk about for hours?',
    traits: ['intellect'],
  },
  {
    id: 'q_active', mode: 'self',
    text: 'How do you like to move?',
    traits: ['activity'],
    choices: [
      { label: 'Training most days', ack: 'Impressive.', set: { activity: 0.95 } },
      { label: 'Walks, the odd class', ack: 'Sounds balanced.', set: { activity: 0.55 } },
      { label: 'The sofa is underrated', ack: 'It really is.', set: { activity: 0.15 } },
    ],
  },
  {
    id: 'q_faith', mode: 'self',
    text: 'Does faith or spirituality play a part in your life?',
    traits: ['spirituality'],
    choices: [
      { label: 'A central part', ack: 'Thank you, I will keep that in mind.', set: { spirituality: 0.9 }, tags: ['religious'] },
      { label: 'Somewhat', ack: 'Noted.', set: { spirituality: 0.55 } },
      { label: 'Not really', ack: 'Noted.', set: { spirituality: 0.1 } },
    ],
  },
  {
    id: 'q_habits', mode: 'self',
    text: 'Quick one on habits: do you smoke or drink?',
    traits: [],
  },
  {
    id: 'q_partner_day', mode: 'partner',
    text: 'Picture someone you click with. What are they doing on a Saturday afternoon?',
    traits: ['social', 'activity', 'adventure'],
  },
  {
    id: 'q_age_range', mode: 'partner',
    text: 'How close in age would you like them to be?',
    traits: [],
    choices: [
      { label: 'Around my age', ack: 'Around your age, then.', set: {}, basics: { ageRange: 5 } },
      { label: 'Up to 10 years either way', ack: 'Got it.', set: {}, basics: { ageRange: 10 } },
      { label: 'Age is just a number', ack: 'Wide open. Within reason.', set: {}, basics: { ageRange: 15 } },
    ],
  },
  {
    id: 'q_dealbreakers', mode: 'partner',
    text: 'Is there anything that would be a dealbreaker for you?',
    traits: [],
  },
  {
    id: 'q_relationship', mode: 'self',
    text: 'What are you hoping to find here?',
    traits: ['family'],
    choices: [
      { label: 'Something long-term', ack: 'Long-term. Good, that is what I do best.', set: { family: 0.65 }, tags: ['long-term'] },
      { label: 'See where it goes', ack: 'No pressure. Good.', set: {}, facts: { lookingFor: 'Seeing where it goes' } },
      { label: 'Something casual', ack: 'Fair enough, I will look for the same.', set: { family: 0.3 }, tags: ['casual'] },
    ],
  },
  {
    id: 'q_laugh', mode: 'self', share: 'What makes me laugh',
    text: 'What reliably makes you laugh?',
    traits: ['intellect', 'social'],
  },
  {
    id: 'q_values', mode: 'self', share: 'What matters most to me',
    text: 'What matters most to you in how you live your life?',
    traits: ['ambition', 'family', 'spirituality'],
  },
  {
    id: 'q_home', mode: 'self',
    text: 'Home on a weeknight is usually…',
    traits: ['social', 'planning'],
    choices: [
      { label: 'Full of people', ack: 'Lively.', set: { social: 0.85 } },
      { label: 'Cooking, a book, early night', ack: 'That sounds lovely.', set: { social: 0.3, planning: 0.65 } },
      { label: 'Different every night', ack: 'Never boring, then.', set: { planning: 0.2, adventure: 0.7 } },
    ],
  },
  {
    id: 'q_partner_trait', mode: 'partner',
    text: 'What is one quality you have learned you really need in a partner?',
    traits: [],
  },
  {
    id: 'q_proud', mode: 'self', share: "Something I'm proud of",
    text: 'What is something you are quietly proud of?',
    traits: ['ambition'],
  },
];

import { TRAITS } from '../traits.js';

// Deeper questions, asked once the core interview is done. Two per trait, so the
// matchmaker always has something worth asking about whatever it knows least.
export const DEEPER = [
  { id: 'd_social1', mode: 'self', traits: ['social'], text: 'At a party where you know one person, what do you usually end up doing?' },
  { id: 'd_social2', mode: 'self', traits: ['social'], share: 'How my friends describe me', text: 'How would your closest friends describe you in a sentence?' },
  { id: 'd_adventure1', mode: 'self', traits: ['adventure'], text: 'What is something you tried for the first time in the last year?' },
  { id: 'd_adventure2', mode: 'self', traits: ['adventure'], text: 'Same favourite restaurant every time, or somewhere new?', choices: [
    { label: 'Same place, same dish', ack: 'A regular. Noted.', set: { adventure: 0.2 } },
    { label: 'Depends on the mood', ack: 'Fair.', set: { adventure: 0.5 } },
    { label: 'Always somewhere new', ack: 'An explorer.', set: { adventure: 0.85 } },
  ] },
  { id: 'd_ambition1', mode: 'self', traits: ['ambition'], share: 'Where I want to be in five years', text: 'Where would you like to be in five years?' },
  { id: 'd_ambition2', mode: 'self', traits: ['ambition'], text: 'A Friday evening work email arrives. You…', choices: [
    { label: 'Answer it now', ack: 'Committed.', set: { ambition: 0.85 } },
    { label: 'Glance, reply Monday', ack: 'Balanced.', set: { ambition: 0.5 } },
    { label: 'What email?', ack: 'Boundaries. Good.', set: { ambition: 0.15 } },
  ] },
  { id: 'd_family1', mode: 'self', traits: ['family'], text: 'How close are you to your family, and how often do you see them?' },
  { id: 'd_family2', mode: 'self', traits: ['family'], share: 'A tradition I want to keep', text: 'Is there a family tradition you would love to keep going?' },
  { id: 'd_planning1', mode: 'self', traits: ['planning'], text: 'Holidays: booked months ahead, or decided at the airport?', choices: [
    { label: 'Months ahead', ack: 'A planner.', set: { planning: 0.9 } },
    { label: 'A rough plan', ack: 'Sensible.', set: { planning: 0.55 } },
    { label: 'At the airport', ack: 'Brave.', set: { planning: 0.1, adventure: 0.8 } },
  ] },
  { id: 'd_planning2', mode: 'self', traits: ['planning'], text: 'What does your calendar look like for next weekend?' },
  { id: 'd_intellect1', mode: 'self', traits: ['intellect'], share: 'Something that changed my mind', text: 'What is a book, film or conversation that changed your mind about something?' },
  { id: 'd_intellect2', mode: 'self', traits: ['intellect'], text: 'Would you rather spend an evening debating an idea or building something with your hands?', choices: [
    { label: 'Debating an idea', ack: 'A thinker.', set: { intellect: 0.85 } },
    { label: 'A bit of both', ack: 'Both is good.', set: { intellect: 0.55 } },
    { label: 'Building something', ack: 'Hands-on. Noted.', set: { intellect: 0.2 } },
  ] },
  { id: 'd_spirit1', mode: 'self', traits: ['spirituality'], text: 'Would you want a partner who shares your view on faith?', choices: [
    { label: 'Yes, it matters', ack: 'Understood.', set: { spirituality: 0.7 } },
    { label: 'Respect is enough', ack: 'Respect it is.', set: {} },
    { label: 'I would rather not', ack: 'Noted.', set: { spirituality: 0.15 } },
  ] },
  { id: 'd_spirit2', mode: 'self', traits: ['spirituality'], text: 'What helps you feel grounded when life gets busy?' },
  { id: 'd_activity1', mode: 'self', traits: ['activity'], share: 'How I like to spend a free afternoon', text: 'You have a free afternoon and good weather. What happens?' },
  { id: 'd_activity2', mode: 'self', traits: ['activity'], text: 'What is the most physically tired you have been, in a good way?' },
  { id: 'd_affection1', mode: 'self', traits: ['affection'], text: 'What makes you feel most cared for?', choices: [
    { label: 'Kind words', ack: 'Words matter. Noted.', set: { affection: 0.55 }, aspects: { loveLanguage: 'words' } },
    { label: 'Time together', ack: 'Time is the real gift.', set: { affection: 0.6 }, aspects: { loveLanguage: 'time' } },
    { label: 'A hug, a hand to hold', ack: 'Warm. Noted.', set: { affection: 0.85 }, aspects: { loveLanguage: 'touch' } },
    { label: 'Thoughtful little gifts', ack: 'The little things. Lovely.', set: { affection: 0.6 }, aspects: { loveLanguage: 'gifts' } },
    { label: 'Help without asking', ack: 'Actions over words. Noted.', set: { affection: 0.4 }, aspects: { loveLanguage: 'help' } },
  ] },
  { id: 'd_affection2', mode: 'self', traits: ['affection'], share: 'The way to win me over', text: 'What is a small gesture that would win you over?' },
  { id: 'd_conflict1', mode: 'self', traits: ['conflict'], text: 'When you disagree with someone close, you usually…', choices: [
    { label: 'Talk it out right away', ack: 'Straight to it. Good.', set: { conflict: 0.85 } },
    { label: 'Take a breather, then talk', ack: 'Sensible.', set: { conflict: 0.5 } },
    { label: 'Need a day or two first', ack: 'Time to think. Noted.', set: { conflict: 0.15 } },
  ] },
  { id: 'd_conflict2', mode: 'self', traits: ['conflict'], text: 'What have past relationships taught you about how you argue and make up?' },
  { id: 'd_tidy1', mode: 'self', traits: ['tidiness'], text: 'Be honest: your kitchen right now is…', choices: [
    { label: 'Spotless', ack: 'Impressive.', set: { tidiness: 0.9 } },
    { label: 'Lived in', ack: 'Like most kitchens.', set: { tidiness: 0.5 } },
    { label: 'Best not to look', ack: 'Honesty. I like it.', set: { tidiness: 0.15 } },
  ] },
  { id: 'd_tidy2', mode: 'self', traits: ['tidiness'], share: 'What my home says about me', text: 'What would someone learn about you from walking into your home?' },
  { id: 'd_indep1', mode: 'self', traits: ['independence'], text: 'In a relationship, how much time apart feels right?', choices: [
    { label: 'We do most things together', ack: 'Together it is.', set: { independence: 0.15 } },
    { label: 'A good mix', ack: 'Balanced.', set: { independence: 0.5 } },
    { label: 'Plenty of my own time', ack: 'Space matters. Noted.', set: { independence: 0.85 } },
  ] },
  { id: 'd_indep2', mode: 'self', traits: ['independence'], share: 'Something I keep just for me', text: 'What is something you would always keep doing on your own, even in a relationship?' },
  { id: 'd_humour1', mode: 'self', traits: ['humour'], text: 'Which humour is most you?', choices: [
    { label: 'Dry and deadpan', ack: 'Dry it is.', set: { humour: 0.65 } },
    { label: 'Silly and goofy', ack: 'Excellent.', set: { humour: 0.9 } },
    { label: 'I am more earnest', ack: 'Sincere is good.', set: { humour: 0.2 } },
  ] },
  { id: 'd_humour2', mode: 'self', traits: ['humour'], share: 'A story that still makes me laugh', text: 'What is the funniest thing that has happened to you lately?' },
  { id: 'd_pace', mode: 'partner', traits: [], text: 'When you meet someone you like, how quickly do you like things to move?', choices: [
    { label: 'Slowly, friends first', ack: 'Slow and steady.', set: {}, aspects: { pace: 'slow' } },
    { label: 'A steady pace', ack: 'Steady. Noted.', set: {}, aspects: { pace: 'steady' } },
    { label: 'When I know, I know', ack: 'Decisive. Noted.', set: {}, aspects: { pace: 'fast' } },
  ] },
  { id: 'd_firstdate', mode: 'self', traits: ['adventure', 'social'], share: 'My idea of a great first date', text: 'What is your idea of a great first date?' },
  { id: 'd_greenflags', mode: 'partner', traits: [], share: 'Green flags I look for', text: 'What are the green flags that make you think, this one is worth getting to know?' },
  { id: 'd_marriage', mode: 'self', traits: ['family'], text: 'Is marriage something you see in your future?', choices: [
    { label: 'Yes, I hope so', ack: 'Thank you, noted.', set: { family: 0.75 }, tags: ['wants-marriage'] },
    { label: 'Maybe, if it feels right', ack: 'Open. Noted.', set: {} },
    { label: 'Not for me', ack: 'Thank you for telling me.', set: {}, tags: ['no-marriage'] },
  ] },
];

// How the matchmaker names a part of someone's life when asking why a pass felt off.
// Neutral on purpose: it must not reveal anything from the other person's hidden profile.
const ASPECT_LABEL = {
  social: 'Social life', adventure: 'Routine versus new things', ambition: 'Where work fits', family: 'Family plans',
  planning: 'Plans versus spontaneity', intellect: 'What excites them', spirituality: 'Faith', activity: 'How active they are',
  affection: 'How they show affection', conflict: 'How they handle disagreements', tidiness: 'Home life',
  independence: 'Time together versus apart', humour: 'Sense of humour',
};

// The parts of life offered after "our lives seem different". Always the same list in the
// same order: choosing which parts to show from the other person's hidden profile would
// tell the person where that profile differs from theirs.
const LIFE_PARTS = ['social', 'family', 'ambition', 'adventure', 'spirituality', 'activity'];

// Why did they pass? A short chain: the main reason, then one follow-up that turns it
// into something matching can use. event: { candidateId, name, aspects, away, age, older, thin }
function passQuestion(event) {
  const { candidateId: cid, name } = event;
  const base = { cid, name };
  const choices = [
    { label: 'No spark', ack: 'Fair, chemistry is hard to explain.', reason: 'spark', then: { type: 'pass-spark', ...base } },
  ];
  if (event.aspects?.length) {
    choices.push({ label: 'Our lives seem different', ack: 'That helps.', reason: 'lifestyle', then: { type: 'pass-lifestyle', ...base, aspects: event.aspects } });
  }
  if (event.age && event.older != null) {
    choices.push({ label: event.older ? 'A bit too old for me' : 'A bit too young for me', ack: 'Understood.', reason: 'age', then: { type: 'pass-age', ...base, age: event.age, older: event.older } });
  }
  if (event.away) {
    choices.push({ label: 'Too far away', ack: 'Understood. From now on I will stick to people near you.', reason: 'distance', limits: { localOnly: true } });
  }
  if (event.thin) {
    choices.push({ label: 'Their profile said too little', ack: 'Noted. I will favour people who share a little more about themselves.', reason: 'profile', limits: { prefersDetail: true } });
  }
  choices.push({ label: 'Something else', ack: 'Okay.', reason: 'other', then: { type: 'pass-other', ...base } });
  return { id: `fb_${cid}`, mode: 'partner', text: `You passed on ${name}. What was the main reason? Even a hunch helps me.`, choices };
}

function passFollowUp(event) {
  const { cid, name } = event;
  if (event.type === 'pass-spark') {
    return { id: `fbs_${cid}`, mode: 'partner', text: 'Think of someone you clicked with straight away. What was it about them?' };
  }
  if (event.type === 'pass-lifestyle') {
    // Point preferences away from where this person sat on each part of life.
    const away = (a, confidence) => ({ trait: a.trait, value: 1 - a.value, confidence });
    const known = Object.fromEntries((event.aspects || []).map((a) => [a.trait, a]));
    // Only where they really differ: "everything" should not move traits they share.
    const differ = (event.aspects || []).filter((a) => a.gap == null || a.gap >= 0.2);
    return {
      id: `fbl_${cid}`, mode: 'partner',
      text: `Which part of ${name}'s life felt furthest from yours?`,
      choices: [
        ...LIFE_PARTS.map((k) => ({ label: ASPECT_LABEL[k], ack: 'Got it. I will look for someone closer to you there.', prefer: known[k] ? [away(known[k], 0.35)] : [], detail: k })),
        { label: 'A bit of everything', ack: 'Got it, I will adjust across the board.', prefer: differ.map((a) => away(a, 0.2)), detail: 'everything' },
      ],
    };
  }
  if (event.type === 'pass-age') {
    const limit = event.older ? { ageMax: event.age - 1 } : { ageMin: event.age + 1 };
    return {
      id: `fba_${cid}`, mode: 'partner',
      text: event.older ? `Should I only suggest people younger than ${event.age}?` : `Should I only suggest people older than ${event.age}?`,
      choices: [
        { label: 'Yes, please', ack: 'Done. You can change that on your profile.', limits: limit },
        { label: 'No, it was more than age', ack: 'Okay.', then: { type: 'pass-other', cid, name } },
      ],
    };
  }
  if (event.type === 'pass-other') {
    return { id: `fbo_${cid}`, mode: 'partner', text: `What didn't feel right about ${name}? Even a hunch helps me.` };
  }
  return null;
}


// Asked after the person reacts to a weekly suggestion. Answers update preferences.
export function feedbackQuestion(event) {
  if (event.type === 'pass') return passQuestion(event);
  if (event.type?.startsWith('pass-')) return passFollowUp(event);
  if (event.type === 'like') {
    return { id: `fb_${event.candidateId}`, mode: 'partner', text: `You liked ${event.name}. What caught your eye?` };
  }
  if (event.type === 'recheck' && TRAITS[event.trait]) {
    const t = TRAITS[event.trait];
    return {
      id: `rc_${event.trait}`, mode: 'self',
      text: event.auto
        ? 'Your answers have pointed two ways on this, so let me just ask: which sounds more like you?'
        : 'You said I got something wrong. Help me fix it: which sounds more like you?',
      traits: [event.trait],
      choices: [
        { label: cap(t.low), ack: 'Thank you, fixed.', set: { [event.trait]: 0.15 } },
        { label: 'Somewhere in between', ack: 'Thank you, fixed.', set: { [event.trait]: 0.5 } },
        { label: cap(t.high), ack: 'Thank you, fixed.', set: { [event.trait]: 0.85 } },
      ],
    };
  }
  if (event.type === 'checkin') return metQuestion(event);
  if (event.type === 'met-once') return metOnceQuestion(event);
  if (event.type === 'match') {
    return { id: `fbm_${event.candidateId}`, mode: 'partner', text: `You and ${event.name} matched. Once you have talked a bit, tell me how it feels.` };
  }
  return null;
}

// "Did you meet?" Quick replies, so the answer can teach matching something exact.
// The route applies `met` and `metReason` (they need both people); `then` lines up the follow-up.
function metQuestion(event) {
  const { candidateId: cid, name } = event;
  const text = event.again
    ? `Last time you and ${name} were still talking. Did you meet in the end?`
    : `It has been a week since you matched with ${name}. Did you meet?`;
  return {
    id: `ci_${cid}`, mode: 'partner', text,
    choices: [
      { label: 'Yes, and I want to see them again', ack: `That is lovely to hear. I will look for more people like ${name}.`, met: 'again' },
      { label: 'Yes, but once was enough', ack: 'Thank you for telling me.', met: 'once', then: { type: 'met-once', candidateId: cid, name, aspects: event.aspects || [] } },
      { label: 'Not yet, we are talking', ack: 'Good luck. I will ask again in a couple of weeks.', met: 'talking' },
      { label: 'We did not really talk', ack: 'That happens. It does not count against anyone.', met: 'quiet' },
    ],
  };
}

function metOnceQuestion(event) {
  const { candidateId: cid, name } = event;
  const base = { cid, name };
  const choices = [
    { label: 'No spark in person', ack: 'Fair. Chemistry is hard to predict, even for me.', metReason: 'spark', then: { type: 'pass-spark', ...base } },
    { label: 'They did not look like their photos', ack: 'Thank you. That is useful, and it stays private.', metReason: 'photos' },
  ];
  if (event.aspects?.length) choices.push({ label: 'Our lives felt different', ack: 'That helps.', metReason: 'lifestyle', then: { type: 'pass-lifestyle', ...base, aspects: event.aspects } });
  choices.push(
    { label: 'I did not feel safe', ack: `I am sorry. I have told our moderators, and they will look at ${name}'s account. If you are in danger, call your local emergency number.`, metReason: 'unsafe' },
    { label: 'Something else', ack: 'Okay.', metReason: 'other', then: { type: 'pass-other', ...base } },
  );
  return { id: `mo_${cid}`, mode: 'partner', text: `What made once enough with ${name}?`, choices };
}

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}
