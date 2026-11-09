// Run with: node --test "tests/*.test.js"
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../web/slugle/lib.js');
const D = require('../web/slugle/words.js');
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
  assert.equal(L.parForDay(1, D.epoch), 5); // a Tuesday
  assert.equal(L.parForDay(6, D.epoch), 8); // a Sunday
});

test('every daily puzzle is fair, ends on the goal and its par matches the weekday', () => {
  const starts = new Set(L.split(D.starts));
  const seen = new Map();
  const reach = new Map();
  const total = D.days.length / 8;
  assert.equal(D.goal, 'slug');
  for (let day = 1; day <= total; day++) {
    const p = L.daily(day, D, dict);
    assert.ok(starts.has(p.start), `day ${day}`);
    assert.equal(p.target, D.goal, `day ${day}`);
    assert.ok([...p.start].every((c, i) => c !== D.goal[i]), `day ${day} has a letter in place`);
    assert.equal(p.par, L.parForDay(day, D.epoch), `day ${day}`);
    // Par is a promise: this really is the fewest steps through everyday words.
    if (!reach.has(p.target)) reach.set(p.target, L.distances(p.target, dict.known));
    assert.equal(reach.get(p.target).get(p.start), p.par, `day ${day}`);
    assert.ok(!seen.has(p.start) || day - seen.get(p.start) >= 330, `day ${day} repeats ${p.start}`);
    seen.set(p.start, day);
  }
  // Past the fixed list, puzzles are still made, the same each time.
  const later = L.daily(total + 10, D, dict);
  assert.deepEqual(later, L.daily(total + 10, D, dict));
  assert.equal(later.par, L.parForDay(total + 10, D.epoch));
  assert.equal(later.target, D.goal);
});

test('practice ladders repeat for a seed', () => {
  const a = L.practice(42, D, dict);
  assert.deepEqual(a, L.practice(42, D, dict));
  assert.ok(a.par >= 6 && a.par <= 7);
  assert.equal(L.distances(a.start, dict.known).get(a.target), a.par);
  for (const [length, [lo, hi]] of Object.entries(L.LENGTHS)) {
    for (let seed = 1; seed <= 5; seed++) {
      const p = L.practice(seed, D, dict, length);
      assert.ok(p.par >= lo && p.par <= hi, `${length} ${seed}`);
      assert.equal(p.target, D.goal);
      assert.ok([...p.start].every((c, i) => c !== D.goal[i]), p.start);
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
  const ladder = ['cold', 'cord', 'card', 'ward', 'warm'];
  const text = L.shareText({ day: 3, start: 'cold', target: 'warm', par: 4 }, ladder);
  assert.equal(text, 'Slugle 3 · 4 steps · par 4\nCOLD → WARM\n⬜⬜🟩⬜\n⬜🟩⬜⬜\n🟩⬜⬜⬜\n⬜⬜⬜🟩');
  // Dark: the blank square is black. A step a hint found is yellow.
  assert.equal(L.shareText({ day: 3, start: 'cold', target: 'warm', par: 4 }, ladder, 2, [2], '⬛'), 'Slugle 3 · 4 steps · par 4 · 2 hints\nCOLD → WARM\n⬛⬛🟩⬛\n⬛🟨⬛⬛\n🟩⬛⬛⬛\n⬛⬛⬛🟩');
  assert.match(L.shareText({ start: 'cold', target: 'cord', par: 1 }, ['cold', 'cord'], 1), /^Slugle practice · 1 step · par 1 · 1 hint\nCOLD → CORD\n⬜⬜🟩⬜$/);
  // A long climb goes two steps to a line, no wider than eight squares.
  const long = ['cold', 'cord', 'card', 'ward', 'warm', 'worm', 'word', 'wood', 'good', 'gold', 'bold', 'bolt'];
  const rows = L.shareText({ start: 'cold', target: 'bolt', par: 8 }, long).split('\n').slice(2);
  assert.equal(rows.length, 6);
  assert.ok(rows.every(r => [...r.replace(/ /g, '')].length <= 8));
  assert.equal(L.cardText(4, ladder), 'Slugle 4 · par 4 🟩🟩🟩🟩');
  assert.equal(L.cardText(3, ladder, 1), 'Slugle 4 · par 3 · 1 hint 🟩🟩🟩🟨');
  assert.equal(L.cardText(4, ladder, 2, [2]), 'Slugle 4 · par 4 · 2 hints 🟩🟨🟩🟩');
});
