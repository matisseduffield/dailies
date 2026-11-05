// Takes words out of Mend without a full rebuild, since a rebuild reassigns every
// day. A daily board holding a banned word or a related pair trades places with
// a clean Practice board of the same shape, then any banned word left in Practice
// is covered by a copy of a clean board.
//
//   node scripts/mend-swap-days.cjs word word ...
//
// Only for days nobody has played yet: a puzzle's place is its day.
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const L = require('../web/mend/lib.js');
const D = require('../web/mend/days.js');

const GAP = 90;
const CAP = 16;
const banned = new Set(process.argv.slice(2));
const total = D.seeds.length / 3;

const wordsAt = at => { const p = L.puzzle(at, D); return p.shape.words.map(w => w.map(t => p.answer[t]).join('')); };
const related = (a, b) => {
  if (a.includes(b) || b.includes(a)) return true;
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n >= 4 && n >= Math.min(a.length, b.length) - 2;
};
const dirty = at => {
  const ws = wordsAt(at);
  return ws.some(w => banned.has(w)) || ws.some((a, i) => ws.some((b, j) => i < j && related(a, b)));
};

// Where each board's letters and seed sit in the data.
const span = at => {
  const before = Array.from({ length: at }, (_, i) => L.shapeAt(i, D.epoch).cells.length).reduce((a, b) => a + b, 0);
  return [before, before + L.shapeAt(at, D.epoch).cells.length];
};
function swap(a, b) {
  const [a1, a2] = span(a), [b1] = span(b);
  const la = D.letters.slice(a1, a2), lb = D.letters.slice(b1, b1 + a2 - a1);
  const sa = D.seeds.slice(a * 3, a * 3 + 3), sb = D.seeds.slice(b * 3, b * 3 + 3);
  D.letters = D.letters.slice(0, a1) + lb + D.letters.slice(a2);
  D.letters = D.letters.slice(0, b1) + la + D.letters.slice(b1 + a2 - a1);
  D.seeds = D.seeds.slice(0, a * 3) + sb + D.seeds.slice(a * 3 + 3);
  D.seeds = D.seeds.slice(0, b * 3) + sa + D.seeds.slice(b * 3 + 3);
}

const sameShape = (a, b) => L.shapeAt(a, D.epoch).name === L.shapeAt(b, D.epoch).name && a % 7 === b % 7;
function fits(at, spare) {
  const words = wordsAt(spare);
  if (dirty(spare)) return false;
  const uses = new Map();
  for (let d = 0; d < D.days; d++) {
    if (d === at) continue;
    for (const w of wordsAt(d)) {
      uses.set(w, (uses.get(w) || 0) + 1);
      if (words.includes(w) && Math.abs(d - at) < GAP) return false;
    }
  }
  return words.every(w => (uses.get(w) || 0) < CAP);
}

let moved = 0;
for (let at = 0; at < D.days; at++) {
  if (!dirty(at)) continue;
  let spare = -1;
  for (let s = D.days; s < total && spare < 0; s++) if (sameShape(at, s) && fits(at, s)) spare = s;
  if (spare < 0) { console.log(`day ${at + 1}: nothing fits, kept ${wordsAt(at).join(' ')}`); continue; }
  console.log(`day ${at + 1}: ${wordsAt(at).join(' ')}  ->  ${wordsAt(spare).join(' ')}`);
  swap(at, spare);
  moved++;
}

// Practice boards left holding a banned word.
let covered = 0;
for (let at = D.days; at < total; at++) {
  if (!dirty(at)) continue;
  let clean = -1;
  for (let s = D.days; s < total && clean < 0; s++) if (s !== at && sameShape(at, s) && !dirty(s)) clean = s;
  if (clean < 0) throw new Error(`no clean Practice board for ${at}`);
  const [a1, a2] = span(at), [c1] = span(clean);
  D.letters = D.letters.slice(0, a1) + D.letters.slice(c1, c1 + a2 - a1) + D.letters.slice(a2);
  D.seeds = D.seeds.slice(0, at * 3) + D.seeds.slice(clean * 3, clean * 3 + 3) + D.seeds.slice(at * 3 + 3);
  covered++;
}

const file = path.join(__dirname, '../web/mend/days.js');
const old = readFileSync(file, 'utf8');
const head = old.slice(0, old.indexOf('var MendDays'));
const tail = old.slice(old.indexOf('if (typeof module'));
writeFileSync(file, `${head}var MendDays = ${JSON.stringify({ epoch: D.epoch, days: D.days, letters: D.letters, seeds: D.seeds })};\n${tail}`);
console.log(`${moved} days changed, ${covered} Practice boards covered`);
