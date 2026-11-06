// Deals Overland's days from the map and writes web/overland/days.js. The same map
// always gives the same days. Takes a few seconds:
//   node scripts/build-overland.mjs
// Days already played must not change, so once the game is out, don't run this
// without keeping them.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../web/overland/lib.js');
const R = require('./overland-rules.cjs');
const map = require('../web/overland/map.js');

const EPOCH = '2026-11-06';
const DAYS = 1456;   // four years of whole weeks
const random = L.rng(20261106);
const pick = list => list[Math.floor(random() * list.length)];
const regionOf = c => map.countries[c].region;

// Every pair once, sorted into what each weekday can use.
const ends = R.ends(map);
const byWeekday = R.WEEK.map(() => []);
for (const a of ends) {
  const away = L.steps(map, a);
  for (const b of ends) {
    if (!away.has(b) || a >= b) continue;
    const length = away.get(b) - 1;
    R.WEEK.forEach((rule, i) => {
      if (length < rule.length[0] || length > rule.length[1]) return;
      if (!rule.regions.includes(regionOf(a)) && !rule.regions.includes(regionOf(b))) return;
      if (L.countRoutes(map, a, b) > rule.ways || !R.clean(map, a, b)) return;
      byWeekday[i].push([a, b]);
    });
  }
}
console.log('pairs by weekday, Sunday first:', byWeekday.map(p => p.length).join(' '));

// A country stays off the ends for a few weeks, and a pair comes round only once.
// Regions take turns, so a week isn't all Europe.
const COOL = 21;
const lastEnd = new Map();
const lastRegion = [];
const usedPairs = new Set();
const days = [];
for (let day = 1; day <= DAYS; day++) {
  const weekday = L.weekdayOf(day, EPOCH);
  const rule = R.WEEK[weekday];
  let chosen = null;
  for (let cool = COOL; !chosen && cool >= 0; cool -= 3) {
    const options = byWeekday[weekday].filter(([a, b]) => !usedPairs.has(a + b)
      && day - (lastEnd.get(a) ?? -99) > cool && day - (lastEnd.get(b) ?? -99) > cool);
    if (!options.length) continue;
    // Whichever region has waited longest, among those this weekday likes.
    const wait = r => { const at = lastRegion.lastIndexOf(r); return at < 0 ? 999 : lastRegion.length - at; };
    const regions = rule.regions.filter(r => options.some(([a, b]) => regionOf(a) === r || regionOf(b) === r));
    const region = regions.sort((x, y) => wait(y) - wait(x))[0];
    chosen = pick(options.filter(([a, b]) => regionOf(a) === region || regionOf(b) === region));
    lastRegion.push(region);
  }
  if (!chosen) throw new Error(`nothing left for day ${day}`);
  let [a, b] = chosen;
  usedPairs.add(a + b);
  if (random() < 0.5) [a, b] = [b, a];
  lastEnd.set(a, day); lastEnd.set(b, day);
  days.push(`${a} ${b} ${rule.spare}`);
}

const text = `// Written by scripts/build-overland.mjs. Don't edit by hand.
// Each day: where to start, where to finish, and guesses to spare over the best.
(function (root) {
  const data = {
    epoch: ${JSON.stringify(EPOCH)},
    days: ${JSON.stringify(days)},
  };
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.OverlandDays = data;
})(this);
`;
fs.writeFileSync(new URL('../web/overland/days.js', import.meta.url), text);

const name = c => map.countries[c].name;
for (const line of days.slice(0, 14)) {
  const [a, b, s] = line.split(' ');
  console.log(name(a), '→', name(b), '| spare', s, '|', L.route(map, a, b).slice(1, -1).map(name).join(', '), '| ways', L.countRoutes(map, a, b));
}
const seen = {};
for (const d of days) for (const c of d.split(' ').slice(0, 2)) seen[c] = (seen[c] || 0) + 1;
const counts = Object.entries(seen).sort((a, b) => b[1] - a[1]);
console.log('most used', counts.slice(0, 6).join(' '), '| least', counts.slice(-4).join(' '), '| ends used', counts.length);
