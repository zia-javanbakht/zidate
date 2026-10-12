// City names people actually type, mapped to one spelling so "NYC" and "new york" meet.
const ALIASES = {
  nyc: 'New York', 'new york city': 'New York', manhattan: 'New York', brooklyn: 'New York', ny: 'New York',
  la: 'Los Angeles', sf: 'San Francisco', 'san fran': 'San Francisco', dc: 'Washington', 'washington dc': 'Washington',
  'washington d.c.': 'Washington', ldn: 'London', 'greater london': 'London', 'london uk': 'London',
  'berlin germany': 'Berlin', münchen: 'Munich', muenchen: 'Munich', köln: 'Cologne', wien: 'Vienna',
  roma: 'Rome', milano: 'Milan', lisboa: 'Lisbon', praha: 'Prague', 'den haag': 'The Hague',
  'tehran iran': 'Tehran', teheran: 'Tehran', 'toronto on': 'Toronto', 'toronto canada': 'Toronto',
};

export function normalizeCity(raw) {
  const c = String(raw || '').trim().replace(/\s+/g, ' ').replace(/[.,]+$/, '');
  if (!c) return '';
  const key = c.toLowerCase().replace(/,\s*/g, ' ');
  if (ALIASES[key]) return ALIASES[key];
  // "Paris, France" -> "Paris"
  const first = c.split(',')[0].trim();
  if (ALIASES[first.toLowerCase()]) return ALIASES[first.toLowerCase()];
  return first.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}
