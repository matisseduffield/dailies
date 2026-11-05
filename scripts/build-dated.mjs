// Deals Dated's days from the events in scripts/dated/ and writes web/dated/days.js.
// The same events always give the same days. Takes under a minute:
//   node scripts/build-dated.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../web/dated/lib.js');
const R = require('./dated-rules.cjs');

const bank = R.readBank();
bank.sort((a, b) => a.year - b.year || a.text.localeCompare(b.text));
const bad = bank.flatMap(e => R.eventProblems(e).map(p => `${e.subject}:${e.line} ${p}: ${e.text}`));
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
const seen = new Set();
for (const e of bank) {
  if (seen.has(e.text)) { console.error('twice: ' + e.text); process.exit(1); }
  seen.add(e.text);
}

let random = L.rng(0);
let usedOn = [];   // the days each event is on, counting from 0
let days = [];
let why = {};      // what stopped each try, printed if a day can't be dealt
const LATE = 220, URGENCY = 5;

const pick = list => list[Math.floor(random() * list.length)];
const apart = (a, b) => { const d = Math.abs(a - b); return Math.min(d, R.DAYS - d); };
// One event in eight is held back for the last weeks. The cooldown reaches round the
// end of the list to the first days, and these have nothing there to clash with.
const held = (id, at) => id % 8 === 3 && at < R.DAYS - 70;
const cool = (id, at) => !held(id, at) && usedOn[id].every(u => apart(u, at) > R.COOL);

// The most cards `ids` shares with any earlier day.
function overlaps(ids) {
  const shared = new Map();
  for (const id of ids) for (const u of usedOn[id]) shared.set(u, (shared.get(u) || 0) + 1);
  return Math.max(0, ...shared.values());
}

// Prefers what's been used least, so the whole bank gets its turn, and saves the
// best-known cards for the days that need them.
// Late in the list, a card first used early runs out of time before the cooldown
// reaches round to it, so those go first.
const worth = (id, rule, at) => usedOn[id].length + random() * 1.6 + (bank[id].level === 1 && rule.known < 0.5 ? 1.2 : 0) +
  (at > LATE ? Math.min(usedOn[id].length ? usedOn[id][0] : 90, 90) / 90 * URGENCY : 0);

function attempt(at, rule) {
  const free = [];
  bank.forEach((e, id) => { if (e.level <= rule.level && cool(id, at)) free.push(id); });
  let pool = free, from = -Infinity;
  if (rule.span < 999) {
    from = bank[pick(free)].year - Math.floor(random() * rule.span);
    pool = free.filter(id => bank[id].year >= from && bank[id].year <= from + rule.span);
  }
  pool = pool.map(id => [worth(id, rule, at), id]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
  if (rule.known) pool = [...pool.filter(id => bank[id].level === 1).slice(0, Math.ceil(rule.cards * rule.known) + 3), ...pool];
  if (rule.hard) pool = [...pool.filter(id => bank[id].level === 3).slice(0, rule.hard + 1), ...pool];
  const picked = [];
  const cap = Math.ceil(rule.cards * 0.4);
  const bySubject = {};
  for (const id of pool) {
    const e = bank[id];
    if (picked.includes(id)) continue;
    if (picked.some(p => Math.abs(bank[p].year - e.year) < rule.gap)) continue;
    if ((bySubject[e.subject] || 0) >= cap) continue;
    if (picked.some(p => L.clash(bank[p].keys, e.keys))) continue;
    if (overlaps([...picked, id]) > R.SHARED) continue;
    picked.push(id);
    bySubject[e.subject] = (bySubject[e.subject] || 0) + 1;
    if (picked.length === rule.cards) return { picked, from };
  }
  return null;
}

// A close day needs its years packed: the card with the widest gaps around it makes
// way for one beside another card, until enough neighbours are close.
function tighten({ picked, from }, at, rule) {
  const enough = () => R.measure(picked.map(id => bank[id].year)).close >= rule.close;
  for (let step = 0; step < 60 && !enough(); step++) {
    const sorted = [...picked].sort((a, b) => bank[a].year - bank[b].year);
    const years = sorted.map(id => bank[id].year);
    const spareHard = picked.filter(p => bank[p].level === 3).length > rule.hard;
    let worst = 0, score = -1;
    sorted.forEach((id, i) => {
      const s = (i ? years[i] - years[i - 1] : 0) + (i < years.length - 1 ? years[i + 1] - years[i] : 0);
      if (s > score && (bank[id].level !== 3 || spareHard)) { score = s; worst = i; }
    });
    const out = sorted[worst];
    const rest = picked.filter(id => id !== out);
    const taken = new Set(rest.map(id => bank[id].year));
    const options = [];
    bank.forEach((e, id) => {
      if (e.level > rule.level || taken.has(e.year) || !cool(id, at) || rest.includes(id) || id === out) return;
      if (e.year < from || e.year > from + rule.span) return;
      if (rest.filter(p => bank[p].subject === e.subject).length >= Math.ceil(rule.cards * 0.4)) return;
      if (bank[out].subject === 'australia' && e.subject !== 'australia' && !rest.some(p => bank[p].subject === 'australia')) return;
      if (!rest.some(p => Math.abs(bank[p].year - e.year) <= R.CLOSE)) return;
      if (rest.some(p => Math.abs(bank[p].year - e.year) < rule.gap)) return;
      if (rest.some(p => L.clash(bank[p].keys, e.keys))) return;
      if (overlaps([...rest, id]) > R.SHARED) return;
      options.push(id);
    });
    if (!options.length) return null;
    picked = [...rest, options.map(id => [worth(id, rule, at), id]).sort((a, b) => a[0] - b[0])[0][1]];
  }
  return enough() ? picked : null;
}

function deal(at) {
  const day = at + 1;
  const rule = R.WEEK[L.weekdayOf(day, R.EPOCH)];
  let best = null, bestScore = Infinity;
  why = {};
  for (let tries = 0, found = 0; tries < 3000 && found < 12; tries++) {
    const got = attempt(at, rule);
    const picked = got && (rule.close ? tighten(got, at, rule) : got.picked);
    if (!picked) { why.none = (why.none || 0) + 1; continue; }
    const problems = R.dayProblems(day, picked.map(id => bank[id]));
    for (const p of problems) { const k = p.split(/[ :]/).slice(0, 3).join(' '); why[k] = (why[k] || 0) + 1; }
    if (problems.length) continue;
    found++;
    const score = picked.reduce((a, id) => a + usedOn[id].length ** 2, 0);
    if (score < bestScore) { bestScore = score; best = picked; }
  }
  return best;
}

// The last weeks are the tightest, with the cooldown reaching round to the first
// days, so a deal that runs dry starts again from the next seed. Returns the day it
// stuck on, or 0.
function dealAll(seed) {
  random = L.rng(seed);
  usedOn = bank.map(() => []);
  days = [];
  for (let at = 0; at < R.DAYS; at++) {
    const picked = deal(at);
    if (!picked) return at + 1;
    for (const id of picked) usedOn[id].push(at);
    // The start card is the best known near the middle, then a shuffled deal.
    const sorted = [...picked].sort((a, b) => bank[a].year - bank[b].year);
    const middle = sorted.slice(Math.floor(sorted.length / 4), Math.ceil(sorted.length * 3 / 4));
    const start = [...middle].sort((a, b) => bank[a].level - bank[b].level)[0];
    days.push([start, ...L.shuffled(picked.filter(id => id !== start), random)]);
  }
  return 0;
}

let seed = 20261105;
let stuck = dealAll(seed);
for (let n = 0; stuck && n < 60; n++) {
  console.log(`seed ${seed}: stuck on day ${stuck} ${JSON.stringify(why)}`);
  stuck = dealAll(++seed);
}
if (stuck) process.exit(1);

const json = JSON.stringify;
const out = `// Written by scripts/build-dated.mjs from scripts/dated/. Don't edit by hand.
// days: each day's cards, two base-36 characters each, the first starting on the
// timeline and the rest in the order dealt.
(function (root) {
  const data = {
    epoch: ${json(R.EPOCH)},
    years: ${json(bank.map(e => e.year))},
    texts: ${json(bank.map(e => e.text))},
    days: ${json(days.map(L.pack))},
  };
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.DatedDays = data;
})(this);
`;
fs.writeFileSync(new URL('../web/dated/days.js', import.meta.url), out);
const uses = usedOn.map(u => u.length);
console.log(`seed ${seed}: ${bank.length} events, ${days.length} days, ${out.length} bytes; each event used ${Math.min(...uses)} to ${Math.max(...uses)} times, ${uses.filter(u => !u).length} unused`);
