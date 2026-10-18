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

// Where cities are, so matching can tell "the next town over" from "another continent".
// [latitude, longitude]. A city missing here still matches people in the same city;
// its distance to anywhere else is simply unknown.
const COORDS = {
  // UK and Ireland
  London: [51.507, -0.128], Brighton: [50.822, -0.137], Oxford: [51.752, -1.258], Cambridge: [52.205, 0.119],
  Reading: [51.454, -0.973], Bristol: [51.454, -2.588], Bath: [51.381, -2.359], Birmingham: [52.486, -1.890],
  Manchester: [53.481, -2.243], Liverpool: [53.408, -2.991], Leeds: [53.801, -1.549], Sheffield: [53.381, -1.470],
  Nottingham: [52.954, -1.158], Newcastle: [54.978, -1.618], Edinburgh: [55.953, -3.188], Glasgow: [55.864, -4.252],
  Cardiff: [51.481, -3.179], Belfast: [54.597, -5.930], Dublin: [53.350, -6.260], Cork: [51.899, -8.476],
  // Europe
  Paris: [48.857, 2.352], Lyon: [45.764, 4.836], Marseille: [43.297, 5.370], Brussels: [50.850, 4.352],
  Antwerp: [51.219, 4.402], Amsterdam: [52.370, 4.895], Rotterdam: [51.924, 4.478], Utrecht: [52.091, 5.122],
  'The Hague': [52.070, 4.300], Berlin: [52.520, 13.405], Potsdam: [52.391, 13.065], Hamburg: [53.551, 9.994],
  Munich: [48.135, 11.582], Cologne: [50.938, 6.960], Frankfurt: [50.110, 8.682], Stuttgart: [48.776, 9.183],
  Leipzig: [51.340, 12.375], Dresden: [51.050, 13.738], Düsseldorf: [51.227, 6.773], Vienna: [48.208, 16.373],
  Zurich: [47.377, 8.542], Geneva: [46.204, 6.143], Copenhagen: [55.676, 12.568], Stockholm: [59.329, 18.069],
  Oslo: [59.914, 10.752], Helsinki: [60.170, 24.938], Warsaw: [52.230, 21.012], Krakow: [50.065, 19.945],
  Prague: [50.076, 14.438], Budapest: [47.498, 19.040], Madrid: [40.417, -3.704], Barcelona: [41.385, 2.173],
  Valencia: [39.470, -0.376], Seville: [37.389, -5.984], Lisbon: [38.722, -9.139], Porto: [41.158, -8.629],
  Rome: [41.903, 12.496], Milan: [45.464, 9.190], Florence: [43.770, 11.256], Naples: [40.852, 14.268],
  Turin: [45.070, 7.687], Athens: [37.984, 23.728], Istanbul: [41.008, 28.978], Bucharest: [44.427, 26.103],
  // Middle East and Asia
  Tehran: [35.689, 51.389], Isfahan: [32.652, 51.668], Shiraz: [29.592, 52.584], Mashhad: [36.297, 59.606],
  Tabriz: [38.080, 46.292], Karaj: [35.840, 50.939], Dubai: [25.205, 55.271], 'Abu Dhabi': [24.454, 54.377],
  Doha: [25.286, 51.531], 'Tel Aviv': [32.085, 34.782], Mumbai: [19.076, 72.878], Delhi: [28.704, 77.102],
  Bangalore: [12.972, 77.595], Singapore: [1.352, 103.820], 'Hong Kong': [22.320, 114.169], Tokyo: [35.676, 139.650],
  Osaka: [34.694, 135.502], Seoul: [37.567, 126.978], Shanghai: [31.230, 121.474], Beijing: [39.904, 116.407],
  Bangkok: [13.756, 100.502], Sydney: [-33.869, 151.209], Melbourne: [-37.814, 144.963], Auckland: [-36.849, 174.763],
  // North America
  'New York': [40.713, -74.006], 'Jersey City': [40.718, -74.043], Newark: [40.736, -74.172], Philadelphia: [39.953, -75.165],
  Boston: [42.360, -71.059], Washington: [38.907, -77.037], Baltimore: [39.290, -76.612], Pittsburgh: [40.441, -79.996],
  Chicago: [41.878, -87.630], Detroit: [42.331, -83.046], Atlanta: [33.749, -84.388], Miami: [25.762, -80.192],
  Austin: [30.267, -97.743], Houston: [29.760, -95.370], Dallas: [32.777, -96.797], Denver: [39.739, -104.990],
  Seattle: [47.606, -122.332], Portland: [45.515, -122.679], 'San Francisco': [37.775, -122.419], Oakland: [37.804, -122.271],
  'San Jose': [37.339, -121.894], 'Los Angeles': [34.052, -118.244], 'San Diego': [32.716, -117.161], Toronto: [43.653, -79.383],
  Hamilton: [43.256, -79.869], Mississauga: [43.589, -79.644], Ottawa: [45.421, -75.697], Montreal: [45.502, -73.567],
  Vancouver: [49.283, -123.121], Calgary: [51.045, -114.072], 'Mexico City': [19.433, -99.133],
  // South America and Africa
  'São Paulo': [-23.551, -46.633], 'Rio De Janeiro': [-22.907, -43.173], 'Buenos Aires': [-34.604, -58.382],
  Cairo: [30.044, 31.236], Lagos: [6.524, 3.379], Nairobi: [-1.292, 36.822], 'Cape Town': [-33.925, 18.424],
  Johannesburg: [-26.204, 28.047],
};

// Two cities this close count as one area: a train or a short drive, not a trip.
export const NEARBY_KM = 60;
// "A few hours away": a weekend visit, not a flight.
export const FEW_HOURS_KM = 300;

export function cityCoords(raw) {
  return COORDS[normalizeCity(raw)] || null;
}

// Straight-line distance between two cities in km, 0 for the same city, or null when unknown.
export function distanceKm(a, b) {
  const [x, y] = [normalizeCity(a), normalizeCity(b)];
  if (!x || !y) return null;
  if (x === y) return 0;
  const [p, q] = [COORDS[x], COORDS[y]];
  if (!p || !q) return null;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(q[0] - p[0]);
  const dLon = rad(q[1] - p[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(p[0])) * Math.cos(rad(q[0])) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}

// Same city or the next town over.
export function nearby(a, b) {
  const d = distanceKm(a, b);
  return d != null && d <= NEARBY_KM;
}
