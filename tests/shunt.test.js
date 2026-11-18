const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const L = require('../web/shunt/lib.js');
const D = require('../web/shunt/days.js');
const R = require('../scripts/shunt-rules.cjs');

// A small board, gap on the right:
//   . . . . . .      the marked block (0) lies on the third row;
//   . . . . 1 .      block 1 stands in its way, three long;
//   0 0 . . 1 .      block 2 lies under block 1, three long, and has to
//   . . . . 1 .      go left before block 1 can come down.
//   . . . . . .
//   . . . 2 2 2
const small = () => L.parse('Rcaadxb 3');
const game = (puzzle, slides) => slides.reduce((g, [i, to]) => L.step(puzzle, g, i, to), L.fresh());

test('a day is read as blocks, where they start and the gap, and written back the same', () => {
  const p = small();
  assert.deepEqual(p.blocks, [{ across: true, line: 2, len: 2 }, { across: false, line: 4, len: 3 }, { across: true, line: 5, len: 3 }]);
  assert.deepEqual(p.start, [0, 1, 3]);
  assert.equal(p.exit, 1);
  assert.equal(p.par, 3);
  assert.equal(p.budget, 3 + L.SPARE);
  assert.equal(L.format(p), 'Rcaadxb 3');
  for (const text of D.days.slice(0, 60)) assert.equal(L.format(L.parse(text)), text);
  const grid = L.cells(p, p.start);
  assert.deepEqual([grid[12], grid[13], grid[10], grid[16], grid[22], grid[33], grid[35], grid[0]], [0, 0, 1, 1, 1, 2, 2, -1]);
  // Overlapping, or over the edge: not a board.
  assert.equal(L.cells(p, [3, 1, 3]), null);
  assert.equal(L.cells(p, [5, 1, 3]), null);
});

test('a block slides along its own line, as far as the way is clear and no further', () => {
  const p = small();
  // The marked block stops against block 1; block 1 against block 2 and the wall.
  assert.deepEqual(L.reach(p, p.start, 0), [0, 2]);
  assert.deepEqual(L.reach(p, p.start, 1), [0, 2]);
  assert.deepEqual(L.reach(p, p.start, 2), [0, 3]);
  // Several cells at once is one slide.
  assert.deepEqual(L.slide(p, p.start, 2, 0), [0, 1, 0]);
  assert.deepEqual(L.slide(p, p.start, 0, 2), [2, 1, 3]);
  // Through another block, off the board, nowhere, or a block that isn't there.
  assert.equal(L.slide(p, p.start, 0, 3), null);
  assert.equal(L.slide(p, p.start, 0, 4), null);
  assert.equal(L.slide(p, p.start, 1, 3), null);
  assert.equal(L.slide(p, p.start, 2, 4), null);
  assert.equal(L.slide(p, p.start, 2, -1), null);
  assert.equal(L.slide(p, p.start, 0, 0), null);
  assert.equal(L.slide(p, p.start, 0, 1.5), null);
  assert.equal(L.slide(p, p.start, 7, 1), null);
  // The board it was given isn't changed.
  assert.deepEqual(p.start, [0, 1, 3]);
});

test('only the marked block at the gap wins', () => {
  const p = small();
  assert.equal(L.goal(p), 4);
  assert.ok(!L.solved(p, p.start));
  // Other blocks hard against a wall, the marked block not: nothing.
  assert.ok(!L.solved(p, [2, 0, 3]));
  assert.ok(!L.solved(p, [0, 3, 0]));
  assert.ok(L.solved(p, [4, 3, 0]));
  // No block ever leaves the board: the furthest any can go is its last cell on the wall.
  for (const text of D.days.slice(0, 40)) {
    const q = L.parse(text);
    q.blocks.forEach((b, i) => { const [lo, hi] = L.reach(q, q.start, i); assert.ok(lo >= 0 && hi + b.len <= L.SIZE); });
  }
  // A gap on the left or the top is reached at the other end of the line.
  const left = R.turned(p, 1), up = R.turned(p, 6);
  assert.equal(left.exit, -1);
  assert.equal(L.goal(left), 0);
  assert.ok(!left.blocks[0].across || left.blocks[0].line === 2);
  assert.ok(!up.blocks[0].across);
  assert.equal(L.solve(left).length, 3);
  assert.equal(L.solve(up).length, 3);
});

test('the solver finds the fewest moves, and says when there are none', () => {
  const p = small();
  const way = L.solve(p);
  assert.equal(way.length, 3);
  assert.deepEqual(way[2], [0, 0, 4]);
  // Its moves can be played, one after another, and end at the gap.
  let state = p.start;
  for (const [i, from, to] of way) { assert.equal(state[i], from); state = L.slide(p, state, i, to); assert.ok(state); }
  assert.ok(L.solved(p, state));
  assert.deepEqual(L.solve(p, [4, 3, 0]), []);
  assert.equal(L.solve(p, [0, 3, 0]).length, 1);
  // Not looked for past a number of moves.
  assert.equal(L.solve(p, p.start, 2), null);
  assert.equal(L.solve(p, p.start, 3).length, 3);
  // Two tall blocks filling a column can never get out of the way.
  const shut = L.parse('Rca4dmd 0');
  assert.equal(L.solve(shut), null);
  // The count of every board agrees with the solver.
  const s = R.survey(p);
  assert.equal(s.most, 3);
  for (let d = 0; d <= s.most; d++) for (const board of s.boards(d)) assert.equal(L.solve(p, board).length, d);
  assert.equal(R.survey(shut).most, -1);
});

test('a slide of any length is one move, and the same block again is the same move', () => {
  const p = small();
  let g = game(p, [[2, 0]]);
  assert.deepEqual(g, { moves: [[2, 3, 0]], spent: 1, firm: 0 });
  assert.equal(L.inHand(g), 2);
  // Carried on, a cell at a time, as the arrow keys do it: still one move, and
  // the very game one long slide makes.
  assert.deepEqual(game(p, [[2, 2], [2, 1], [2, 0]]), g);
  // Out past where it ends up and back a little: one move.
  assert.deepEqual(game(p, [[2, 0], [2, 1]]), { moves: [[2, 3, 1]], spent: 1, firm: 0 });
  // Another block in between makes it a new move.
  g = game(p, [[2, 1], [1, 0], [2, 0]]);
  assert.equal(g.spent, 3);
  assert.equal(g.moves.length, 3);
  // A slide the board doesn't allow isn't a move.
  assert.equal(L.step(p, L.fresh(), 0, 4), null);
  assert.equal(L.step(p, L.fresh(), 1, 3), null);
});

test('a block slid back to where its move began was never moved, and is still in hand', () => {
  const p = small();
  // Out and back, by separate slides or key presses: nothing spent, nothing standing,
  // just as when a finger takes it out and back without letting go.
  assert.deepEqual(game(p, [[2, 1], [2, 3]]), L.fresh());
  assert.deepEqual(game(p, [[2, 2], [2, 1], [2, 0], [2, 1], [2, 2], [2, 3]]), L.fresh());
  // Its next slide is one move, the same as if it had gone straight there.
  assert.deepEqual(game(p, [[2, 1], [2, 3], [2, 0]]), game(p, [[2, 0]]));
  // After other moves too: only the move in hand comes off.
  let g = game(p, [[1, 0], [2, 1], [2, 3]]);
  assert.deepEqual(g, { moves: [[1, 1, 0]], spent: 1, firm: 0 });
  // And the block before it is in hand again, as though the other had never been touched.
  assert.equal(L.inHand(g), 1);
  assert.deepEqual(L.step(p, g, 1, 2), { moves: [[1, 1, 2]], spent: 1, firm: 0 });
  assert.deepEqual(L.step(p, g, 1, 1), L.fresh());
  // The marked block let go short of the open gap on the day's last move, then
  // slid home again: that move is back, and no more than that.
  const q = { ...small(), budget: 3 };
  g = game(q, [[2, 0], [1, 3], [0, 2]]);
  assert.equal(L.status(q, g).left, 0);
  g = L.step(q, g, 0, 0);
  assert.equal(g.spent, 2);
  assert.equal(L.status(q, g).left, 1);
  assert.ok(!L.status(q, g).done);
});

test('undo and restart put blocks back but never give a move back', () => {
  const p = small();
  const g = game(p, [[2, 0], [1, 3]]);
  const back = L.undo(g);
  assert.deepEqual(back, { moves: [[2, 3, 0]], spent: 2, firm: 1 });
  assert.deepEqual(L.status(p, back).state, [0, 1, 0]);
  const again = L.restart(g);
  assert.deepEqual(again, { moves: [], spent: 2, firm: 0 });
  assert.deepEqual(L.status(p, again).state, p.start);
  assert.equal(L.status(p, again).left, p.budget - 2);
  assert.equal(L.undo(L.fresh()), null);
  assert.equal(L.restart(L.fresh()), null);
  // The game handed in is left alone.
  assert.equal(g.moves.length, 2);
  // Undo takes a move off whole, however many slides made it.
  assert.deepEqual(L.undo(game(p, [[2, 2], [2, 1], [2, 0]])), { moves: [], spent: 1, firm: 0 });
  // What Undo lays bare is settled, not in hand: sliding it home by hand is a
  // move like any other, or every move could be walked back for nothing.
  assert.equal(L.inHand(back), -1);
  const home = L.step(p, back, 2, 3);
  assert.deepEqual(home, { moves: [[2, 3, 0], [2, 0, 3]], spent: 3, firm: 1 });
  // That new move is in hand, though, and can itself be taken back for what it cost.
  assert.deepEqual(L.step(p, home, 2, 0), back);
  // A move made after an undo and slid back leaves the game as the undo left it.
  assert.deepEqual(L.step(p, L.step(p, back, 1, 0), 1, 1), back);
});

test('the day is won on par, or over it within the limit', () => {
  const p = small();
  const won = L.status(p, game(p, [[2, 0], [1, 3], [0, 4]]));
  assert.ok(won.won && won.done && !won.lost);
  assert.equal(won.used, 3);
  assert.equal(won.over, 0);
  const slow = L.status(p, game(p, [[1, 0], [2, 0], [1, 3], [0, 2], [2, 1], [0, 4]]));
  assert.ok(slow.won);
  assert.equal(slow.over, 3);
  // Nothing moves once it's over.
  assert.equal(L.step(p, game(p, [[2, 0], [1, 3], [0, 4]]), 2, 3), null);
});

test('the limit is par and ten, and running out of it loses the day', () => {
  assert.equal(L.SPARE, 10);
  const p = { ...small(), budget: 4 };
  // Blocks 1 and 2 shuffled about until one move is left.
  let g = game(p, [[1, 0], [2, 2], [1, 1]]);
  let s = L.status(p, g);
  assert.equal(s.left, 1);
  assert.ok(!s.done);
  // The last move spent on something else: lost.
  const wasted = L.step(p, g, 2, 0);
  s = L.status(p, wasted);
  assert.ok(s.lost && s.done && !s.won);
  assert.equal(s.left, 0);
  assert.equal(L.step(p, wasted, 1, 3), null);
  // The last move can still win.
  const q = { ...small(), budget: 3 };
  s = L.status(q, game(q, [[2, 0], [1, 3], [0, 4]]));
  assert.ok(s.won && !s.lost);
  // The marked block let go short of an open gap on the last move may be slid
  // the rest of the way, and nothing else may move.
  g = game(q, [[2, 0], [1, 3], [0, 2]]);
  s = L.status(q, g);
  assert.equal(s.left, 0);
  assert.ok(!s.done);
  assert.equal(L.step(q, g, 2, 3), null);
  assert.ok(L.status(q, L.step(q, g, 0, 4)).won);
  // Taken back instead, it's lost.
  assert.ok(L.status(q, L.undo(g)).lost);
  // Short of a gap that's shut, the last move loses.
  const r = { ...small(), budget: 1 };
  assert.ok(L.status(r, game(r, [[0, 2]])).lost);
});

test('a game saved and read back stands where it was left', () => {
  const p = L.daily(3, D);
  const way = L.solve(p);
  // Part of the way, with a move taken back on the way.
  let g = L.fresh();
  for (const [i, , to] of way.slice(0, 7)) g = L.step(p, g, i, to);
  g = L.undo(g);
  const kept = L.clean(p, JSON.parse(JSON.stringify({ ...g, done: false, won: false })));
  assert.deepEqual(kept, g);
  // What was in hand is still in hand, and what wasn't isn't.
  assert.equal(L.inHand(kept), -1);
  const mid = L.clean(p, JSON.parse(JSON.stringify(L.step(p, g, way[6][0], way[6][2]))));
  assert.equal(L.inHand(mid), way[6][0]);
  assert.deepEqual(L.status(p, kept).state, L.status(p, g).state);
  assert.equal(L.status(p, kept).used, 7);
  // Finished: read back as finished.
  let all = L.fresh();
  for (const [i, , to] of way) all = L.step(p, all, i, to);
  const done = L.status(p, L.clean(p, JSON.parse(JSON.stringify(all))));
  assert.ok(done.won);
  assert.equal(done.used, p.par);
});

test('a damaged save is cleaned, and can’t win or cheat', () => {
  const p = small();
  assert.deepEqual(L.clean(p, null), L.fresh());
  assert.deepEqual(L.clean(p, { moves: 'x', spent: 'y', firm: 'z' }), L.fresh());
  // A save that doesn't say what's in hand has nothing in hand, so nothing comes off the count.
  assert.equal(L.inHand(L.clean(p, { moves: [[2, 3, 0]], spent: 1 })), -1);
  assert.equal(L.clean(p, { moves: [[2, 3, 0]], spent: 1, firm: -4 }).firm, 0);
  assert.equal(L.clean(p, { moves: [[2, 3, 0]], spent: 1, firm: 99 }).firm, 1);
  // A slide through a block, a block that isn't there, a wrong start: dropped with all after it.
  assert.deepEqual(L.clean(p, { moves: [[2, 3, 0], [0, 0, 4], [1, 1, 3]], spent: 3 }).moves, [[2, 3, 0]]);
  assert.deepEqual(L.clean(p, { moves: [[9, 0, 1]], spent: 1 }).moves, []);
  assert.deepEqual(L.clean(p, { moves: [[2, 2, 0]], spent: 1 }).moves, []);
  // Fewer spent than stand, or none: at least the moves that stand.
  assert.equal(L.clean(p, { moves: [[2, 3, 0], [1, 1, 3]], spent: 0 }).spent, 2);
  assert.equal(L.clean(p, { moves: [[2, 3, 0]] }).spent, 1);
  // More spent than a day allows: the limit.
  assert.equal(L.clean(p, { moves: [], spent: 999 }).spent, p.budget);
  // Nothing after the win.
  assert.deepEqual(L.clean(p, { moves: [[2, 3, 0], [1, 1, 3], [0, 0, 4], [2, 0, 3]], spent: 4 }).moves.length, 3);
});

test('no run of slides, undos and restarts wins under par, overspends or gets a move back it shouldn’t', () => {
  for (const day of [1, 2, 3, 6, 12, 33, 596]) {
    const p = L.daily(day, D), random = L.rng(day * 31 + 5);
    const int = n => Math.floor(random() * n);
    const way = L.solve(p);
    for (let round = 0; round < 60; round++) {
      let g = L.fresh(), keys = L.fresh();
      // Most rounds wander; some follow the best way for a while first, so wins happen.
      let lead = round % 3 === 0 ? int(way.length + 1) : 0, at = 0;
      for (let turn = 0; turn < 140; turn++) {
        const s = L.status(p, g);
        assert.ok(g.spent >= 0 && g.spent <= p.budget, 'over the limit');
        assert.ok(g.spent >= g.moves.length, 'a standing move that was never paid for');
        assert.ok(g.firm >= 0 && g.firm <= g.moves.length);
        if (s.won) assert.ok(g.spent >= p.par, `won in ${g.spent} on a par ${p.par} day`);
        assert.deepEqual(L.clean(p, JSON.parse(JSON.stringify(g))), g, 'a save changes nothing');
        if (s.done) {
          for (let i = 0; i < p.blocks.length; i++) for (let to = 0; to < L.SIZE; to++) assert.equal(L.step(p, g, i, to), null, 'a move after the end');
          break;
        }
        const roll = random();
        let next;
        if (roll < .06) next = L.undo(g);
        else if (roll < .08) next = L.restart(g);
        if (roll < .08) {
          if (!next) continue;
          assert.equal(next.spent, g.spent, 'undo or restart changed the count');
          assert.equal(L.inHand(next), -1);
          g = next; keys = next; lead = 0;
          continue;
        }
        // A slide: the best way's next, or any block anywhere it can go.
        let i, to;
        if (at < lead) [i, , to] = way[at++];
        else {
          lead = 0;
          i = int(p.blocks.length);
          const [lo, hi] = L.reach(p, s.state, i);
          to = lo + int(hi - lo + 1);
        }
        const from = s.state[i], hand = L.inHand(g);
        next = L.step(p, g, i, to);
        if (!next) {
          // Refused: nowhere to go, or nothing left and it isn't the block in hand.
          assert.ok(to === from || (s.left === 0 && hand !== i));
          continue;
        }
        if (hand === i) {
          // The move in hand going on: free, or handed back whole if it's home again.
          const home = g.moves[g.moves.length - 1][1] === to;
          assert.equal(next.spent, g.spent - (home ? 1 : 0));
          assert.equal(next.moves.length, g.moves.length - (home ? 1 : 0));
        } else {
          assert.equal(next.spent, g.spent + 1);
          assert.equal(next.moves.length, g.moves.length + 1);
        }
        // The same slide a cell at a time, as the keys make it, comes to the same game.
        let k = keys;
        for (let c = from; c !== to && k;) { c += Math.sign(to - from); k = L.status(p, k).done ? null : L.step(p, k, i, c); }
        if (k) assert.deepEqual(k, next, 'keys and a drag disagree');
        g = next; keys = next;
      }
    }
  }
});

test('results are graded by how far over par they were', () => {
  assert.deepEqual([0, 1, 3, 4, 6, 7, 10].map(L.band), [0, 1, 1, 2, 2, 3, 3]);
  assert.equal(L.BANDS.length, 4);
  assert.equal(L.scoreText(24, 22, { won: true }), '24 moves, par 22');
  assert.equal(L.scoreText(32, 22, { won: false }), 'Out of moves');
  assert.equal(L.scoreText(12, 22, { won: false, gaveUp: true }), 'Gave up');
});

test('the share text says moves and par, and nothing about the board', () => {
  assert.equal(L.shareText(4, 22, 22, { won: true }), 'Shunt 4 · 22 moves · par 22\n🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩');
  assert.equal(L.shareText(4, 25, 22, { won: true }), 'Shunt 4 · 25 moves · par 22\n🟩🟩🟩🟩🟩🟩🟩⬜⬜⬜');
  assert.equal(L.shareText(4, 32, 22, { won: true }, '⬛'), 'Shunt 4 · 32 moves · par 22\n⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛');
  assert.equal(L.shareText(4, 32, 22, { won: false }), 'Shunt 4 · Out of moves · par 22\n⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜');
  assert.equal(L.shareText(4, 9, 22, { won: false, gaveUp: true }), 'Shunt 4 · Gave up · par 22');
  assert.equal(L.cardText(22, 22, { won: true }), 'Shunt 22 · par 22 🟩');
  assert.equal(L.cardText(27, 22, { won: true }), 'Shunt 27 · par 22 🟨');
  assert.equal(L.cardText(32, 22, { won: false }), 'Shunt out of moves · par 22 🟥');
  assert.equal(L.cardText(5, 22, { won: false, gaveUp: true }), 'Shunt gave up · par 22 🟥');
});

test('blocks are described for a screen reader', () => {
  const p = small();
  assert.equal(L.describe(p, p.start, 0), 'Marked block, row 3, columns 1 to 2, slides left and right');
  assert.equal(L.describe(p, p.start, 1), 'Block, 3 long, column 5, rows 2 to 4, slides up and down');
  assert.equal(L.describe(p, [0, 1, 0], 2), 'Block, 3 long, row 6, columns 1 to 3, slides left and right');
});

test('streaks count days won in a row', () => {
  assert.equal(L.streak([1, 2, 3], 3), 3);
  assert.equal(L.streak([1, 2, 3], 4), 3);
  assert.equal(L.streak([1, 2, 3], 5), 0);
  assert.equal(L.bestStreak([1, 2, 5, 6, 7]), 3);
});

test('days count from the epoch in the player’s calendar, and the list goes round on its weekday', () => {
  // The epoch is a week before the game came out, so day 1 has been and gone
  // for everyone before the first board is played.
  assert.equal(D.epoch, '2026-11-11');
  assert.equal(L.dayNumber(new Date(2026, 10, 11, 0, 0, 1), D.epoch), 1);
  assert.equal(L.dayNumber(new Date(2026, 10, 11, 23, 59, 59), D.epoch), 1);
  assert.equal(L.dayNumber(new Date(2026, 10, 12), D.epoch), 2);
  assert.equal(L.dayNumber(new Date(2026, 10, 17), D.epoch), 7);
  assert.equal(L.dayNumber(new Date(2026, 10, 18), D.epoch), 8);
  assert.equal(L.weekdayOf(1, D.epoch), 3);   // a Wednesday
  assert.equal(L.weekdayOf(8, D.epoch), 3);
  const n = D.days.length;
  assert.equal(n, 791);
  assert.equal(n % 7, 0);
  // Its last day is 9 January 2029, as it was before the epoch moved.
  assert.equal(L.dayNumber(new Date(2029, 0, 9), D.epoch), n);
  // The hub's week of dots counts Shunt from the day it came out (index.html).
  const hub = require('node:fs').readFileSync(`${__dirname}/../web/index.html`, 'utf8');
  const since = /id: 'shunt',.* since: '(\d{4})-(\d\d)-(\d\d)'/.exec(hub);
  assert.ok(since, 'the hub says when Shunt came out');
  assert.equal(L.dayNumber(new Date(Number(since[1]), Number(since[2]) - 1, Number(since[3])), D.epoch), 8);
  assert.equal(L.daily(n + 1, D).day, 1);
  assert.equal(L.daily(0, D).day, n);
  assert.equal(L.format(L.daily(5, D)), D.days[4]);
});

test('a board turned any of eight ways is the same puzzle', () => {
  for (const text of D.days.slice(0, 12)) {
    const p = L.parse(text);
    const names = new Set();
    for (let how = 0; how < 8; how++) {
      const t = R.turned(p, how);
      assert.ok(L.cells(t, t.start));
      assert.equal(L.solve(t).length, p.par);
      assert.equal(R.shape(t), R.shape(p));
      names.add(L.format(t));
    }
    assert.equal(names.size, 8);
  }
});

test('every day can be solved, in exactly its par, which suits its weekday', () => {
  const pars = new Set();
  D.days.forEach((text, at) => {
    const p = L.parse(text), weekday = L.weekdayOf(at + 1, D.epoch);
    assert.match(text, /^[RLDU]([0-9a-z][abcd]){9,13} \d+$/, `day ${at + 1}`);
    assert.ok(L.cells(p, p.start), `day ${at + 1}`);
    assert.equal(p.blocks[0].len, 2, `day ${at + 1}`);
    const way = L.solve(p);
    assert.ok(way, `day ${at + 1} has no way out`);
    assert.equal(way.length, p.par, `day ${at + 1}`);
    const [lo, hi] = R.WEEK[weekday];
    assert.ok(p.par >= lo && p.par <= hi, `day ${at + 1}: par ${p.par} on a ${lo} to ${hi} day`);
    assert.ok(p.par >= 18, `day ${at + 1}`);
    pars.add(p.par);
  });
  // A real spread, into the thirties.
  assert.ok(pars.size >= 15, `${pars.size} different pars`);
  assert.ok(Math.max(...pars) >= 34);
});

test('no block on any day could be taken away without making it easier', () => {
  D.days.forEach((text, at) => assert.deepEqual(R.idle(L.parse(text)), [], `day ${at + 1}`));
});

test('no two days are the same board, a mirror image or a turn of one another', () => {
  const shapes = new Set(D.days.map(text => R.shape(L.parse(text))));
  assert.equal(shapes.size, D.days.length);
  // Nor the same blocks on the same lines, begun from somewhere else.
  const frames = new Set(D.days.map(text => R.frame(L.parse(text))));
  assert.equal(frames.size, D.days.length);
  // Nor the same arrangement of blocks with a different one marked.
  const layouts = new Map();
  D.days.forEach((text, at) => {
    const name = R.layout(L.parse(text));
    assert.ok(!layouts.has(name), `days ${layouts.get(name)} and ${at + 1} have their blocks in the same places`);
    layouts.set(name, at + 1);
  });
  // That name is blind to which block is marked and to how the board is turned.
  const one = L.parse('Rcaadxb 3'), other = { ...one, blocks: [one.blocks[2], one.blocks[1], { ...one.blocks[0], len: 2 }], start: [3, 1, 0] };
  assert.notEqual(R.frame(one), R.frame(other));
  assert.equal(R.layout(one), R.layout(other));
  for (let how = 0; how < 8; how++) assert.equal(R.layout(R.turned(one, how)), R.layout(one));
  // The names really do catch a mirror image.
  const p = L.parse(D.days[0]);
  assert.equal(R.shape(R.turned(p, 1)), R.shape(p));
  assert.equal(R.frame(R.turned(p, 5)), R.frame(p));
  assert.notEqual(R.shape(L.parse(D.days[1])), R.shape(p));
});

test('the days are a mix: no two much alike, gaps in every wall, boards full and open', () => {
  // Laid the same way up, no two share more than a few blocks in the same place.
  const level = p => Array.from({ length: 8 }, (_, how) => R.turned(p, how)).find(t => t.blocks[0].across && t.exit > 0 && t.blocks[0].line === 2);
  const laid = D.days.map(text => level(L.parse(text)));
  assert.ok(laid.every(Boolean));
  let most = 0;
  for (let a = 0; a < laid.length; a++) for (let b = a + 1; b < laid.length; b++) most = Math.max(most, R.shared(laid[a], laid[b]));
  assert.ok(most <= R.SHARED, `${most} blocks shared`);
  const sides = {}, counts = {};
  for (const text of D.days) {
    sides[text[0]] = (sides[text[0]] || 0) + 1;
    const n = L.parse(text).blocks.length;
    counts[n] = (counts[n] || 0) + 1;
  }
  for (const side of 'RLDU') assert.ok(sides[side] > D.days.length / 8, `${side}: ${sides[side]}`);
  assert.ok(Object.keys(counts).length >= 3, JSON.stringify(counts));
  // No week has the gap in the same wall every day.
  for (let w = 0; w < D.days.length; w += 7) assert.ok(new Set(D.days.slice(w, w + 7).map(t => t[0])).size > 1, `week ${w / 7 + 1}`);
});

test('days already dealt stay exactly as they were', () => {
  const KEPT = 791;
  const hash = crypto.createHash('sha256').update(D.days.slice(0, KEPT).join('\n')).digest('hex').slice(0, 16);
  assert.equal(hash, '9cdc2521e04761bc');
});
