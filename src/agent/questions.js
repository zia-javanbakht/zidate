// The interviewer's question bank, used by the offline agent and as a guide for Claude.
// mode 'self'    -> answers describe the person (hidden traits)
// mode 'partner' -> answers describe what they want (hidden preferences)
// share          -> a good answer can become a suggested item on the shared profile
// choices        -> quick replies; each maps straight to trait values

export const BASICS = [
  {
    id: 'b_gender', key: 'gender', text: 'First, a few basics so I only suggest people who fit. How do you describe yourself?',
    choices: ['Woman', 'Man', 'Non-binary'],
  },
  { id: 'b_seeking', key: 'seeking', text: 'And who would you like to meet?', choices: ['Women', 'Men', 'Everyone'] },
  { id: 'b_age', key: 'age', text: 'How old are you?' },
  { id: 'b_city', key: 'city', text: 'Which city are you in?' },
];

export const QUESTIONS = [
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
      { label: 'Open to it', ack: 'Open is good. Noted.', set: { family: 0.6 } },
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
      { label: 'See where it goes', ack: 'No pressure. Good.', set: {} },
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
];

// Asked after the person reacts to a weekly suggestion. Answers update preferences.
export function feedbackQuestion(event) {
  if (event.type === 'pass') {
    return { id: `fb_${event.candidateId}`, mode: 'partner', text: `You passed on ${event.name}. What didn't feel right? Even a hunch helps me.` };
  }
  if (event.type === 'like') {
    return { id: `fb_${event.candidateId}`, mode: 'partner', text: `You liked ${event.name}. What caught your eye?` };
  }
  if (event.type === 'recheck' && TRAITS[event.trait]) {
    const t = TRAITS[event.trait];
    return {
      id: `rc_${event.trait}`, mode: 'self',
      text: `You said I got something wrong. Help me fix it: which sounds more like you?`,
      traits: [event.trait],
      choices: [
        { label: cap(t.low), ack: 'Thank you, fixed.', set: { [event.trait]: 0.15 } },
        { label: 'Somewhere in between', ack: 'Thank you, fixed.', set: { [event.trait]: 0.5 } },
        { label: cap(t.high), ack: 'Thank you, fixed.', set: { [event.trait]: 0.85 } },
      ],
    };
  }
  if (event.type === 'checkin') {
    return { id: `ci_${event.candidateId}`, mode: 'partner', text: `It has been a week since you matched with ${event.name}. Did you talk or meet? How is it going?` };
  }
  if (event.type === 'match') {
    return { id: `fbm_${event.candidateId}`, mode: 'partner', text: `You and ${event.name} matched. Once you have talked a bit, tell me how it feels.` };
  }
  return null;
}

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}
