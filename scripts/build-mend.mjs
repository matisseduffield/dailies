// Builds web/mend/days.js: two years of daily puzzles and some for Practice. The
// page only reads these back and never searches.
//
//   node scripts/build-mend.mjs          (about 10 minutes on 32 cores)
//
// 1. Fill: boards are filled at random from the answer words, and a fill is kept
//    only if its rarity is right for its day and a search of every word in
//    scripts/mend-words.txt finds no other way to arrange its letters.
// 2. Mix: each fill tries seeds until the opening has the right tiles in place and
//    needs exactly its day's fewest swaps, then takes the seed whose opening is
//    as misleading as the day should be.
// 3. Assign: fills go to days in order, keeping a word from coming back soon.
//
// Everything runs from fixed seeds, so rebuilding gives the same days however
// many cores do the work. Step 1 is nearly all the time: set MEND_FILLS to a file
// path to keep its fills, and steps 2 and 3 rerun in under a minute.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../web/mend/lib.js');
const P = require('./mend-proof.cjs');
const R = require('./mend-rules.cjs');

const EPOCH = '2026-11-05';
const DAYS = 728;        // 104 whole weeks, so the list goes round onto the same weekdays
const SPARES = 420;      // kept for Practice
const GAP = 90;          // days before a word can come back
const CAP = 16;          // the most days any word can get
// The most fills of one board a word can be in. Early-week boards draw on the
// everyday words only, so they have fewer to share the load.
const perBoard = name => (R.RARE[weekdayOfBoard(name)].most <= 1 ? 7 : 6);
const SEEDS = 46656;     // three base-36 characters
const TRIES = 400;       // fills tried per job
const OPENINGS = 24;     // right openings to choose among
const BATCH = 30;        // fill jobs sent out at once

const weekdayOfBoard = name => L.WEEK.findIndex(d => d.boards.includes(name));

function fillerFor(words) {
  const byLength = {}, index = {};
  for (const w of words) {
    (byLength[w.length] ??= []).push(w);
    const m = (index[w.length] ??= new Map());
    for (let i = 0; i < w.length; i++) {
      const k = i + w[i];
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(w);
    }
  }
  return (shape, random, banned) => {
    const grid = Array(shape.cells.length).fill(null);
    const used = new Set();
    const crossings = word => word.filter(t => shape.wordsOf[t].length > 1).length;
    const order = shape.words.map((_, i) => i).sort((a, b) => crossings(shape.words[b]) - crossings(shape.words[a]));
    let nodes = 0;
    function go(step) {
      if (step === order.length) return true;
      if (++nodes > 20000) return false;
      const word = shape.words[order[step]];
      let list = byLength[word.length];
      const fixed = [];
      for (let i = 0; i < word.length; i++) {
        if (!grid[word[i]]) continue;
        fixed.push(i);
        const l = index[word.length].get(i + grid[word[i]]);
        if (!l) return false;
        if (l.length < list.length) list = l;
      }
      const options = list.filter(w => fixed.every(i => w[i] === grid[word[i]]) && !used.has(w) && !banned.has(w));
      for (const w of L.shuffled(options, random).slice(0, 60)) {
        const placed = [];
        for (let i = 0; i < word.length; i++) if (!grid[word[i]]) { grid[word[i]] = w[i]; placed.push(word[i]); }
        used.add(w);
        if (go(step + 1)) return true;
        used.delete(w);
        for (const t of placed) grid[t] = null;
      }
      return false;
    }
    return go(0) ? grid : null;
  };
}

// Two forms of a word on one board give each other away.
function sameRoot(words) {
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      if (words[i].slice(0, 4) === words[j].slice(0, 4)) return true;
    }
  }
  return false;
}

// One job: try fills for a board from one seed, keep the proven ones.
function fillJob({ name, job, banned }, ctx) {
  const shape = L.SHAPES[name];
  const barred = new Set(banned);
  const rule = R.RARE[weekdayOfBoard(name)];
  const fill = rule.most === 0 ? ctx.fillCommon : ctx.fillAll;
  const random = L.rng(job * 7919 + weekdayOfBoard(name) * 104729 + name.length);
  const out = [];
  for (let n = 0; n < TRIES; n++) {
    const grid = fill(shape, random, barred);
    if (!grid) continue;
    const words = R.wordsOf(shape, grid);
    const rare = R.rareCount(words, ctx.sizeOf);
    if (rare < rule.least || rare > rule.most || sameRoot(words) || !R.readsWell(words)) continue;
    if (P.solutions(shape, grid, ctx.proof, 2).length === 1) out.push(grid.join(''));
  }
  return out;
}

// One job: the seed for one fill.
function mixJob({ name, answer }, ctx) {
  const shape = L.SHAPES[name];
  const letters = [...answer];
  const day = weekdayOfBoard(name);
  const hunt = R.DECOYS[day];
  const openings = [];
  let baited = 0;
  for (let seed = 0; seed < SEEDS; seed++) {
    if (openings.length >= OPENINGS && baited >= hunt) break;
    const start = L.mix(shape, letters, seed);
    if (start.filter((ch, i) => ch === letters[i]).length !== shape.keep) continue;
    // Enough plain openings: from here on only one with a decoy is worth proving.
    const decoys = R.decoys(shape, start, letters, ctx.real);
    if (openings.length >= OPENINGS && !decoys) continue;
    if (P.fewestSwaps(start, letters) !== shape.fewest) continue;
    // No word may open already finished.
    if (shape.words.some(word => word.every(t => start[t] === letters[t]))) continue;
    openings.push({ seed, lures: R.lures(shape, start, letters, ctx.vocab), decoys });
    if (decoys) baited++;
  }
  if (!openings.length) return { seed: -1 };
  // Days that want a decoy choose among the openings that have one.
  const pool = hunt && baited ? openings.filter(o => o.decoys) : openings;
  pool.sort((a, b) => a.lures - b.lures || a.seed - b.seed);
  return pool[Math.min(pool.length - 1, Math.floor(R.LURING[day] * pool.length))];
}

if (!isMainThread) {
  const { tiers, proof, sizeOf } = R.loadWords();
  const common = [...tiers[10], ...tiers[20]];
  const all = [...common, ...tiers[35]];
  const vocab = P.wordIndex(all);
  const ctx = {
    sizeOf, vocab,
    proof: P.wordIndex(proof),
    real: new Set(proof),
    fillCommon: fillerFor(common),
    fillAll: fillerFor(all),
  };
  parentPort.on('message', task => {
    parentPort.postMessage({ id: task.id, result: task.kind === 'fill' ? fillJob(task, ctx) : mixJob(task, ctx) });
  });
} else {
  const started = Date.now();
  const seconds = () => Math.round((Date.now() - started) / 1000);
  const threads = Math.max(1, availableParallelism() - 2);
  const workers = Array.from({ length: threads }, () => new Worker(fileURLToPath(import.meta.url)));
  const idle = [...workers];
  const queue = [];
  const waiting = new Map();
  let nextId = 0;
  const pump = () => {
    while (idle.length && queue.length) {
      const w = idle.pop();
      w.postMessage(queue.shift());
    }
  };
  for (const w of workers) {
    w.on('error', e => { console.error(e); process.exit(1); });
    w.on('message', ({ id, result }) => {
      idle.push(w);
      const done = waiting.get(id);
      waiting.delete(id);
      done(result);
      pump();
    });
  }
  const run = task => new Promise(done => {
    const id = nextId++;
    waiting.set(id, done);
    queue.push({ ...task, id });
    pump();
  });

  // Which board each place in the list wants.
  const places = Array.from({ length: DAYS + SPARES }, (_, at) => L.shapeAt(at, EPOCH).name);
  const wanted = {};
  for (const name of places) wanted[name] = (wanted[name] || 0) + 1;

  // 1. Fill. Jobs go out a batch at a time and count in job order, so how many
  // cores there are can't change which fills are kept. Spare fills let step 2
  // skip ones whose words came up too recently.
  const CACHE = process.env.MEND_FILLS;
  const fills = CACHE && existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  await Promise.all(Object.keys(wanted).filter(name => !fills[name]).map(async name => {
    const goal = Math.ceil(wanted[name] * 1.25);
    const limit = perBoard(name);
    const kept = [];
    const seen = new Set();
    // The proof favours words with awkward letters, which would otherwise turn
    // up again and again. Once a word has done its share on this board, the next
    // batch can't use it.
    const count = new Map();
    for (let job = 0; kept.length < goal; job += BATCH) {
      const banned = [...count].filter(([, n]) => n >= limit).map(([w]) => w);
      const batch = await Promise.all(Array.from({ length: BATCH }, (_, i) => run({ kind: 'fill', name, job: job + i, banned })));
      for (const list of batch) {
        for (const f of list) {
          const words = R.wordsOf(L.SHAPES[name], [...f]);
          if (seen.has(f) || words.some(w => (count.get(w) || 0) >= limit)) continue;
          seen.add(f);
          kept.push(f);
          for (const w of words) count.set(w, (count.get(w) || 0) + 1);
        }
      }
      if (job % (BATCH * 4) === 0) console.log(`  ${name} ${kept.length}/${goal}, ${seconds()} s`);
      if (job > 40000) throw new Error(`not enough fills for ${name}: ${kept.length}`);
    }
    fills[name] = kept.slice(0, goal);
    console.log(`${name}: ${goal} fills, ${seconds()} s`);
    if (CACHE) writeFileSync(CACHE, JSON.stringify(fills));
  }));

  // 2. Mix. Some fills have so many repeated letters that no opening needs the
  // day's fewest swaps; those drop out here, before any day is given one.
  const usable = {};
  await Promise.all(Object.entries(fills).map(async ([name, list]) => {
    const mixed = await Promise.all(list.map(answer => run({ kind: 'mix', name, answer })));
    usable[name] = list.map((answer, i) => ({ answer, ...mixed[i] })).filter(f => f.seed >= 0);
  }));
  console.log(`mixed, ${seconds()} s`, Object.entries(usable).map(([n, l]) => `${n} ${l.length}`).join(', '));

  // 3. Assign. Each day takes the fill whose words have been used least so far,
  // which keeps words spread out over the years.
  const lastSeen = new Map();
  const uses = new Map();
  const picks = [];
  const taken = new Set();
  for (let at = 0; at < places.length; at++) {
    const name = places[at];
    const shape = L.SHAPES[name];
    const list = usable[name];
    let chosen = -1, score = Infinity;
    list.forEach((fill, i) => {
      if (taken.has(name + i)) return;
      const words = R.wordsOf(shape, [...fill.answer]);
      // Practice is dealt at random, so spacing its puzzles means nothing.
      if (at < DAYS && !words.every(w => (uses.get(w) || 0) < CAP && (!lastSeen.has(w) || at - lastSeen.get(w) >= GAP))) return;
      const most = Math.max(...words.map(w => uses.get(w) || 0));
      if (most < score) { score = most; chosen = i; }
    });
    if (chosen < 0) throw new Error(`no fill left for place ${at} (${name})`);
    taken.add(name + chosen);
    if (at < DAYS) {
      for (const w of R.wordsOf(shape, [...list[chosen].answer])) {
        lastSeen.set(w, at);
        uses.set(w, (uses.get(w) || 0) + 1);
      }
    }
    picks.push(list[chosen]);
  }
  console.log(`assigned ${picks.length}, ${seconds()} s`);

  const out = `// Generated by scripts/build-mend.mjs. Don't edit by hand.
// days: how many daily puzzles there are; the rest are for Practice. letters: each
// puzzle's answer, tile by tile. seeds: how to mix each one, three characters each.
var MendDays = ${JSON.stringify({
    epoch: EPOCH,
    days: DAYS,
    letters: picks.map(p => p.answer).join(''),
    seeds: picks.map(p => p.seed.toString(36).padStart(3, '0')).join(''),
  })};
if (typeof module === 'object' && module.exports) module.exports = MendDays;
`;
  writeFileSync(new URL('../web/mend/days.js', import.meta.url), out);
  console.log(`${picks.length} puzzles, ${(out.length / 1024).toFixed(1)} KB, ${seconds()} s`);
  process.exit(0);
}
