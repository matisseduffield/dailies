// Measures Mend's week from the stored puzzles, with simulated players.
//
//   node scripts/mend-report.cjs [games per weekday, default 150]
//
// Prints one row a weekday: the levers, then how each player did with the
// day's real allowance. See scripts/mend-bots.cjs for who the players are.
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { availableParallelism } = require('node:os');
const L = require('../web/mend/lib.js');
const D = require('../web/mend/days.js');
const P = require('./mend-proof.cjs');
const R = require('./mend-rules.cjs');
const B = require('./mend-bots.cjs');

const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

// How readily a word comes to mind: commoner words, and more of it already green.
function spotter(sizeOf) {
  return (word, greens) => ({ 10: .7, 20: .5, 35: .3 }[sizeOf.get(word)]) * (.35 + .65 * greens);
}

function measure(at, sizeOf, vocab, run) {
  const p = L.puzzle(at, D);
  const random = L.rng(at * 31 + run);
  const go = choose => B.play(p.shape, p.start, p.answer, p.swaps, choose);
  return {
    day: L.weekdayOf(at + 1, D.epoch),
    sloppy: go(B.sloppy(p.shape, random)),
    decent: go(B.reader(p.shape, vocab, random, { crossCheck: false, spot: spotter(sizeOf), looks: 3 })),
    sharp: go(B.reader(p.shape, vocab, random, { crossCheck: true })),
  };
}

if (!isMainThread) {
  const { sizeOf } = R.loadWords();
  const vocab = P.wordIndex([...sizeOf.keys()]);
  parentPort.postMessage(workerData.jobs.map(([at, run]) => measure(at, sizeOf, vocab, run)));
} else {
  const games = Number(process.argv[2]) || 150;
  const { sizeOf, proof } = R.loadWords();
  const real = new Set(proof);
  const vocab = P.wordIndex([...sizeOf.keys()]);
  const jobs = [];
  for (const day of ORDER) {
    const places = [];
    for (let at = 0; at < D.days; at++) if (L.weekdayOf(at + 1, D.epoch) === day) places.push(at);
    const step = Math.max(1, Math.floor(places.length / games));
    for (let i = 0; i < games; i++) jobs.push([places[(i * step) % places.length], i]);
  }
  const threads = Math.max(1, Math.min(availableParallelism() - 2, 28));
  const parts = Array.from({ length: threads }, (_, i) => jobs.filter((_, j) => j % threads === i));
  Promise.all(parts.map(part => new Promise((done, fail) => {
    const w = new Worker(__filename, { workerData: { jobs: part } });
    w.on('message', done);
    w.on('error', fail);
  }))).then(results => {
    const all = results.flat();
    const rate = (list, key) => Math.round(list.filter(r => r[key] >= 0).length / list.length * 100);
    const left = (list, key) => {
      const won = list.filter(r => r[key] >= 0);
      return won.length ? (won.reduce((s, r) => s + r[key], 0) / won.length).toFixed(1) : '-';
    };
    console.log('day  tiles keep fewest swaps spare% rare/words lures decoys | sloppy% | decent% left | sharp% left');
    for (const day of ORDER) {
      const list = [];
      for (let at = 0; at < D.days; at++) if (L.weekdayOf(at + 1, D.epoch) === day) list.push(at);
      const rule = L.WEEK[day];
      const puzzles = list.filter((_, i) => i % 5 === 0).map(at => L.puzzle(at, D));
      const mean = fn => puzzles.reduce((s, p) => s + fn(p), 0) / puzzles.length;
      const rows = all.filter(r => r.day === day);
      const shape = L.SHAPES[rule.boards[0]];
      console.log([
        NAMES[day].padEnd(4),
        String(shape.cells.length).padEnd(5),
        String(rule.keep).padEnd(4),
        String(rule.fewest).padEnd(6),
        String(rule.fewest + rule.spare).padEnd(5),
        `${rule.spare} ${Math.round(rule.spare / rule.fewest * 100)}%`.padEnd(6),
        `${mean(p => R.rareCount(R.wordsOf(p.shape, p.answer), sizeOf)).toFixed(1)}/${shape.words.length}`.padEnd(10),
        mean(p => R.lures(p.shape, p.start, p.answer, vocab)).toFixed(0).padEnd(5),
        mean(p => R.decoys(p.shape, p.start, p.answer, real)).toFixed(2).padEnd(6),
        '|', String(rate(rows, 'sloppy')).padEnd(7),
        '|', String(rate(rows, 'decent')).padEnd(7), left(rows, 'decent').padEnd(4),
        '|', String(rate(rows, 'sharp')).padEnd(6), left(rows, 'sharp'),
      ].join(' '));
    }
    process.exit(0);
  });
}
