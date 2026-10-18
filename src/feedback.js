// Feedback on lines people write for their shared profile (as Hinge's Prompt Feedback):
// "Great answer", "Go a little deeper" or "Try a small change", with one concrete tip.
// Deterministic and offline: it looks for what gets replies (detail, warmth, something to
// ask about) and for what does not (clichés, lists of don'ts, one-word answers).

const CLICHES = [
  [/\b(love|like) to laugh\b/i, 'loving to laugh'], [/\bwork hard,? play hard\b/i, 'work hard, play hard'],
  [/\bpartner in crime\b/i, 'partner in crime'], [/\b(live,? laugh,? love)\b/i, 'live, laugh, love'],
  [/\b(love|like) (to )?travel(ling)?\b/i, 'loving travel'], [/\bgood (food|vibes|company)\b/i, 'good food and good vibes'],
  [/\b(easy[- ]?going|down to earth|laid[- ]back)\b/i, 'being easy-going'], [/\bjust ask\b/i, '"just ask"'],
  [/\bnetflix and\b/i, 'Netflix nights'], [/\bfluent in sarcasm\b/i, 'being fluent in sarcasm'],
];
const NEGATIVE = /\b(no drama|don'?t (message|bother|waste)|if you can'?t|swipe left|no time ?wasters|not looking for (games|drama)|no hookups)\b/i;

const words = (t) => String(t).trim().split(/\s+/).filter(Boolean);
// A detail: a number, a name (a capital letter not starting a sentence), or a quote.
const specific = (t) => /\d/.test(t) || /[^.!?]\s+[A-Z][a-z]{2,}/.test(t) || /["“”]/.test(t);

export function lineFeedback(prompt, text) {
  const w = words(text);
  if (w.length < 6) {
    return { level: 'deeper', label: 'Go a little deeper', tip: 'Add one more sentence with a detail only you would say. It gives people something to reply to.' };
  }
  if (NEGATIVE.test(text)) {
    return { level: 'tweak', label: 'Try a small change', tip: 'Say what you want rather than what you do not. People answer warmth far more than rules.' };
  }
  const cliche = CLICHES.find(([re]) => re.test(text));
  if (cliche && !specific(text)) {
    return { level: 'tweak', label: 'Try a small change', tip: `${cliche[1][0].toUpperCase()}${cliche[1].slice(1)} is on a lot of profiles. Name the trip, the dish or the joke instead.` };
  }
  if (specific(text) || w.length >= 18) return { level: 'great', label: 'Great answer', tip: 'Specific and easy to reply to.' };
  return { level: 'deeper', label: 'Go a little deeper', tip: `Which one, when, or why? A small, real example makes "${prompt || 'this'}" stand out.` };
}
