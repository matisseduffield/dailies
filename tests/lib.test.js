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

test('distances count the steps between words', () => {
  const dist = L.distances('cold', dict.known);
  assert.equal(dist.get('cold'), 0);
  assert.equal(dist.get('warm'), 4);
  assert.equal(dist.get('qqqq'), undefined);
});

test('the ladder shown is short and uses everyday words', () => {
  const d = { known: new Set(['cold', 'cord', 'colt', 'cart', 'card', 'warm']), all: new Set(), common: new Set(['card', 'cord']) };
  // cold-cord-card and cold-colt-cart-card aren't equal; only the short one counts.
  assert.deepEqual(L.way('cold', 'card', d), ['cold', 'cord', 'card']);
  const e = { known: new Set(['aa', 'ab', 'bb', 'ba']), all: new Set(), common: new Set(['ba']) };
  assert.deepEqual(L.way('aa', 'bb', e), ['aa', 'ba', 'bb']);
  const path = L.way('cold', 'warm', dict);
  assert.equal(path.length - 1, 4);
  for (let i = 1; i < path.length; i++) assert.ok(L.oneApart(path[i - 1], path[i]));
  assert.deepEqual(L.way('cold', 'cold', dict), ['cold']);
  assert.equal(L.way('cold', 'zzzz', { known: new Set(), all: new Set(), common: new Set() }), null);
  // As short as par, for every kind of day.
  for (const day of [1, 2, 3, 4, 5, 6, 7]) {
    const p = L.daily(day, D, dict);
    assert.equal(L.way(p.start, p.target, dict).length - 1, p.par);
  }
  // A player's own rung off the common list can still reach the target.
  assert.deepEqual(L.way('rort', 'fort', dict), ['rort', 'fort']);
});

test('hints step towards the target', () => {
  const next = L.nextStep('cold', 'warm', dict);
  assert.ok(L.oneApart('cold', next));
  assert.equal(L.distances('warm', dict.known).get(next), 3);
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

test('weeks run Monday to Sunday and share a word', () => {
  assert.equal(L.weekOf(1, D.epoch), 0); // Tuesday 3 November
  assert.equal(L.weekOf(6, D.epoch), 0); // Sunday
  assert.equal(L.weekOf(7, D.epoch), 1); // Monday
  assert.equal(L.weekWord(3, D), 'fart');
  assert.equal(L.weekWord(7, D), 'burp');
  for (let day = 7; day <= 13; day++) assert.equal(L.daily(day, D, dict).target, 'burp');
});

test('every daily puzzle is fair and its par matches the weekday', () => {
  const ends = new Set(L.split(D.ends));
  const seen = new Map();
  const reach = new Map();
  const total = D.days.length / 8;
  // Played before weekly words came in, so these never change.
  assert.deepEqual(['start', 'target'].map(k => L.daily(1, D, dict)[k]), ['face', 'mold']);
  assert.deepEqual(['start', 'target'].map(k => L.daily(2, D, dict)[k]), ['slip', 'plan']);
  for (let day = 1; day <= total; day++) {
    const p = L.daily(day, D, dict);
    assert.ok(ends.has(p.start), `day ${day}`);
    if (day > 2) assert.equal(p.target, L.weekWord(day, D), `day ${day}`);
    assert.equal(p.par, L.parForDay(day, D.epoch), `day ${day}`);
    // Par is a promise: this really is the fewest steps through everyday words.
    if (!reach.has(p.target)) reach.set(p.target, L.distances(p.target, dict.known));
    assert.equal(reach.get(p.target).get(p.start), p.par, `day ${day}`);
    const key = p.start + p.target;
    assert.ok(!seen.has(key) || day - seen.get(key) > 365, `day ${day} repeats ${key}`);
    seen.set(key, day);
  }
  // Past the fixed list, puzzles are still made, the same each time.
  const later = L.daily(total + 10, D, dict);
  assert.deepEqual(later, L.daily(total + 10, D, dict));
  assert.equal(later.par, L.parForDay(total + 10, D.epoch));
  assert.equal(later.target, L.weekWord(total + 10, D));
});

test('practice ladders repeat for a seed', () => {
  const a = L.practice(42, D, dict);
  assert.deepEqual(a, L.practice(42, D, dict));
  assert.ok(a.par >= 5 && a.par <= 6);
  assert.equal(L.distances(a.start, dict.known).get(a.target), a.par);
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
  assert.equal(text, 'Slugle 3 · COLD → WARM\n4 steps, par 4\n□□■□\n□■□□\n■□□□\n□□□■');
  assert.match(L.shareText({ start: 'cold', target: 'cord', par: 1 }, ['cold', 'cord'], 1), /^Slugle practice · COLD → CORD\n1 step, par 1, 1 hint\n/);
});
