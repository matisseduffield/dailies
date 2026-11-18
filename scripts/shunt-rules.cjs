// What makes a good day of Shunt, for the build and the tests. Par is the fewest
// moves that free the marked block, counting a slide of any length as one.
const L = require('../web/shunt/lib.js');

const N = L.SIZE;
// By weekday, Sunday first: the par a day may have. The week climbs from Monday.
const WEEK = [
  [30, 40],   // Sunday
  [18, 19],   // Monday
  [20, 21],   // Tuesday
  [22, 23],   // Wednesday
  [24, 25],   // Thursday
  [26, 27],   // Friday
  [28, 29],   // Saturday
];
// How many blocks a board holds, the marked one included.
const BLOCKS = [9, 13];
// No two days may have more blocks than this on the very same cells.
const SHARED = 8;

// Every board that can be reached from a puzzle's start, and how many moves each
// is from the gap. Null past `cap` boards: a board that loose isn't worth having.
function survey(puzzle, cap = 60000) {
  const { blocks } = puzzle, target = L.goal(puzzle);
  const pow = L.powers(blocks);
  const seen = L.boards();
  seen.add(L.keyOf(puzzle.start, pow));
  const state = new Array(blocks.length), grid = new Int8Array(N * N);
  for (let q = 0; q < seen.size; q++) {
    L.around(blocks, pow, seen.key(q), state, grid, next => { seen.add(next); });
    if (seen.size > cap) return null;
  }
  // Outwards from every board with the marked block at the gap. Moves can all be
  // taken back, so the way out of a board is as long as the way in.
  const far = new Int16Array(seen.size).fill(-1);
  const queue = new Int32Array(seen.size);
  let end = 0, most = -1;
  for (let at = 0; at < seen.size; at++) if (seen.key(at) % 5 === target) { far[at] = 0; queue[end++] = at; }
  for (let q = 0; q < end; q++) {
    const at = queue[q];
    most = far[at];
    L.around(blocks, pow, seen.key(at), state, grid, next => { const to = seen.indexOf(next); if (far[to] < 0) { far[to] = far[at] + 1; queue[end++] = to; } });
  }
  const stateOf = key => blocks.map((_, i) => Math.floor(key / pow[i]) % 5);
  return {
    size: seen.size, most,
    // Every board that many moves from the gap.
    boards: d => { const out = []; for (let at = 0; at < seen.size; at++) if (far[at] === d) out.push(stateOf(seen.key(at))); return out; },
  };
}

// The puzzle with one block lifted off the board.
function without(puzzle, i) {
  return { ...puzzle, blocks: puzzle.blocks.filter((_, k) => k !== i), start: puzzle.start.filter((_, k) => k !== i) };
}
// Blocks that make no difference: the board is just as hard without them.
function idle(puzzle) {
  const out = [];
  for (let i = 1; i < puzzle.blocks.length; i++) {
    // Looked for only among ways shorter than par: none means the block isn't needed.
    if (!L.solve(without(puzzle, i), undefined, puzzle.par - 1)) out.push(i);
  }
  return out;
}

// A board turned or flipped one of the eight ways a square can be. The gap goes
// with it.
function turned(puzzle, how) {
  const move = (r, c) => {
    if (how & 4) [r, c] = [c, r];
    if (how & 2) r = N - 1 - r;
    if (how & 1) c = N - 1 - c;
    return [r, c];
  };
  const blocks = [], start = [];
  puzzle.blocks.forEach((b, i) => {
    const p = puzzle.start[i];
    const ends = [b.across ? move(b.line, p) : move(p, b.line), b.across ? move(b.line, p + b.len - 1) : move(p + b.len - 1, b.line)];
    const across = ends[0][0] === ends[1][0];
    blocks.push({ across, line: across ? ends[0][0] : ends[0][1], len: b.len });
    start.push(across ? Math.min(ends[0][1], ends[1][1]) : Math.min(ends[0][0], ends[1][0]));
  });
  // The gap: follow the cell just inside it.
  const m = puzzle.blocks[0], edge = puzzle.exit > 0 ? N - 1 : 0;
  const [r, c] = m.across ? move(m.line, edge) : move(edge, m.line);
  const exit = (blocks[0].across ? c : r) === 0 ? -1 : 1;
  return { ...puzzle, blocks, start, exit };
}
const pairsOf = puzzle => L.format(puzzle).split(' ')[0].slice(1).match(/../g);
// One name for a board and all its turns and mirror images. The marked block is
// first; the others are put in order, since which is which doesn't matter.
function shape(puzzle) {
  const name = p => { const pairs = pairsOf(p); return L.format(p)[0] + pairs[0] + pairs.slice(1).sort().join(''); };
  return Array.from({ length: 8 }, (_, how) => name(turned(puzzle, how))).sort()[0];
}
// The same, for the blocks' lines only: two days with the same blocks on the same
// lines are the same puzzle begun from a different place.
function frame(puzzle) {
  const one = b => `${b.across ? 'a' : 'd'}${b.line}${b.len}`;
  const name = p => `${p.exit}${one(p.blocks[0])}|${p.blocks.slice(1).map(one).sort().join('')}`;
  return Array.from({ length: 8 }, (_, how) => name(turned(puzzle, how))).sort()[0];
}

// One name for where every block lies, whichever of them is marked and wherever
// the gap is, through all the board's turns and mirror images. Two days with the
// same name would be one arrangement of blocks seen twice.
function layout(puzzle) {
  return Array.from({ length: 8 }, (_, how) => pairsOf(turned(puzzle, how)).sort().join('')).sort()[0];
}

// Blocks two boards have on the very same cells.
function shared(a, b) {
  const set = new Set(pairsOf(a));
  return pairsOf(b).filter(x => set.has(x)).length;
}

// What's wrong with a day, if anything.
function problems(puzzle, weekday) {
  const out = [];
  const [lo, hi] = WEEK[weekday];
  const n = puzzle.blocks.length;
  if (!L.cells(puzzle, puzzle.start)) return ['blocks overlap'];
  if (n < BLOCKS[0] || n > BLOCKS[1]) out.push(`${n} blocks`);
  const m = puzzle.blocks[0];
  if (m.len !== 2) out.push('marked block isn’t two long');
  if (puzzle.blocks.some((b, i) => i && b.across === m.across && b.line === m.line)) out.push('a block shares the marked block’s line');
  const way = L.solve(puzzle);
  if (!way) return [...out, 'no way out'];
  if (way.length !== puzzle.par) out.push(`par ${puzzle.par} but ${way.length} moves do it`);
  if (puzzle.par < lo || puzzle.par > hi) out.push(`par ${puzzle.par} on a ${lo} to ${hi} day`);
  if (idle(puzzle).length) out.push('a block makes no difference');
  return out;
}

module.exports = { WEEK, BLOCKS, SHARED, survey, without, idle, turned, shape, frame, layout, shared, problems };
