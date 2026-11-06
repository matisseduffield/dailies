// What makes a good day of Overland, for the build and the tests. A route's length
// is how many countries lie between its two ends on the shortest way across.
const L = require('../web/overland/lib.js');

// By weekday, Sunday first: length, the most best routes there can be, and guesses
// to spare. Fewer best routes means fewer ways to recover from a wrong turn.
const WEEK = [
  { length: [7, 8], ways: 6, spare: 2, regions: ['Africa', 'Asia', 'Americas'] },            // Sunday
  { length: [3, 3], ways: 40, spare: 3, regions: ['Europe', 'Americas'] },                   // Monday
  { length: [3, 4], ways: 30, spare: 3, regions: ['Europe', 'Americas', 'Asia'] },           // Tuesday
  { length: [4, 4], ways: 20, spare: 3, regions: ['Europe', 'Asia', 'Americas', 'Africa'] }, // Wednesday
  { length: [4, 5], ways: 16, spare: 3, regions: ['Europe', 'Asia', 'Africa', 'Americas'] }, // Thursday
  { length: [5, 6], ways: 12, spare: 2, regions: ['Asia', 'Africa', 'Europe', 'Americas'] }, // Friday
  { length: [6, 7], ways: 8, spare: 2, regions: ['Africa', 'Asia', 'Americas', 'Europe'] },  // Saturday
];

// Places a route shouldn't turn on: names people argue about. They're on the map
// and count if guessed, but no day needs them.
const DISPUTED = new Set(['ESH', 'PSE', 'UNK']);
// Too small to see on a wide map, so never an end.
const MIN_AREA = 10000;

// Every country that touches another, big enough to start or finish in.
const ends = map => Object.keys(map.countries).filter(c => map.countries[c].borders.length && map.countries[c].area >= MIN_AREA && !DISPUTED.has(c));

// The best length without the disputed places has to be the same, so a player who
// skips them loses nothing.
function clean(map, a, b) {
  const open = c => !DISPUTED.has(c);
  return L.route(map, a, b).length === L.route(map, a, b, open).length;
}

function problems(map, day, start, end, epoch) {
  const rule = WEEK[L.weekdayOf(day, epoch)];
  const out = [];
  const length = L.route(map, start, end).length - 2;
  if (length < rule.length[0] || length > rule.length[1]) out.push(`length ${length}`);
  if (L.countRoutes(map, start, end) > rule.ways) out.push('too many ways');
  if (!clean(map, start, end)) out.push('turns on a disputed place');
  if (!ends(map).includes(start) || !ends(map).includes(end)) out.push('bad end');
  return out;
}

module.exports = { WEEK, DISPUTED, MIN_AREA, ends, clean, problems };
