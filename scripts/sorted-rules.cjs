// What makes Sorted's list fair as a whole, shared by the tests and by anyone
// adding puzzles. Whether a board has one clear solution takes a person; this
// catches what a machine can.
//
//   node scripts/sorted-rules.cjs [more.txt ...]   checks the list, plus any
//                                                  puzzles not yet added to it
const { readFileSync } = require('node:fs');
const L = require('../web/sorted/lib.js');

const MAX_NAME = 34, MAX_PART = 10;

const key = text => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Why one puzzle can't go in the list.
function boardFaults(p) {
  const out = [];
  if (p.length !== 4) out.push(`${p.length} groups`);
  for (const g of p) {
    if (g.words.length !== 4) out.push(`${g.name}: ${g.words.length} words`);
    if (!g.name || g.name.length > MAX_NAME) out.push(`name over ${MAX_NAME}: ${g.name}`);
    if (/[`$\\]/.test(g.name + g.words.join())) out.push(`${g.name}: a character the list can't hold`);
    for (const w of g.words) {
      const parts = w.split(' ');
      if (!w || parts.length > 2 || parts.some(s => s.length > MAX_PART)) out.push(`too long for a tile: ${w}`);
    }
  }
  const all = L.wordsOf(p).map(key);
  if (new Set(all).size !== all.length) out.push('a word twice on the board');
  return out;
}

// Groups that are the same group: one name, or three of four words shared.
function repeats(puzzles) {
  const out = [], names = new Map(), byWord = new Map();
  puzzles.forEach((p, at) => p.forEach(g => {
    const n = key(g.name);
    if (names.has(n)) out.push(`${g.name}: puzzles ${names.get(n) + 1} and ${at + 1}`);
    else names.set(n, at);
    const shared = new Map();
    for (const w of g.words) for (const other of byWord.get(key(w)) || []) shared.set(other, (shared.get(other) || 0) + 1);
    for (const [other, count] of shared) if (count >= 3) out.push(`${count} of 4 words shared: ${other.name} (puzzle ${other.at + 1}) and ${g.name} (puzzle ${at + 1})`);
    const me = { name: g.name, at };
    for (const w of g.words) (byWord.get(key(w)) || byWord.set(key(w), []).get(key(w))).push(me);
  }));
  return out;
}

function faults(puzzles) {
  const out = [];
  puzzles.forEach((p, at) => boardFaults(p).forEach(f => out.push(`puzzle ${at + 1}: ${f}`)));
  return [...out, ...repeats(puzzles)];
}

module.exports = { boardFaults, repeats, faults };

if (require.main === module) {
  const D = require('../web/sorted/puzzles.js');
  const list = L.parse(D.text);
  const base = list.length;
  for (const f of process.argv.slice(2)) {
    const text = readFileSync(f, 'utf8').replace(/\r/g, '').split('\n').filter(l => !l.startsWith('#')).join('\n');
    if (text.trim()) list.push(...L.parse(text));
  }
  const found = faults(list);
  console.log(found.join('\n') || 'clean');
  console.log(`${found.length} faults in ${list.length} puzzles (${base} in the list)`);
  process.exit(found.length ? 1 : 0);
}
