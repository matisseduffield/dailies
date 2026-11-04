const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../web/reach/lib.js');
const D = require('../web/reach/days.js');

test('moves stay whole and above zero', () => {
  assert.deepEqual(L.apply(7, '+', 6), { value: 13 });
  assert.deepEqual(L.apply(7, '×', 6), { value: 42 });
  assert.deepEqual(L.apply(7, '-', 6), { value: 1 });
  assert.deepEqual(L.apply(12, '÷', 4), { value: 3 });
  assert.ok(L.apply(6, '-', 7).refused);
  assert.ok(L.apply(6, '-', 6).refused);
  assert.ok(L.apply(7, '÷', 2).refused);
});

test('a game follows from its moves', () => {
  const { slots, steps } = L.replay([3, 6, 7, 12, 40, 50], [[2, '+', 1], [5, '+', 1], [1, '×', 3]]);
  assert.deepEqual(slots, [3, null, null, 756, 40, null]);
  assert.deepEqual(steps.map(s => s.value), [13, 63, 756]);
  assert.deepEqual(steps[0], { a: 7, op: '+', b: 6, value: 13 });
});

test('par proof finds short ways and refuses impossible ones', () => {
  assert.ok(L.reachable([2, 3, 4], 2, 0));
  assert.ok(L.reachable([2, 3, 4], 14, 2));
  assert.ok(!L.reachable([2, 3, 4], 14, 1));
  assert.ok(!L.reachable([2, 3], 100, 1));
});

test('par rises through the week', () => {
  assert.equal(L.parForDay(1, D.epoch), 4);  // Thursday 5 November 2026
  assert.equal(L.parForDay(3, D.epoch), 5);  // Saturday
  assert.equal(L.parForDay(5, D.epoch), 3);  // Monday
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
  }
});

test('the stored way really reaches the target', () => {
  for (let day = 1; day <= 400; day++) {
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

test('par can never be beaten', () => {
  for (let day = 1; day <= 60; day++) {
    const p = L.daily(day, D);
    assert.ok(!L.reachable(p.numbers, p.target, p.par - 1), `day ${day}`);
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
});
