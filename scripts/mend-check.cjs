// Proves every stored puzzle again, from scratch, across the machine's cores: one
// solution among all the words, and exactly the day's fewest swaps. The tests run
// this, and it can be run by hand:
//
//   node scripts/mend-check.cjs
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { availableParallelism } = require('node:os');
const L = require('../web/mend/lib.js');
const D = require('../web/mend/days.js');
const P = require('./mend-proof.cjs');
const R = require('./mend-rules.cjs');

function checkAll() {
  const total = D.seeds.length / 3;
  const threads = Math.max(1, Math.min(availableParallelism(), 16));
  return Promise.all(Array.from({ length: threads }, (_, part) => new Promise((done, fail) => {
    const w = new Worker(__filename, { workerData: { part, threads, total } });
    w.on('message', done);
    w.on('error', fail);
  }))).then(parts => {
    const failures = parts.flat();
    return { checked: total, failures };
  });
}

if (!isMainThread) {
  const { part, threads, total } = workerData;
  const index = P.wordIndex(R.loadWords().proof);
  const failures = [];
  for (let at = part; at < total; at += threads) {
    const p = L.puzzle(at, D);
    const found = P.solutions(p.shape, p.answer, index, 2);
    if (found.length !== 1 || found[0] !== p.answer.join('')) failures.push(`${at}: ${found.length} solutions`);
    const fewest = P.fewestSwaps(p.start, p.answer);
    if (fewest !== p.shape.fewest) failures.push(`${at}: needs ${fewest} swaps`);
  }
  parentPort.postMessage(failures);
} else if (require.main === module) {
  checkAll().then(({ checked, failures }) => {
    console.log(`${checked} puzzles proven, ${failures.length} failures`);
    for (const f of failures.slice(0, 20)) console.log(f);
    process.exit(failures.length ? 1 : 0);
  });
}

module.exports = { checkAll };
