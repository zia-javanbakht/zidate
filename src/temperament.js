// Temperaments: a second, fully hidden layer of the profile, built from a short
// questionnaire the matchmaker weaves into the conversation. Four independent scales,
// each 0..1 with a confidence, so everyone is a blend rather than a box:
//   spark   - curious, playful, spontaneous, restless with routine
//   anchor  - steady, loyal, plans ahead, follows through
//   compass - direct, decisive, analytical, goal-led
//   hearth  - warm, intuitive, nurturing, reads the room
// Never shown to anyone, the person included; only the matchmaker uses it (see pishiFit).
// No imports: traits.js builds the empty hidden profile from this file.
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export const TEMPERAMENTS = {
  spark: 'curious, playful, spontaneous',
  anchor: 'steady, loyal, plans ahead',
  compass: 'direct, decisive, analytical',
  hearth: 'warm, intuitive, nurturing',
};
export const TEMPERAMENT_KEYS = Object.keys(TEMPERAMENTS);

// The questionnaire. Each quick reply nudges one or two scales (temper: { scale: value }).
// Options pull in different directions, so no answer reads as the "right" one, and the
// questions sound like conversation rather than a test.
export const TEMPERAMENT_ITEMS = [
  { id: 't_saturday', text: 'A free Saturday with nothing planned feels…', choices: [
    { label: 'Exciting, anything could happen', ack: 'The best kind of Saturday.', temper: { spark: 0.9, anchor: 0.3 } },
    { label: 'A chance to get ahead on things', ack: 'Productive. Noted.', temper: { compass: 0.85 } },
    { label: 'A bit unsettling', ack: 'Fair, a plan is comforting.', temper: { anchor: 0.85, spark: 0.2 } },
    { label: 'Perfect for seeing people', ack: 'Lovely.', temper: { hearth: 0.8 } },
  ] },
  { id: 't_friend', text: 'A friend calls, upset. Your first instinct is to…', choices: [
    { label: 'Listen and let them talk', ack: 'A good friend to have.', temper: { hearth: 0.9 } },
    { label: 'Help them work out what to do', ack: 'Practical help is real help.', temper: { compass: 0.85, hearth: 0.5 } },
    { label: 'Take them out to forget it', ack: 'A distraction can work wonders.', temper: { spark: 0.8, hearth: 0.55 } },
    { label: 'Be there, whatever it takes', ack: 'Loyal. Noted.', temper: { anchor: 0.85, hearth: 0.6 } },
  ] },
  { id: 't_decide', text: 'When you have a big decision to make, you usually…', choices: [
    { label: 'Weigh it up, then decide fast', ack: 'Decisive.', temper: { compass: 0.9 } },
    { label: 'Go with my gut', ack: 'Trusting your gut. Noted.', temper: { spark: 0.75, hearth: 0.6 } },
    { label: 'Talk it over with people I trust', ack: 'Sensible.', temper: { hearth: 0.8, compass: 0.35 } },
    { label: 'Take my time and stick with it', ack: 'Steady.', temper: { anchor: 0.85, spark: 0.25 } },
  ] },
  { id: 't_rules', text: 'Rules are…', choices: [
    { label: 'There for good reasons', ack: 'Noted.', temper: { anchor: 0.85, spark: 0.2 } },
    { label: 'Fine, if they make sense', ack: 'Fair enough.', temper: { compass: 0.75 } },
    { label: 'More like suggestions', ack: 'A free spirit.', temper: { spark: 0.9, anchor: 0.15 } },
  ] },
  { id: 't_compliment', text: 'Which compliment would mean the most?', choices: [
    { label: 'You are so much fun', ack: 'Fun is underrated.', temper: { spark: 0.85 } },
    { label: 'I can always count on you', ack: 'That one lasts.', temper: { anchor: 0.9 } },
    { label: 'You are brilliant at what you do', ack: 'Noted.', temper: { compass: 0.85 } },
    { label: 'You really understand me', ack: 'That is a lovely one.', temper: { hearth: 0.9 } },
  ] },
  { id: 't_argue', text: 'In a heated discussion, you are the one who…', choices: [
    { label: 'Says what everyone is thinking', ack: 'Brave.', temper: { compass: 0.9, hearth: 0.3 } },
    { label: 'Finds the middle ground', ack: 'A peacemaker.', temper: { hearth: 0.85 } },
    { label: 'Lightens the mood', ack: 'Every room needs one.', temper: { spark: 0.8 } },
    { label: 'Sticks to the facts', ack: 'Clear-headed.', temper: { compass: 0.7, anchor: 0.6 } },
  ] },
  { id: 't_money', text: 'An unexpected bonus lands. You…', choices: [
    { label: 'Book something spontaneous', ack: 'Ha, good plan.', temper: { spark: 0.9, anchor: 0.2 } },
    { label: 'Save it, mostly', ack: 'Sensible.', temper: { anchor: 0.85 } },
    { label: 'Invest it in a goal', ack: 'Ambitious.', temper: { compass: 0.85 } },
    { label: 'Treat the people I love', ack: 'Generous.', temper: { hearth: 0.85 } },
  ] },
  { id: 't_group', text: 'In a group trip, you naturally become the one who…', choices: [
    { label: 'Finds the hidden spots', ack: 'Every group needs one.', temper: { spark: 0.9 } },
    { label: 'Makes the plan', ack: 'Thank goodness for you.', temper: { anchor: 0.7, compass: 0.75 } },
    { label: 'Keeps everyone happy', ack: 'The glue.', temper: { hearth: 0.9 } },
    { label: 'Goes with the flow', ack: 'Easy company.', temper: { spark: 0.55, compass: 0.2 } },
  ] },
  { id: 't_film', text: 'A film that stays with you is usually one that…', choices: [
    { label: 'Made me feel something deeply', ack: 'The best kind.', temper: { hearth: 0.85 } },
    { label: 'Had a clever puzzle to it', ack: 'A thinker.', temper: { compass: 0.8 } },
    { label: 'Took me somewhere new', ack: 'An explorer.', temper: { spark: 0.85 } },
    { label: 'Felt like coming home', ack: 'Comfort counts.', temper: { anchor: 0.8, hearth: 0.6 } },
  ] },
  { id: 't_change', text: 'Your favourite café closes for good. You…', choices: [
    { label: 'Mourn it, honestly', ack: 'Loyal to the end.', temper: { anchor: 0.85 } },
    { label: 'Get excited to find a new one', ack: 'Silver linings.', temper: { spark: 0.85 } },
    { label: 'Wonder how the owners are doing', ack: 'That is kind.', temper: { hearth: 0.85 } },
  ] },
  { id: 't_work', text: 'At work, people come to you when they need…', choices: [
    { label: 'A decision', ack: 'Decisive.', temper: { compass: 0.9 } },
    { label: 'Someone to hear them out', ack: 'That matters.', temper: { hearth: 0.9 } },
    { label: 'A fresh idea', ack: 'Creative.', temper: { spark: 0.85 } },
    { label: 'It done properly', ack: 'Reliable.', temper: { anchor: 0.85, compass: 0.55 } },
  ] },
  { id: 't_love', text: 'In love, what matters most to you?', choices: [
    { label: 'Never getting bored', ack: 'Keep it alive. Noted.', temper: { spark: 0.9 } },
    { label: 'Being able to rely on each other', ack: 'The foundation.', temper: { anchor: 0.9 } },
    { label: 'Growing and pushing each other', ack: 'Ambitious together.', temper: { compass: 0.8 } },
    { label: 'Feeling deeply understood', ack: 'Understood.', temper: { hearth: 0.9 } },
  ] },
];

// One quick reply is good evidence, but no single answer should settle a scale.
export const ITEM_CONFIDENCE = 0.35;

export function emptyTemperament() {
  return Object.fromEntries(TEMPERAMENT_KEYS.map((k) => [k, { value: 0.5, confidence: 0 }]));
}

// How sure we are about the scale we know least, 0..1.
export function temperamentConfidence(user) {
  const t = user.hidden.temperament;
  return t ? Math.min(...TEMPERAMENT_KEYS.map((k) => t[k].confidence)) : 0;
}

// The score used for matching: pulled toward neutral until we are fairly sure.
function sure(t, k) {
  const s = t?.[k] || { value: 0.5, confidence: 0 };
  return 0.5 + (s.value - 0.5) * Math.min(1, s.confidence / 0.6);
}

// Pishi Fit, 0..1: how well two temperaments go together. Symmetric.
//   Tempo   (0.5): similar pace of life. Spark and Anchor should be alike.
//   Balance (0.3): the pair has a head and a heart. At least one strong Compass and one strong Hearth.
//   Warmth  (0.2): Hearth helps any pairing.
//   Clash   (up to -0.15): two very strong Compasses tend to butt heads.
export function pishiFit(a, b) {
  const [ta, tb] = [a.hidden.temperament, b.hidden.temperament];
  const s = (t, k) => sure(t, k);
  const tempo = 1 - (Math.abs(s(ta, 'spark') - s(tb, 'spark')) + Math.abs(s(ta, 'anchor') - s(tb, 'anchor'))) / 2;
  const balance = Math.sqrt(Math.max(s(ta, 'compass'), s(tb, 'compass')) * Math.max(s(ta, 'hearth'), s(tb, 'hearth')));
  const warmth = (s(ta, 'hearth') + s(tb, 'hearth')) / 2;
  const clash = 0.15 * (Math.max(0, s(ta, 'compass') - 0.6) * Math.max(0, s(tb, 'compass') - 0.6)) / 0.16;
  return clamp01(0.5 * tempo + 0.3 * balance + 0.2 * warmth - clash);
}

// How much Pishi Fit counts in the overall match score: nothing until both people have
// answered some of the questionnaire, at most a fifth once both are well known.
export const FIT_WEIGHT = 0.2;
export function fitWeight(a, b) {
  return FIT_WEIGHT * Math.min(1, Math.min(temperamentConfidence(a), temperamentConfidence(b)) / 0.5);
}
