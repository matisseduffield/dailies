const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../web/reach/lib.js');
const D = require('../web/reach/days.js');
const { reachable, ways } = require('../scripts/reach-search.cjs');
const R = require('../scripts/reach-rules.cjs');

test('moves stay whole and above zero', () => {
  assert.deepEqual(L.apply(7, '+', 6), { value: 13 });
  assert.deepEqual(L.apply(7, '×', 6), { value: 42 });
  assert.deepEqual(L.apply(7, '-', 6), { value: 1 });
  assert.deepEqual(L.apply(12, '÷', 4), { value: 3 });
  assert.ok(L.apply(6, '-', 6).refused);
  assert.ok(L.apply(7, '÷', 2).refused);
  assert.ok(L.apply(2, '÷', 7).refused);
});

test('the two numbers can be tapped in either order', () => {
  assert.deepEqual(L.apply(6, '-', 7), { value: 1 });
  assert.deepEqual(L.apply(4, '÷', 12), { value: 3 });
  const { slots, steps } = L.replay([4, 12], [[0, '÷', 1]]);
  assert.deepEqual(slots, [null, 3]);
  assert.deepEqual(steps[0], { a: 12, op: '÷', b: 4, value: 3 });
});

test('a game follows from its moves', () => {
  const { slots, steps } = L.replay([3, 6, 7, 12, 40, 50], [[2, '+', 1], [5, '+', 1], [1, '×', 3]]);
  assert.deepEqual(slots, [3, null, null, 756, 40, null]);
  assert.deepEqual(steps.map(s => s.value), [13, 63, 756]);
  assert.deepEqual(steps[0], { a: 7, op: '+', b: 6, value: 13 });
});

test('par proof finds short ways and refuses impossible ones', () => {
  assert.ok(reachable([2, 3, 4], 2, 0));
  assert.ok(reachable([2, 3, 4], 14, 2));
  assert.ok(!reachable([2, 3, 4], 14, 1));
  assert.ok(!reachable([2, 3], 100, 1));
});

test('par leaves room to go over it', () => {
  assert.equal(L.parForDay(1, D.epoch), 4);  // Thursday 5 November 2026
  assert.equal(L.parForDay(3, D.epoch), 4);  // Saturday
  assert.equal(L.parForDay(5, D.epoch), 3);  // Monday
  assert.ok(Math.max(...L.PAR_BY_WEEKDAY) < 5, 'six numbers allow five moves');
});

test('counting ways ignores the order of the moves', () => {
  assert.equal(ways([2, 3, 4], 14, 2), 2);            // 3 x 4 + 2, (3 + 4) x 2
  // 30 + 40 and 10 + 20 in either order is one way; 70 x 30 also comes by
  // adding 10, 20 and 40 from two other starts.
  assert.equal(ways([10, 20, 30, 40], 2100, 3), 3);
});

test('the first days keep their puzzles', () => {
  assert.equal(L.daily(1, D).target, 413);
  assert.deepEqual(L.daily(1, D).numbers, [2, 7, 8, 10, 30, 80]);
  assert.equal(L.daily(2, D).target, 479);
});

test('a clock set before the first day still gets a puzzle', () => {
  assert.ok(L.daily(0, D));
  assert.ok(L.daily(-400, D));
});

test('every day deals a fair puzzle', () => {
  assert.equal(D.offsets.length, 3653);
  for (let day = 1; day <= D.offsets.length; day++) {
    const p = L.daily(day, D);
    assert.ok(p, `day ${day}`);
    assert.equal(p.numbers.length, 6);
    assert.equal(new Set(p.numbers).size, 6, `day ${day}`);
    assert.ok(p.target >= 100 && p.target <= 999, `day ${day}`);
    assert.equal(p.way.length, p.par);
    assert.equal(p.way[p.way.length - 1].value, p.target);
    assert.ok(R.peak(p) <= R.PEAK, `day ${day}: the way goes too high`);
  }
});

test('the stored way really reaches the target', () => {
  for (let day = 1; day <= D.offsets.length; day++) {
    const p = L.daily(day, D);
    const left = [...p.numbers];
    for (const s of p.way) {
      for (const n of [s.a, s.b]) {
        const at = left.indexOf(n);
        assert.ok(at >= 0, `day ${day}: ${n}`);
        left.splice(at, 1);
      }
      assert.equal(L.apply(s.a, s.op, s.b).value, s.value);
      left.push(s.value);
    }
  }
});

test('the first months meet every fairness rule', () => {
  for (let day = 1; day <= 120; day++) {
    assert.ok(R.fair(L.daily(day, D), L.weekdayOf(day, D.epoch)), `day ${day}`);
  }
});

test('the list goes round', () => {
  assert.deepEqual(L.daily(D.offsets.length + 7, D), L.daily(7, D));
});

test('streaks run up to today or yesterday', () => {
  assert.equal(L.streak([1, 2, 3], 4), 3);
  assert.equal(L.streak([1, 2, 3], 5), 0);
  assert.equal(L.bestStreak([1, 2, 5, 6, 7]), 3);
});

test('sharing hides the numbers', () => {
  const steps = [{ a: 7, op: '+', b: 6, value: 13 }, { a: 50, op: '×', b: 2, value: 100 }];
  assert.equal(L.shareText(3, steps, 2), 'Reach 3 · 2 moves, par 2\n+ ×');
  assert.equal(L.shareText(0, steps.slice(1), 1), 'Reach practice · 1 move, par 1\n×');
  assert.equal(L.shareText(3, [], 4, true), 'Reach 3 · Gave up, par 4');
  assert.equal(L.shareText(3, [{ a: 7, op: '-', b: 6, value: 1 }], 3), 'Reach 3 · 1 move, par 3\n−');
});
