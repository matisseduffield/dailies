// Builds web/splice/days.js: a tree of words for every day into 2029.
//
//   node scripts/build-splice.mjs
//
// Answers only come from scripts/splice-answers.txt: links two separate, strict
// reviewers both kept, with the way each is written (firework, ice-cold, fire
// alarm). Everything else either list ever held (scripts/splice-words.txt and
// scripts/splice-phrases.txt) still counts when proving a tree has one answer,
// as do the proof words in scripts/mend-words.txt (SCOWL to size 70): a player
// who knows those links can't build a second arrangement we'd mark wrong.
//
// A day already in days.js is kept as long as it still passes: every link a
// reviewed answer, and still only one answer with everything we now know. Only
// days that fail are built again, so fixing a few days leaves the rest alone and
// only the rebuilt ones need reading again (the build lists them). A link rests
// for 45 days once it's used, a word for 7, and a word with the same two words
// under it for 180. Set FRESH = true to build every day from scratch.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../web/splice/lib.js');

const EPOCH = '2026-11-07';
const DAYS = 840;              // to February 2029, in whole weeks
const FRESH = false;           // true builds every day again, ignoring days.js
const REST_LINK = 45, REST_WORD = 7;
// Little linking words join with nearly anything (back off, turn away, stay over),
// so a tree that has two of them can often be built another way. One per tree.
const LINKERS = new Set(['off', 'out', 'away', 'back', 'over', 'up', 'down', 'around', 'about', 'in', 'on', 'under', 'through']);

const lines = file => readFileSync(new URL(file, import.meta.url), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
const answers = lines('./splice-answers.txt').map(l => { const [pair, written] = l.split(' | '); const [a, b] = pair.split(' '); return { a, b, written }; });
const known = new Set([
  ...lines('./splice-words.txt').map(l => { const [, a, b] = l.split(' '); return `${a} ${b}`; }),
  ...lines('./splice-phrases.txt'),
  ...answers.map(({ a, b }) => `${a} ${b}`),
  ...lines('./splice-known.txt'),
]);
const proof = new Set(lines('./mend-words.txt').find(l => l.startsWith('proof ')).split(' ').slice(1));
const joins = (a, b) => proof.has(a + b) || known.has(`${a} ${b}`);

const next = new Map(), written = new Map();
for (const { a, b, written: w } of answers) {
  if (!next.has(a)) next.set(a, []);
  next.get(a).push(b);
  written.set(`${a} ${b}`, w);
}

const before = existsSync(new URL('../web/splice/days.js', import.meta.url)) ? require('../web/splice/days.js') : null;
const lastLink = new Map(), lastWord = new Map(), lastFamily = new Map();
const REST_FAMILY = 180;
// Each word with two under it, as 'word > one,two' with the two in word order.
const families = (board, parent) => board.map((w, k) => {
  const under = parent.map((p, j) => (p === k ? board[j] : null)).filter(Boolean).sort();
  return under.length === 2 ? `${w} > ${under.join(',')}` : null;
}).filter(Boolean);
const days = [], rebuilt = [];
for (let day = 1; day <= DAYS; day++) {
  const [name] = L.shapeForDay(day, EPOCH);
  const { parent } = L.tree(name);
  let found = null;
  const kept = !FRESH && before && before.days[day - 1] ? before.days[day - 1].split(' ') : null;
  if (kept && kept.length === parent.length
    && L.linksOf(parent).every(([p, k]) => written.has(`${kept[p]} ${kept[k]}`))
    && L.solutions(parent, kept, joins, 2).count === 1) found = kept;
  else rebuilt.push(day);
  const kids = parent.map((_, k) => parent.filter(p => p === k).length);
  const random = L.rng(day * 104729);
  const fresh = w => !(lastWord.has(w) && day - lastWord.get(w) < REST_WORD);
  const freshLink = (a, b) => !(lastLink.has(`${a} ${b}`) && day - lastLink.get(`${a} ${b}`) < REST_LINK);
  for (let attempt = 0; attempt < 3000 && !found; attempt++) {
    const board = [];
    const used = new Set();
    // Top down, with a little backtracking. A word with words to hang under it
    // needs enough of them still free: ones it links to, rested and unused.
    const free = w => (next.get(w) || []).filter(b => b !== w && !used.has(b) && fresh(b) && freshLink(w, b));
    const fill = k => {
      if (k === parent.length) return true;
      const pool = parent[k] < 0 ? [...next.keys()] : (next.get(board[parent[k]]) || []).filter(b => freshLink(board[parent[k]], b));
      const linker = [...used].some(w => LINKERS.has(w));
      const options = L.shuffled(pool, random).filter(w => !used.has(w) && fresh(w) && !(linker && LINKERS.has(w)) && (!kids[k] || free(w).length >= kids[k] + 1));
      for (const w of options.slice(0, 12)) {
        board[k] = w; used.add(w);
        if (fill(k + 1)) return true;
        used.delete(w);
      }
      return false;
    };
    if (!fill(0)) continue;
    // A word with the same two words under it comes back no sooner than REST_FAMILY days.
    if (families(board, parent).some(f => lastFamily.has(f) && day - lastFamily.get(f) < REST_FAMILY)) continue;
    if (L.solutions(parent, board, joins, 2).count === 1) found = board;
  }
  if (!found) throw new Error(`no tree for day ${day} (${name})`);
  families(found, parent).forEach(f => lastFamily.set(f, day));
  found.forEach(w => lastWord.set(w, day));
  L.linksOf(parent).forEach(([p, k]) => lastLink.set(`${found[p]} ${found[k]}`, day));
  days.push(found.join(' '));
}

// How each link used is written, where that isn't simply the two words run together.
const shown = {};
days.forEach((d, i) => {
  const words = d.split(' ');
  const { parent } = L.tree(L.shapeForDay(i + 1, EPOCH)[0]);
  for (const [p, k] of L.linksOf(parent)) {
    const key = `${words[p]} ${words[k]}`, w = written.get(key) || before?.written?.[key];
    if (w && w !== words[p] + words[k]) shown[key] = w;
  }
});

const out = `// Generated by scripts/build-splice.mjs. Don't edit by hand.
var SpliceDays = ${JSON.stringify({ epoch: EPOCH, days, written: shown })};
if (typeof module === 'object' && module.exports) module.exports = SpliceDays;
`;
writeFileSync(new URL('../web/splice/days.js', import.meta.url), out);
console.log(`${days.length} days, ${(out.length / 1024).toFixed(1)} KB; built again: ${rebuilt.length ? rebuilt.join(' ') : 'none'}`);
