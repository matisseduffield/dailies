// Makes Shunt's days and writes web/shunt/days.js. Every board is made here, by
// chance and search, and none is taken from anywhere else.
//   node scripts/build-shunt.mjs               the first two years and a bit (about 12 min)
//   node scripts/build-shunt.mjs --more 52     adds that many weeks at the end
//   node scripts/build-shunt.mjs --replace 596 deals one day again, for a board that has to go
//   node scripts/build-shunt.mjs --practice 315 the boards for Practice (about 5 min); days.js is left alone
// Days already in the file are never changed except by --replace, and never once
// they've been played: players share results by day number.
//
// The list as it stands was made in three goes, before anyone had played: the
// first 112 weeks, then --more 1, then --replace 596, whose first board had its
// blocks in the same places as day 279's, with another of them marked.
//
// Practice has boards of its own, in web/shunt/practice.js, so it gives no day away:
// as many for each weekday's par as for any other, made the same way and held to the
// same rules, and none like a day's or like another of its own. They have no numbers
// and no one shares them by place, so the whole file may be dealt again.
//
// A board starts as blocks dropped at random. Then one block at a time is swapped,
// added, taken away, lengthened, shifted or turned, keeping a change when the hardest
// place the blocks can be slid into is no nearer the gap than before. Once that place is far enough
// from the gap for the day wanted, a place that many moves away becomes the day's
// start, less any block that makes no difference there (scripts/shunt-rules.cjs).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../web/shunt/lib.js');
const R = require('./shunt-rules.cjs');

// A week before the game came out, so no one anywhere is ever on day 0 or before
// it, whatever their time zone or their phone's clock.
const EPOCH = '2026-11-11';
const WEEKS = 112;   // in whole weeks, so a day keeps its weekday when the list goes round
const FILE = new URL('../web/shunt/days.js', import.meta.url);
const PRACTICE = new URL('../web/shunt/practice.js', import.meta.url);
const N = L.SIZE;

const more = process.argv.indexOf('--more'), again = process.argv.indexOf('--replace'), spare = process.argv.indexOf('--practice');
const kept = fs.existsSync(FILE) ? require('../web/shunt/days.js').days : [];
// How many boards to make for Practice, or 0 when it's days being made.
const pool = spare < 0 ? 0 : Number(process.argv[spare + 1]);
if (spare >= 0 && (!Number.isInteger(pool) || pool < 7 || pool % 7)) throw new Error('--practice needs a number of boards, in sevens: each weekday gets as many');
if (pool && (more >= 0 || again >= 0)) throw new Error('--practice goes by itself');
if (pool && !kept.length) throw new Error('the days come first: practice boards are kept unlike them');
if (kept.length && more < 0 && again < 0 && !pool) {
  console.log(`${kept.length} days are already there. Add to them with --more <weeks>.`);
  process.exit(0);
}
const weeks = pool ? pool / 7 : more < 0 ? WEEKS : Number(process.argv[more + 1]);
if (again < 0 && !pool && (!Number.isInteger(weeks) || weeks < 1)) throw new Error('--more needs a number of weeks');
if (kept.length % 7) throw new Error('the list has to be whole weeks long');
// The one day to deal again, or 0.
const redo = again < 0 ? 0 : Number(process.argv[again + 1]);
if (again >= 0 && (!Number.isInteger(redo) || redo < 1 || redo > kept.length)) throw new Error('--replace needs a day that is in the list');

// The same list so far always gives the same days next.
const random = L.rng(20261118 + kept.length + redo * 7919 + (pool ? 104729 : 0));
const int = n => Math.floor(random() * n);
const pick = list => list[int(list.length)];
const shuffled = list => { const out = [...list]; for (let i = out.length - 1; i > 0; i--) { const j = int(i + 1); [out[i], out[j]] = [out[j], out[i]]; } return out; };

// ---- boards ----
// While it's being made a board lies one way: marked block across the third row,
// gap on the right.
const ROW = 2;
// Whether a block would fit there, counting block `but`'s own cells as empty.
const free = (grid, across, line, p, len, but = -2) => {
  if (line < 0 || line >= N || p < 0 || p + len > N) return false;
  for (let k = 0; k < len; k++) {
    const on = grid[across ? line * N + p + k : (p + k) * N + line];
    if (on >= 0 && on !== but) return false;
  }
  return true;
};
// A block somewhere there's room, or nothing. Nothing else lies along the marked
// block's row: it could never be got past.
function drop(board) {
  const grid = L.cells(board, board.start);
  for (let tries = 0; tries < 30; tries++) {
    const across = random() < .5, len = random() < .32 ? 3 : 2, line = int(N), p = int(N + 1 - len);
    if (across && line === ROW) continue;
    if (!free(grid, across, line, p, len)) continue;
    return { ...board, blocks: [...board.blocks, { across, line, len }], start: [...board.start, p] };
  }
  return null;
}
function deal(most) {
  let board = { blocks: [{ across: true, line: ROW, len: 2 }], start: [int(3)], exit: 1 };
  const want = R.BLOCKS[0] + int(most - R.BLOCKS[0] + 1);
  for (let tries = 0; tries < 40 && board.blocks.length < want; tries++) board = drop(board) || board;
  return board;
}
// A block swapped for another, added or taken away. The board never holds more
// than `most` blocks.
function swap(board, most) {
  const n = board.blocks.length, roll = random();
  if (roll < .15 && n < most) return drop(board);
  const lifted = R.without(board, 1 + int(n - 1));
  if (roll > .88 && n > R.BLOCKS[0]) return lifted;
  return drop(lifted);
}
// A smaller change, to one block where it lies: a cell longer or shorter, over to
// the line beside its own, or turned about its first cell.
function nudge(board) {
  const i = 1 + int(board.blocks.length - 1), b = board.blocks[i], roll = random();
  const next = { ...b };
  let at = board.start[i];
  if (roll < .36) {
    next.len = 5 - b.len;
    if (next.len === 3 && random() < .5) at--;
  } else if (roll < .73) next.line += random() < .5 ? -1 : 1;
  else { next.across = !b.across; next.line = at; at = b.line; }
  if (next.across && next.line === ROW) return null;
  if (!free(L.cells(board, board.start), next.across, next.line, at, next.len, i)) return null;
  return { ...board, blocks: board.blocks.map((x, k) => (k === i ? next : x)), start: board.start.map((x, k) => (k === i ? at : x)) };
}
// One change to a board, small or not, or nothing if it didn't fit.
const change = (board, most) => (random() < .45 ? swap(board, most) : nudge(board));
// A board whose blocks can be slid into more places than this is too loose to be
// hard, and slow to look through.
const LOOSE = 20000;
// A climb is given up after this many changes in a row that got it nowhere.
const PATIENCE = 200;

// ---- the search ----
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// How many boards each weekday still wants: weeks of them, or the one to deal again.
const need = redo ? WEEKDAYS.map((_, d) => (d === L.weekdayOf(redo, EPOCH) ? 1 : 0)) : Array(7).fill(weeks);
const found = WEEKDAYS.map(() => []);
// What's been used: by the lines its blocks are on, however it's turned, so no day
// is another's mirror image or the same blocks begun elsewhere; by where its
// blocks lie, whichever is marked, so no arrangement comes twice; and every board
// as it lay when made, to keep any two from sharing too many blocks.
const frames = new Set(), layouts = new Set(), made = [];
const level = p => Array.from({ length: 8 }, (_, how) => R.turned(p, how)).find(t => t.blocks[0].across && t.exit > 0 && t.blocks[0].line === ROW);
kept.forEach((text, at) => {
  // The day being dealt again is as good as gone.
  if (at + 1 === redo) return;
  const p = level(L.parse(text));
  frames.add(R.frame(p));
  layouts.add(R.layout(p));
  made.push(p);
});

// A start for the weekday out of everything this board's blocks can reach: a
// place the right number of moves from the gap. Blocks that make no difference
// there are lifted off one at a time, which leaves par as it was, until every
// block that's left matters.
function take(board, survey, weekday) {
  const [lo, hi] = R.WEEK[weekday];
  if (survey.most < lo) return null;
  // As hard as the day allows: Sunday's has no need to stop at 30.
  for (let par = Math.min(hi, survey.most); par >= lo; par--) {
    for (const start of shuffled(survey.boards(par)).slice(0, 3)) {
      let puzzle = { ...board, start, par, budget: par + L.SPARE };
      for (let idle = R.idle(puzzle); idle.length; idle = R.idle(puzzle)) puzzle = R.without(puzzle, pick(idle));
      if (puzzle.blocks.length < R.BLOCKS[0] || frames.has(R.frame(puzzle)) || layouts.has(R.layout(puzzle))) continue;
      if (made.some(m => R.shared(m, puzzle) > R.SHARED)) continue;
      return puzzle;
    }
  }
  return null;
}

const began = Date.now();
let climbs = 0, looked = 0;
while (need.some(n => n > 0)) {
  // The weekday furthest behind gets the next board.
  const weekday = need.indexOf(Math.max(...need));
  const [lo, hi] = R.WEEK[weekday];
  // Sunday's par is open at the top: aim somewhere in its range, for a spread.
  const aim = hi - lo > 2 ? lo + int(7) : lo;
  climbs++;
  // Some boards are kept more open than others, so the days don't all look as full.
  const most = pick([10, 11, 11, 12, 12, 13, 13]);
  let board = deal(most), best = R.survey(board, LOOSE);
  looked++;
  if (!best || best.most < 4) continue;
  board = { ...board, start: best.boards(best.most)[0] };
  for (let stale = 0; stale < PATIENCE && best.most < aim;) {
    const next = change(board, most);
    if (!next) { stale++; continue; }
    const s = R.survey(next, LOOSE);
    looked++;
    if (!s || s.most < best.most) { stale++; continue; }
    if (s.most > best.most) stale = 0; else stale++;
    best = s;
    // Carry on from the hardest place, so the next change is to a board that's hard now.
    board = { ...next, start: s.boards(s.most)[0] };
  }
  // The day it was made for, or failing that any still wanted that it's hard enough for.
  const order = [weekday, ...need.map((_, d) => d).filter(d => d !== weekday && need[d] > 0).sort((a, b) => R.WEEK[b][0] - R.WEEK[a][0])];
  for (const d of order) {
    const puzzle = take(board, best, d);
    if (!puzzle) continue;
    frames.add(R.frame(puzzle));
    layouts.add(R.layout(puzzle));
    made.push(puzzle);
    found[d].push(puzzle);
    need[d]--;
    const total = found.reduce((n, f) => n + f.length, 0);
    if (total % 25 === 0) console.log(`${total} of ${redo ? 1 : weeks * 7} · ${Math.round((Date.now() - began) / 1000)} s · ${climbs} boards begun, ${looked} looked at · still wanted ${need.join(' ')}`);
    break;
  }
}

// ---- the days ----
// Each is turned one of the eight ways at random, so the gap moves from wall to
// wall, and gets the weekday it was made for.
if (pool) {
  // Easiest first, Monday's to Sunday's: the page takes them in any order it likes.
  const boards = [];
  for (const weekday of [1, 2, 3, 4, 5, 6, 0]) {
    for (const made of found[weekday]) {
      const puzzle = R.turned(made, int(8));
      const faults = R.problems(puzzle, weekday);
      if (faults.length) throw new Error(`practice board ${boards.length + 1}: ${faults.join(', ')}`);
      boards.push(L.format(puzzle));
    }
  }
  fs.writeFileSync(PRACTICE, `// Written by scripts/build-shunt.mjs --practice. Don't edit by hand.
// The boards Practice plays, written as the days are in days.js and easiest first.
// None is a day's board, nor like one.
(function (root) {
  const data = {
    boards: ${JSON.stringify(boards)},
  };
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.ShuntPractice = data;
})(this);
`);
  const spread = {};
  for (const b of boards) { const par = L.parse(b).par; spread[par] = (spread[par] || 0) + 1; }
  console.log(`${boards.length} practice boards in ${Math.round((Date.now() - began) / 1000)} s`);
  console.log('par:', Object.entries(spread).map(([k, v]) => `${k}×${v}`).join(' '));
  process.exit(0);
}

const days = [...kept];
if (redo) {
  const weekday = L.weekdayOf(redo, EPOCH);
  const puzzle = R.turned(found[weekday][0], int(8));
  const faults = R.problems(puzzle, weekday);
  if (faults.length) throw new Error(`day ${redo}: ${faults.join(', ')}`);
  console.log(`day ${redo}: ${kept[redo - 1]} becomes ${L.format(puzzle)}`);
  days[redo - 1] = L.format(puzzle);
}
for (let week = 0; week < (redo ? 0 : weeks); week++) {
  for (let i = 0; i < 7; i++) {
    const weekday = L.weekdayOf(days.length + 1, EPOCH);
    const puzzle = R.turned(found[weekday][week], int(8));
    const faults = R.problems(puzzle, weekday);
    if (faults.length) throw new Error(`day ${days.length + 1}: ${faults.join(', ')}`);
    days.push(L.format(puzzle));
  }
}

const text = `// Written by scripts/build-shunt.mjs. Don't edit by hand.
// Each day: the wall the gap is in (R, L, D or U), then every block as its first
// cell (0-9a-z, row by row) and its kind (a, b across, two and three long; c, d
// down), the marked block first, then par.
(function (root) {
  const data = {
    epoch: ${JSON.stringify(EPOCH)},
    days: ${JSON.stringify(days)},
  };
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.ShuntDays = data;
})(this);
`;
fs.writeFileSync(FILE, text);

const pars = {}, counts = {}, sides = {};
for (const d of days) {
  const p = L.parse(d);
  pars[p.par] = (pars[p.par] || 0) + 1;
  counts[p.blocks.length] = (counts[p.blocks.length] || 0) + 1;
  sides[d[0]] = (sides[d[0]] || 0) + 1;
}
console.log(`${days.length} days in ${Math.round((Date.now() - began) / 1000)} s`);
console.log('par:', Object.entries(pars).map(([k, v]) => `${k}×${v}`).join(' '));
console.log('blocks:', Object.entries(counts).map(([k, v]) => `${k}×${v}`).join(' '), '| gap:', Object.entries(sides).map(([k, v]) => `${k}×${v}`).join(' '));
