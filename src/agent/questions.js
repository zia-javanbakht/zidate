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

// Asked after the person reacts to a weekly suggestion. Answers update preferences.
export function feedbackQuestion(event) {
  if (event.type === 'pass') {
    return { id: `fb_${event.candidateId}`, mode: 'partner', text: `You passed on ${event.name}. What didn't feel right? Even a hunch helps me.` };
  }
  if (event.type === 'like') {
    return { id: `fb_${event.candidateId}`, mode: 'partner', text: `You liked ${event.name}. What caught your eye?` };
  }
  if (event.type === 'match') {
    return { id: `fbm_${event.candidateId}`, mode: 'partner', text: `You and ${event.name} matched. Once you have talked a bit, tell me how it feels.` };
  }
  return null;
}
