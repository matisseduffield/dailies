// Cluey's puzzles. A grid is filled by computer; every clue is written by hand.
//
//   scripts/cluey/clues-*.txt   the clue bank: "day N", then word level tag clue
//   scripts/cluey/grids.txt     the days in order: grid, then each answer's level
//   scripts/cluey/reject.txt    words that are never to be answers
//   web/cluey/puzzles.js        what the page loads, made from the two above
//
//   node scripts/build-cluey.mjs             rebuild puzzles.js from grids.txt
//   node scripts/build-cluey.mjs --more 7    add days at the end, from the bank
//   node scripts/build-cluey.mjs --redo 3,9  fill those days again (before they
//                                            go live only: a place in the list is a day)
//   ... --pool                               also let in everyday words and a few
//                                            plurals; the build lists what to write
//   ... --nodes, --total, --wide, --salt     search effort, for grids that won't fill
//   ... --out file                           write the days elsewhere
//   ... --draft                              write puzzles.js even with clues missing
//
// Add days a week at a time so the list stays a multiple of seven: when it goes
// round, every puzzle then lands on the weekday it was made for.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('./cluey-rules.cjs');
const L = require('../web/cluey/lib.js');

const EPOCH = '2026-11-05';
const DIR = new URL('./cluey/', import.meta.url);
const GRIDS = new URL('grids.txt', DIR);
const OUT = new URL('../web/cluey/puzzles.js', import.meta.url);

const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };

// ---- the bank ----
// Clues belong to a day: a "day N" line, then a line for each answer, as
// word level tag clue. A clue is written with the rest of its puzzle in view,
// which is how a puzzle gets its mix, so none is ever used twice.
function readBank() {
  const bank = new Map();   // day -> word -> { level, tag, clue }
  for (const f of readdirSync(DIR).filter(f => /^clues-.*\.txt$/.test(f)).sort()) {
    let day = 0;
    readFileSync(new URL(f, DIR), 'utf8').split('\n').forEach((line, i) => {
      if (!line.trim() || line.startsWith('#')) return;
      const head = line.match(/^day (\d+)$/);
      if (head) { day = Number(head[1]); bank.set(day, new Map()); return; }
      const m = line.match(/^([a-z]+) ([123]) ([dbxcpwn]) (.+)$/);
      if (!m || !day) throw new Error(`${f}:${i + 1} can't read: ${line}`);
      bank.get(day).set(m[1], { level: Number(m[2]), tag: m[3], clue: m[4].trim() });
    });
  }
  return bank;
}
const rejected = new Set(existsSync(new URL('reject.txt', DIR))
  ? readFileSync(new URL('reject.txt', DIR), 'utf8').split('\n').filter(l => !l.startsWith('#')).join(' ').split(/\s+/).filter(Boolean) : []);

const listOf = name => new Set(readFileSync(new URL(name, DIR), 'utf8').split('\n').filter(l => !l.startsWith('#')).join(' ').split(/\s+/).filter(Boolean));
const good = listOf('good.txt');
const lively = new Set(readFileSync(new URL('lively.txt', DIR), 'utf8').split('\n').filter(l => !l.startsWith('#')).join(' ').split(/\s+/).filter(Boolean));

// Common plurals and past tenses, a little dull as answers. Only --pool lets
// them in, and a grid may have two.
const inflected = new Map(readFileSync(new URL('inflected.txt', DIR), 'utf8').split('\n').filter(Boolean).map(l => l.split(' ')));

function readDays() {
  if (!existsSync(GRIDS)) return [];
  return readFileSync(GRIDS, 'utf8').split('\n').filter(Boolean).map(line => {
    const [grid, levels] = line.split(' ');
    return { grid, levels: [...levels].map(Number) };
  });
}
const writeDays = days => writeFileSync(arg('--out') || GRIDS, days.map(d => `${d.grid} ${d.levels.join('')}\n`).join(''));

// ---- patterns ----
// Every half-turn shape where each cell is in two answers of 3+, kept only if
// no single cell holds the grid together.
function patterns(n) {
  const cells = n * n, half = Math.ceil(cells / 2), g = new Array(cells).fill(0), out = [];
  const rowsOf = () => Array.from({ length: n }, (_, r) => g.slice(r * n, r * n + n).map(x => (x ? '#' : 'a')).join('')).join('/');
  const runsOk = () => {
    for (let k = 0; k < n; k++) for (const at of [i => k * n + i, i => i * n + k]) {
      let run = 0;
      for (let i = 0; i <= n; i++) {
        if (i < n && !g[at(i)]) run++;
        else { if (run && run < 3) return false; run = 0; }
      }
    }
    return true;
  };
  const whole = skip => {
    const start = g.findIndex((b, i) => !b && i !== skip);
    const seen = new Set([start]), stack = [start];
    while (stack.length) {
      const p = stack.pop(), r = Math.floor(p / n), c = p % n;
      for (const [a, b] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
        const q = a * n + b;
        if (a < 0 || b < 0 || a >= n || b >= n || g[q] || q === skip || seen.has(q)) continue;
        seen.add(q); stack.push(q);
      }
    }
    return seen.size === g.filter(b => !b).length - (skip >= 0 ? 1 : 0);
  };
  (function next(i, blocks) {
    if (blocks > 16) return;
    if (i === half) {
      if (!runsOk() || !whole(-1)) return;
      if (g.some((b, k) => !b && !whole(k))) return;
      out.push({ shape: rowsOf(), blocks });
      return;
    }
    const j = cells - 1 - i;
    next(i + 1, blocks);
    g[i] = 1; g[j] = 1;
    next(i + 1, blocks + (i === j ? 1 : 2));
    g[i] = 0; g[j] = 0;
  })(0, 0);
  return out;
}

// ---- filling ----
const pop = x => {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
};

class Index {
  constructor(words) {
    this.words = words;
    this.blocks = Math.ceil(words.length / 32) || 1;
    this.at = new Map();
    words.forEach((w, i) => {
      for (let p = 0; p < w.length; p++) {
        const k = p * 26 + w.charCodeAt(p) - 97;
        if (!this.at.has(k)) this.at.set(k, new Uint32Array(this.blocks));
        this.at.get(k)[i >> 5] |= 1 << (i & 31);
      }
    });
    this.none = new Uint32Array(this.blocks);
  }
}

// Slots most constrained first; words nearer the front of a list are tried first.
// `keep` holds letters to leave in place, for mending a grid.
function fill(shape, indexes, random, maxNodes, keep = null) {
  const list = R.entries(shape);
  const n = shape.indexOf('/');
  const letters = keep ? [...keep] : new Array(n * n).fill(null);
  const placed = list.map(e => (e.cells.every(([r, c]) => letters[r * n + c]) ? e.cells.map(([r, c]) => letters[r * n + c]).join('') : null));
  let nodes = 0;
  const candidates = s => {
    const ix = indexes[list[s].word.length];
    if (!ix) return null;
    const bits = new Uint32Array(ix.blocks).fill(0xffffffff);
    const spare = ix.blocks * 32 - ix.words.length;
    if (spare) bits[ix.blocks - 1] = 0xffffffff >>> spare;
    list[s].cells.forEach(([r, c], p) => {
      const l = letters[r * n + c];
      if (!l) return;
      const m = ix.at.get(p * 26 + l.charCodeAt(0) - 97) || ix.none;
      for (let i = 0; i < ix.blocks; i++) bits[i] &= m[i];
    });
    return bits;
  };
  const count = b => { let t = 0; for (let i = 0; i < b.length; i++) t += pop(b[i]); return t; };
  function step(left) {
    if (!left) return true;
    if (++nodes > maxNodes) return false;
    let best = -1, fewest = Infinity, bits = null;
    for (let s = 0; s < list.length; s++) {
      if (placed[s]) continue;
      const b = candidates(s);
      if (!b) return false;
      const c = count(b);
      if (c < fewest) { fewest = c; best = s; bits = b; if (!c) return false; }
    }
    const ix = indexes[list[best].word.length];
    const options = [];
    for (let i = 0; i < bits.length; i++) {
      let x = bits[i];
      while (x) { const t = x & -x; options.push(i * 32 + 31 - Math.clz32(t)); x &= x - 1; }
    }
    // Mostly in list order, with enough chance for grids to differ.
    const order = options.map(i => [i, i / ix.words.length + random() * .6]).sort((a, b) => a[1] - b[1]).slice(0, Number(arg('--wide')) || 80);
    for (const [i] of order) {
      const w = ix.words[i];
      if (placed.some(p => p && (p === w || R.related(p, w)))) continue;
      const before = list[best].cells.map(([r, c]) => letters[r * n + c]);
      list[best].cells.forEach(([r, c], p) => { letters[r * n + c] = w[p]; });
      placed[best] = w;
      if (step(left - 1)) return true;
      placed[best] = null;
      list[best].cells.forEach(([r, c], p) => { letters[r * n + c] = before[p]; });
      if (nodes > maxNodes) return false;
    }
    return false;
  }
  if (!step(placed.filter(p => !p).length)) return null;
  return shape.split('/').map((row, r) => [...row].map((ch, c) => (ch === '#' ? '#' : letters[r * n + c])).join('')).join('/');
}

// ---- levels ----
// The easier clues on a hard day go to the short words, which are the way in.
function assignLevels(grid, mix, random) {
  const list = R.entries(grid).map((e, i) => ({ i, key: e.word.length + random() })).sort((a, b) => a.key - b.key);
  const want = mix.flatMap((n, l) => Array(n).fill(l + 1));
  const levels = [];
  list.forEach((e, k) => { levels[e.i] = want[k]; });
  return levels;
}

// ---- making days ----
function makeDay(day, days, words, bank, cache) {
  const rule = R.WEEK[L.weekdayOf(day, EPOCH)];
  cache.patterns[rule.size] ||= patterns(rule.size);
  // Three-letter words run short first, so shapes with fewest of them go first.
  const threes = p => R.entries(p.shape).filter(e => e.word.length === 3).length;
  const allowed = cache.patterns[rule.size].filter(p => rule.blocks.includes(p.blocks)).sort((a, b) => threes(a) - threes(b));
  const shapes = rule.size === 5 ? allowed : allowed.filter(p => threes(p) <= threes(allowed[Math.floor(allowed.length / 3)]));
  const near = new Set();
  const sizes = new Map(words.map(w => [w.word, w.size]));
  const uses = new Map();
  const others = days.filter((d, i) => d && i + 1 !== day);
  days.forEach((d, i) => {
    if (!d || i + 1 === day) return;
    for (const e of R.entries(d.grid)) {
      uses.set(e.word, (uses.get(e.word) || 0) + 1);
      if (Math.abs(i + 1 - day) < R.REPEAT_GAP) near.add(e.word);
    }
  });
  // A fill that lands on another day's grid, often the same square turned on
  // its side, loses most of those words for the next try.
  const banned = new Set();
  const recent = days.slice(Math.max(0, day - 8), day + 7).filter(Boolean).map(d => d.grid.replace(/[a-z]/g, 'a'));
  const random = L.rng(day * 104729 + (cache.salt || 0));
  const byLength = {};
  for (const w of words) {
    if (near.has(w.word)) continue;
    (byLength[w.word.length] ||= []).push(w);
  }
  let indexes = {};
  const reindex = () => {
    indexes = {};
    for (const k in byLength) {
    // Lively words first, then read-through ones, then the rest, always leaning
    // to words the list has used least, with a shuffle so days differ. The easy
    // days get first go at the commonest words; hard days leave them be.
    const lean = rule.rare < 10 ? 1 : -.6;
      const list = byLength[k].filter(w => !banned.has(w.word)).map(w => [w.word, (lively.has(w.word) ? -.7 : good.has(w.word) ? 0 : inflected.has(w.word) ? 1.2 : 1) + lean * (w.size > 20 ? .6 : 0) + w.size / 200 + (uses.get(w.word) || 0) * .35 + random() * .7]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
      indexes[k] = new Index(list);
    }
  };
  reindex();
  const fails = { fill: 0, rare: 0, shared: 0, shapes: shapes.length, pool: Object.fromEntries(Object.entries(byLength).map(([k, v]) => [k, v.length])), near: near.size };
  const budget = Number(arg('--nodes')) || 6000;
  const total = Number(arg('--total')) || 2400000;
  for (let tries = 0; tries < total / budget; tries++) {
    const p = shapes[tries % shapes.length];
    if (recent.includes(p.shape) && tries < 3) continue;
    const grid = fill(p.shape, indexes, random, budget);
    if (!grid) { fails.fill++; continue; }
    const rare = R.entries(grid).filter(e => (sizes.get(e.word) ?? 35) > 20).length;
    if (rare > rule.rare) { fails.rare++; continue; }
    if (R.entries(grid).filter(e => inflected.has(e.word)).length > 2) { fails.inflected = (fails.inflected || 0) + 1; continue; }
    const twin = others.find(d => R.shared(grid, d.grid) > R.MAX_SHARED);
    if (twin) {
      fails.shared++;
      const theirs = new Set(R.entries(twin.grid).map(e => e.word));
      for (const e of R.entries(grid)) if (theirs.has(e.word) && random() < .7) banned.add(e.word);
      reindex();
      continue;
    }
    return { grid, levels: assignLevels(grid, rule.mix, random), rare };
  }
  throw new Error(`day ${day}: no fill found ${JSON.stringify(fails)}`);
}

// Words a grid may use: the bank, the lively list, and with --pool the everyday
// words from SCOWL in scripts/cluey/words.txt (word, then SCOWL size).
function candidates(bank) {
  const out = new Map();
  const sizes = new Map(readFileSync(new URL('words.txt', DIR), 'utf8').split('\n').filter(Boolean).map(l => l.split(' ')));
  const add = (word, size) => { if (!rejected.has(word) && !out.has(word)) out.set(word, { word, size }); };
  for (const w of lively) add(w, 20);
  for (const w of good) add(w, Number(sizes.get(w) || 35));
  if (process.argv.includes('--pool')) {
    for (const [w, s] of sizes) add(w, Number(s));
    for (const [w, s] of inflected) add(w, Number(s));
  }
  return [...out.values()];
}

function fillDays() {
  const bank = readBank();
  const days = readDays();
  const words = candidates(bank);
  const cache = { patterns: {}, salt: Number(arg('--salt')) || 0 };
  // --redo rejected: every day with a word that's since gone on the reject list.
  const named = arg('--redo') === 'rejected'
    ? days.flatMap((d, i) => (R.entries(d.grid).some(e => rejected.has(e.word)) ? [i + 1] : [])).join(',')
    : arg('--redo');
  if (named) {
    console.log(`redoing ${named.split(',').length} days`);
    for (const day of named.split(',').map(Number)) {
      const before = days[day - 1];
      days[day - 1] = null;
      try {
        days[day - 1] = makeDay(day, days, words, bank, cache);
        writeDays(days);
        console.log(`day ${day} done`);
      } catch (e) {
        days[day - 1] = before;
        console.log(e.message);
      }
    }
  }
  const more = Number(arg('--more')) || 0;
  for (let i = 0; i < more; i++) {
    days.push(null);
    days[days.length - 1] = makeDay(days.length, days, words, bank, cache);
    if (days.length % 30 === 0) console.log(`day ${days.length}`);
  }
  writeDays(days);
}

// ---- building ----
function build() {
  const bank = readBank();
  const days = readDays();
  const missing = [];
  const faults = [];
  const puzzles = days.map((d, i) => {
    const day = bank.get(i + 1) || new Map();
    const list = R.entries(d.grid);
    const clues = list.map((e, k) => {
      const c = day.get(e.word);
      if (!c) missing.push(`${i + 1} ${e.word} ${d.levels[k]}`);
      else if (c.level !== d.levels[k]) faults.push(`day ${i + 1} ${e.word}: level ${c.level}, grid says ${d.levels[k]}`);
      return c || { level: d.levels[k], tag: 'd', clue: `Clue to write, level ${d.levels[k]}` };
    });
    if (!day.size) return [d.grid, ...clues.map(c => `${c.level}${c.tag}${c.clue}`)];
    const fault = R.mixFault(list.map((e, k) => ({ word: e.word, ...clues[k] })));
    if (fault) faults.push(`day ${i + 1}: ${fault}`);
    return [d.grid, ...clues.map(c => `${c.level}${c.tag}${c.clue}`)];
  });
  const every = days.flatMap((d, i) => [...(bank.get(i + 1) || new Map()).entries()].map(([word, c]) => ({ day: i + 1, word, clue: c.clue })));
  faults.push(...R.recycled(every));
  days.forEach((d, i) => days.slice(0, i).forEach((e, j) => {
    if (R.shared(d.grid, e.grid) > R.MAX_SHARED) faults.push(`days ${j + 1} and ${i + 1} share too many answers`);
  }));
  if (faults.length) console.log(faults.join('\n'));
  if (missing.length) {
    writeFileSync(new URL('missing.txt', DIR), [...new Set(missing)].sort().join('\n') + '\n');
    console.log(`${missing.length} clues still to write: scripts/cluey/missing.txt`);
    if (!process.argv.includes('--draft')) return;
  }
  const out = `// Generated by scripts/build-cluey.mjs. Don't edit by hand: the clues live in
// scripts/cluey/, all written for this game. A puzzle's place in the list is
// its day, so new ones only ever go on the end.
//
// Each puzzle is its grid, rows joined with /, then its clues, across first,
// each led by its level (1 plain, 2 takes a moment, 3 misdirects) and its kind.
//
// Answers were chosen from SCOWL (Spell Checker Oriented Word Lists),
// http://wordlist.aspell.net
//
${readFileSync(new URL('NOTICE.txt', DIR), 'utf8').trimEnd().split('\n').map(l => ('// ' + l).trimEnd()).join('\n')}
var ClueyPuzzles = ${JSON.stringify({ epoch: EPOCH, puzzles })};
if (typeof module === 'object' && module.exports) module.exports = ClueyPuzzles;
`;
  writeFileSync(OUT, out);
  console.log(`${puzzles.length} days, ${(out.length / 1024).toFixed(1)} KB`);
}

if (arg('--more') || arg('--redo')) fillDays();
build();
