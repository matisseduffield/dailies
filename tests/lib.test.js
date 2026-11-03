// Run with: node --test "tests/*.test.js"
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../web/lib.js');
const D = require('../web/words.js');
const dict = L.dictionary(D);

test('words one letter apart', () => {
  assert.ok(L.oneApart('cold', 'cord'));
  assert.ok(!L.oneApart('cold', 'cold'));
  assert.ok(!L.oneApart('cold', 'card'));
  assert.equal(L.changedAt('cold', 'cord'), 2);
  assert.deepEqual(L.neighbours('cold', new Set(['cord', 'bold', 'card', 'cold'])).sort(), ['bold', 'cord']);
});

test('shortest ladder', () => {
  const path = L.shortest('cold', 'warm', dict.known);
  assert.equal(path[0], 'cold');
  assert.equal(path.at(-1), 'warm');
  for (let i = 1; i < path.length; i++) assert.ok(L.oneApart(path[i - 1], path[i]));
  assert.equal(path.length - 1, 4);
  assert.deepEqual(L.shortest('cold', 'cold', dict.known), ['cold']);
  assert.equal(L.shortest('cold', 'qqqq', new Set(['cold'])), null);
  // A start outside the list still works: it's where the player is.
  assert.deepEqual(L.shortest('rort', 'fort', dict.known), ['rort', 'fort']);
});

test('hints step towards the target', () => {
  const next = L.nextStep('cold', 'warm', dict);
  assert.ok(L.oneApart('cold', next));
  assert.equal(L.shortest(next, 'warm', dict.known).length, 4);
  assert.equal(L.nextStep('warm', 'warm', dict), null);
});

test('days follow the calendar', () => {
  assert.equal(L.dayNumber(new Date(2026, 10, 3, 0, 1), D.epoch), 1);
  assert.equal(L.dayNumber(new Date(2026, 10, 3, 23, 59), D.epoch), 1);
  assert.equal(L.dayNumber(new Date(2026, 10, 4), D.epoch), 2);
  assert.equal(L.dayNumber(new Date(2027, 10, 3), D.epoch), 366);
  // Across a daylight-saving change
  assert.equal(L.dayNumber(new Date(2027, 3, 5), D.epoch) - L.dayNumber(new Date(2027, 3, 3), D.epoch), 2);
  assert.equal(L.parForDay(1, D.epoch), 4); // a Tuesday
  assert.equal(L.parForDay(6, D.epoch), 7); // a Sunday
});

test('every daily puzzle is fair and its par matches the weekday', () => {
  const ends = new Set(L.split(D.ends));
  const seen = new Set();
  const total = D.days.length / 8;
  for (let day = 1; day <= total; day++) {
    const p = L.daily(day, D, dict);
    assert.ok(ends.has(p.start) && ends.has(p.target), `day ${day}`);
    assert.equal(p.par, L.parForDay(day, D.epoch), `day ${day}`);
    assert.ok(!seen.has(p.start + p.target));
    seen.add(p.start + p.target);
  }
  // Past the fixed list, puzzles are still made, the same each time.
  const later = L.daily(total + 10, D, dict);
  assert.deepEqual(later, L.daily(total + 10, D, dict));
  assert.equal(later.par, L.parForDay(total + 10, D.epoch));
});

test('practice ladders repeat for a seed', () => {
  const a = L.practice(42, D, dict);
  assert.deepEqual(a, L.practice(42, D, dict));
  assert.ok(a.par >= 5 && a.par <= 6);
  assert.equal(L.shortest(a.start, a.target, dict.known).length - 1, a.par);
  for (const [length, [lo, hi]] of Object.entries(L.LENGTHS)) {
    for (let seed = 1; seed <= 5; seed++) {
      const p = L.practice(seed, D, dict, length);
      assert.ok(p.par >= lo && p.par <= hi, `${length} ${seed}`);
    }
  }
});

test('streaks', () => {
  assert.equal(L.streak([], 10), 0);
  assert.equal(L.streak([8, 9, 10], 10), 3);
  assert.equal(L.streak([8, 9], 10), 2); // today not played yet
  assert.equal(L.streak([7, 9, 10], 10), 2);
  assert.equal(L.streak([7, 8], 10), 0);
  assert.equal(L.bestStreak([]), 0);
  assert.equal(L.bestStreak([9, 3, 4, 5, 8, 10]), 3);
  assert.equal(L.bestStreak([1, 1, 2]), 2);
});

test('share text gives nothing away', () => {
  const text = L.shareText({ day: 3, start: 'cold', target: 'warm', par: 4 }, ['cold', 'cord', 'card', 'ward', 'warm']);
  assert.equal(text, 'Ladder 3 · COLD → WARM\n4 steps, par 4\n□□■□\n□■□□\n■□□□\n□□□■');
  assert.match(L.shareText({ start: 'cold', target: 'cord', par: 1 }, ['cold', 'cord'], 1), /^Ladder practice · COLD → CORD\n1 step, par 1, 1 hint\n/);
});
