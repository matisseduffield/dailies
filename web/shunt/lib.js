// Shunt's pure logic: the board, what a slide may do, the shortest way out, a
// game's progress and the shareable result. No DOM and no app state, so the same
// file runs in the page, in scripts/build-shunt.mjs and under `node --test`.
//
// A board is six cells by six, packed with blocks two or three cells long. A block
// only slides along its own length, as far as the way is clear. Block 0 is the
// marked one, and the wall has one gap, at an end of the line it sits on. The game
// is won when the marked block reaches that gap. A slide of any length is one move.
//
// A puzzle's blocks never change line, so a board is a list of numbers: how far
// along its line each block's first cell is.
(function (root) {
  const SIZE = 6;
  // Moves to spare over par before the day is lost.
  const SPARE = 10;
  // How a block is written in days.js after its first cell (0-9a-z, row by row):
  // across or down, and its length.
  const KINDS = { a: [true, 2], b: [true, 3], c: [false, 2], d: [false, 3] };
  // The side the gap is on, written first: R and L for a marked block lying across,
  // D and U for one standing.
  const SIDES = { R: [true, 1], L: [true, -1], D: [false, 1], U: [false, -1] };

  // 'R<cell><kind>... <par>' as a puzzle: its blocks, where they start and the gap.
  function parse(text) {
    const [layout, par] = text.split(' ');
    const blocks = [], start = [];
    for (let i = 1; i < layout.length; i += 2) {
      const cell = parseInt(layout[i], 36), [across, len] = KINDS[layout[i + 1]];
      const row = Math.floor(cell / SIZE), col = cell % SIZE;
      blocks.push({ across, line: across ? row : col, len });
      start.push(across ? col : row);
    }
    const exit = SIDES[layout[0]][1];
    return { blocks, start, exit, par: Number(par), budget: Number(par) + SPARE };
  }
  function format(puzzle, state = puzzle.start) {
    const side = Object.keys(SIDES).find(s => SIDES[s][0] === puzzle.blocks[0].across && SIDES[s][1] === puzzle.exit);
    const kind = b => Object.keys(KINDS).find(k => KINDS[k][0] === b.across && KINDS[k][1] === b.len);
    return `${side}${puzzle.blocks.map((b, i) => ((b.across ? b.line * SIZE + state[i] : state[i] * SIZE + b.line).toString(36)) + kind(b)).join('')} ${puzzle.par}`;
  }

  // Which block is on each cell, row by row: -1 for none. Null if two blocks
  // overlap or one hangs over the edge, which no board that's played ever does.
  function cells(puzzle, state) {
    const grid = new Array(SIZE * SIZE).fill(-1);
    for (let i = 0; i < puzzle.blocks.length; i++) {
      const b = puzzle.blocks[i], p = state[i];
      if (!Number.isInteger(p) || p < 0 || p + b.len > SIZE) return null;
      for (let k = 0; k < b.len; k++) {
        const cell = b.across ? b.line * SIZE + p + k : (p + k) * SIZE + b.line;
        if (grid[cell] >= 0) return null;
        grid[cell] = i;
      }
    }
    return grid;
  }

  // How far block i can slide each way from where it is: [lowest, highest] place
  // for its first cell.
  function reach(puzzle, state, i, grid = cells(puzzle, state)) {
    const b = puzzle.blocks[i];
    const at = p => (b.across ? b.line * SIZE + p : p * SIZE + b.line);
    let lo = state[i], hi = state[i];
    while (lo > 0 && grid[at(lo - 1)] < 0) lo--;
    while (hi + b.len < SIZE && grid[at(hi + b.len)] < 0) hi++;
    return [lo, hi];
  }

  // Where the marked block has to get to: hard against the wall with the gap.
  const goal = puzzle => (puzzle.exit > 0 ? SIZE - puzzle.blocks[0].len : 0);
  const solved = (puzzle, state) => state[0] === goal(puzzle);

  // Block i slid to `to`: the new board, or null if something's in the way.
  function slide(puzzle, state, i, to) {
    if (!puzzle.blocks[i] || !Number.isInteger(to) || to === state[i]) return null;
    const [lo, hi] = reach(puzzle, state, i);
    if (to < lo || to > hi) return null;
    const next = [...state];
    next[i] = to;
    return next;
  }

  // Boards as numbers, kept in the order they were first met: add() says whether
  // one is new, indexOf() where it came. Each block's place is a digit in base
  // five, which fits thirteen blocks in 32 bits.
  function boards() {
    let bits = 12, mask = 4095, slots = new Int32Array(4096), keys = new Uint32Array(2048), size = 0;
    const find = key => {
      for (let h = Math.imul(key, 0x9E3779B1) >>> (32 - bits); ; h = (h + 1) & mask) {
        const s = slots[h];
        if (!s) return ~h;
        if (keys[s - 1] === key) return s - 1;
      }
    };
    const grow = () => {
      bits++; mask = (1 << bits) - 1;
      slots = new Int32Array(1 << bits);
      const old = keys;
      keys = new Uint32Array(1 << (bits - 1));
      keys.set(old);
      for (let i = 0; i < size; i++) slots[~find(keys[i])] = i + 1;
    };
    return {
      get size() { return size; },
      key: i => keys[i],
      indexOf: key => Math.max(-1, find(key)),
      add(key) {
        let at = find(key);
        if (at >= 0) return false;
        if (size === keys.length) { grow(); at = find(key); }
        keys[size++] = key;
        slots[~at] = size;
        return true;
      },
    };
  }
  // Every board one move from `key`, given to `each` with the block that moved
  // and where it went. `state` and `grid` are scratch space.
  function around(blocks, pow, key, state, grid, each) {
    const n = blocks.length;
    grid.fill(-1);
    for (let i = 0, k = key; i < n; i++) {
      const p = k % 5, b = blocks[i];
      state[i] = p;
      k = (k - p) / 5;
      for (let c = 0; c < b.len; c++) grid[b.across ? b.line * SIZE + p + c : (p + c) * SIZE + b.line] = i;
    }
    for (let i = 0; i < n; i++) {
      const b = blocks[i], p = state[i];
      for (let dir = -1; dir <= 1; dir += 2) {
        for (let to = p + dir; to >= 0 && to + b.len <= SIZE; to += dir) {
          const edge = dir < 0 ? to : to + b.len - 1;
          if (grid[b.across ? b.line * SIZE + edge : edge * SIZE + b.line] >= 0) break;
          if (each(key + (to - p) * pow[i], i, to)) return;
        }
      }
    }
  }
  const powers = blocks => blocks.map((_, i) => 5 ** i);
  const keyOf = (state, pow) => state.reduce((k, p, i) => k + p * pow[i], 0);

  // The fewest moves from a board to the gap, as [block, from, to] each, or null
  // if there's no way. Every board that can be reached is tried in order of how
  // many moves it takes, so the first way found is as short as any. `within`
  // stops the search at that many moves.
  function solve(puzzle, from = puzzle.start, within = Infinity) {
    const { blocks } = puzzle, target = goal(puzzle);
    if (from[0] === target) return [];
    const pow = powers(blocks);
    const seen = boards(), came = [-1], depth = [0];
    seen.add(keyOf(from, pow));
    const state = new Array(blocks.length), grid = new Int8Array(SIZE * SIZE);
    let found = -1;
    for (let q = 0; q < seen.size && found < 0; q++) {
      if (depth[q] >= within) break;
      around(blocks, pow, seen.key(q), state, grid, (next, i, to) => {
        if (!seen.add(next)) return false;
        came.push(q); depth.push(depth[q] + 1);
        if (i === 0 && to === target) found = seen.size - 1;
        return found >= 0;
      });
    }
    if (found < 0) return null;
    const moves = [];
    for (let at = found; came[at] >= 0; at = came[at]) {
      const key = seen.key(at), before = seen.key(came[at]);
      const i = blocks.findIndex((_, k) => Math.floor(key / pow[k]) % 5 !== Math.floor(before / pow[k]) % 5);
      moves.unshift([i, Math.floor(before / pow[i]) % 5, Math.floor(key / pow[i]) % 5]);
    }
    return moves;
  }

  // ---- a game ----
  // A game is { moves: [[block, from, to]...], spent, firm }. `moves` is what
  // stands on the board, and `spent` is the moves paid for. Undo and Restart put
  // blocks back but don't give a move back, or the limit would mean nothing.
  //
  // The block that moved last is still in hand: sliding it again is the same move
  // going on, however many times it's let go, so a finger and the arrow keys count
  // alike. Slid back to where that move began, the move was never made: it comes
  // off the count, as it would had the finger never left the block. That is the
  // one way the count goes down, and it only reaches the move in hand. A move
  // that Undo has laid bare is not in hand, so moves can't be walked back one by
  // one for nothing: `firm` is how many of the standing moves are settled so.
  const fresh = () => ({ moves: [], spent: 0, firm: 0 });

  // The board after the moves that stand.
  function boardOf(puzzle, moves) {
    const state = [...puzzle.start];
    for (const [i, , to] of moves) state[i] = to;
    return state;
  }
  // The block in hand, or -1.
  const inHand = game => (game.moves.length > (game.firm || 0) ? game.moves[game.moves.length - 1][0] : -1);

  // A slide of block i to `to`: the game after it, or null if it can't be done.
  function step(puzzle, game, i, to) {
    const s = status(puzzle, game);
    if (s.done) return null;
    if (!slide(puzzle, s.state, i, to)) return null;
    const moves = game.moves.map(m => [...m]), firm = game.firm || 0;
    if (inHand(game) === i) {
      const last = moves[moves.length - 1];
      last[2] = to;
      if (last[1] !== to) return { moves, spent: game.spent, firm };
      // Back where the move began: it never happened.
      moves.pop();
      return { moves, spent: game.spent - 1, firm };
    }
    // With nothing left only the marked block's last slide can be carried on.
    if (s.left <= 0) return null;
    moves.push([i, s.state[i], to]);
    return { moves, spent: game.spent + 1, firm };
  }
  // The last move that stands is taken off the board, in one piece, and stays
  // spent. What it lays bare is settled, not in hand.
  function undo(game) {
    return game.moves.length ? { moves: game.moves.slice(0, -1).map(m => [...m]), spent: game.spent, firm: game.moves.length - 1 } : null;
  }
  function restart(game) {
    return game.moves.length ? { moves: [], spent: game.spent, firm: 0 } : null;
  }

  // Where a game stands. The last move can still win, and if it was the marked
  // block stopping short of an open gap, it can be slid the rest of the way.
  function status(puzzle, game) {
    const state = boardOf(puzzle, game.moves);
    const won = solved(puzzle, state);
    const left = puzzle.budget - game.spent;
    let lost = !won && left <= 0;
    if (lost && inHand(game) === 0) {
      const [lo, hi] = reach(puzzle, state, 0);
      if (goal(puzzle) >= lo && goal(puzzle) <= hi) lost = false;
    }
    return { state, used: game.spent, left: Math.max(0, left), over: game.spent - puzzle.par, won, lost, done: won || lost };
  }

  // A saved game as one that can be trusted: only moves the board allows, none
  // after the end, and a count no lower than the moves that stand.
  function clean(puzzle, saved) {
    const moves = [];
    let state = [...puzzle.start];
    for (const m of saved && Array.isArray(saved.moves) ? saved.moves : []) {
      if (!Array.isArray(m) || solved(puzzle, state)) break;
      const [i, from, to] = m;
      if (!puzzle.blocks[i] || from !== state[i]) break;
      const next = slide(puzzle, state, i, to);
      if (!next) break;
      moves.push([i, from, to]);
      state = next;
    }
    const spent = saved && Number.isInteger(saved.spent) ? saved.spent : 0;
    // A save that doesn't say what's in hand has nothing in hand.
    const firm = saved && Number.isInteger(saved.firm) ? Math.min(Math.max(saved.firm, 0), moves.length) : moves.length;
    return { moves, spent: Math.min(Math.max(spent, moves.length), Math.max(puzzle.budget, moves.length)), firm };
  }

  // How a solve measures up, for the stats: on par, then by how many moves over.
  const BANDS = ['On par', '1 to 3 over', '4 to 6 over', `7 to ${SPARE} over`];
  const band = over => (over <= 0 ? 0 : over <= 3 ? 1 : over <= 6 ? 2 : 3);

  // ---- days ----
  // Days count in the player's own calendar, so a new puzzle arrives at their
  // midnight. Day 1 is the epoch.
  function dayNumber(date, epoch) {
    const [y, m, d] = epoch.split('-').map(Number);
    return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(y, m - 1, d)) / 864e5) + 1;
  }
  function weekdayOf(day, epoch) {
    const [y, m, d] = epoch.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + day - 1)).getUTCDay();
  }
  // The list goes round at its end, and it's a whole number of weeks long, so a day
  // stays on its weekday. A clock set before the epoch still gets a puzzle.
  function daily(day, data) {
    const n = data.days.length;
    const at = (((day - 1) % n) + n) % n;
    return { day: at + 1, ...parse(data.days[at]) };
  }

  // Days won in a row, up to today (or yesterday, if today isn't done yet).
  function streak(wonDays, today) {
    const won = new Set(wonDays);
    let day = won.has(today) ? today : today - 1;
    let n = 0;
    while (won.has(day)) { n++; day--; }
    return n;
  }
  function bestStreak(wonDays) {
    const days = [...new Set(wonDays)].sort((a, b) => a - b);
    let best = 0, run = 0;
    days.forEach((d, i) => { run = i && d === days[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); });
    return best;
  }

  // What a block is and where, for a screen reader.
  function describe(puzzle, state, i) {
    const b = puzzle.blocks[i], p = state[i];
    const span = `${p + 1} to ${p + b.len}`;
    const where = b.across ? `row ${b.line + 1}, columns ${span}` : `column ${b.line + 1}, rows ${span}`;
    return `${i === 0 ? 'Marked block' : `Block, ${b.len} long`}, ${where}, slides ${b.across ? 'left and right' : 'up and down'}`;
  }

  const movesText = n => (n === 1 ? '1 move' : `${n} moves`);
  // Its line on the home screen, which hasn't room for more.
  const scoreText = (used, par, { won, gaveUp }) => (won ? `${movesText(used)}, par ${par}` : gaveUp ? 'Gave up' : 'Out of moves');

  // Sharing: the moves against par, and a square for each move there was to spare:
  // green for one kept, blank for one spent. Nothing about the board.
  function shareText(day, used, par, { won, gaveUp }, blank = '⬜') {
    const head = `Shunt ${day}`;
    if (gaveUp) return `${head} · Gave up · par ${par}`;
    const kept = won ? Math.max(0, SPARE - Math.max(0, used - par)) : 0;
    return `${head} · ${won ? movesText(used) : 'Out of moves'} · par ${par}\n${'🟩'.repeat(kept)}${blank.repeat(SPARE - kept)}`;
  }

  // A line for the home screen's Share today: one square, green on par, yellow
  // for solved over it and red for not.
  function cardText(used, par, { won, gaveUp }) {
    if (!won) return gaveUp ? `Shunt gave up · par ${par} 🟥` : `Shunt out of moves · par ${par} 🟥`;
    return `Shunt ${used} · par ${par} ${used <= par ? '🟩' : '🟨'}`;
  }

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const lib = { SIZE, SPARE, KINDS, SIDES, BANDS, parse, format, cells, reach, goal, solved, slide, boards, around, powers, keyOf, solve, fresh, boardOf, inHand, step, undo, restart, status, clean, band, dayNumber, weekdayOf, daily, streak, bestStreak, describe, movesText, scoreText, shareText, cardText, rng };
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.ShuntLib = lib;
})(this);
