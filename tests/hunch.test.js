const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../web/hunch/lib.js');
const D = require('../web/hunch/words.js');
const dict = L.dictionary(D);

test('every letter is marked', () => {
  assert.deepEqual(L.marks('crane', 'crane'), Array(5).fill('hit'));
  assert.deepEqual(L.marks('moldy', 'crane'), Array(5).fill('miss'));
  assert.deepEqual(L.marks('nacre', 'crane'), ['near', 'near', 'near', 'near', 'hit']);
});

test('a repeated letter only counts as often as the word has it', () => {
  // One E in the word: the placed one takes it, so the other is a miss.
  assert.deepEqual(L.marks('geese', 'crane'), ['miss', 'miss', 'miss', 'miss', 'hit']);
  // Two Ls, both in place: the third is a miss.
  assert.deepEqual(L.marks('lolly', 'hello'), ['miss', 'near', 'hit', 'hit', 'miss']);
  assert.deepEqual(L.marks('allot', 'hello'), ['miss', 'near', 'hit', 'near', 'miss']);
});

test('the keyboard keeps the best that is known of a letter', () => {
  const known = L.letters(['nacre', 'crate'], 'crane');
  assert.equal(known.c, 'hit');
  assert.equal(known.n, 'near');
  assert.equal(known.t, 'miss');
  assert.equal(known.z, undefined);
});

test('days follow the calendar', () => {
  assert.equal(L.dayNumber(new Date(2026, 10, 4), D.epoch), 1);
  assert.equal(L.dayNumber(new Date(2027, 10, 4), D.epoch), 366);
  assert.equal(L.dayNumber(new Date(2027, 3, 5), D.epoch) - L.dayNumber(new Date(2027, 3, 3), D.epoch), 2);
});

test('answers are fair and last for years', () => {
  assert.equal(new Set(dict.answers).size, dict.answers.length);
  assert.ok(dict.answers.length >= 1000, `${dict.answers.length} answers`);
  for (const w of dict.answers) {
    assert.equal(w.length, L.LEN);
    assert.ok(dict.all.has(w));
  }
  // The same every time, and it goes round rather than running out.
  assert.equal(L.daily(1, dict), dict.answers[0]);
  assert.equal(L.daily(dict.answers.length + 1, dict), dict.answers[0]);
});

test('streaks', () => {
  assert.equal(L.streak([], 10), 0);
  assert.equal(L.streak([8, 9, 10], 10), 3);
  assert.equal(L.streak([8, 9], 10), 2);
  assert.equal(L.streak([7, 9], 10), 1);
  assert.equal(L.bestStreak([1, 2, 3, 7, 8]), 3);
});

test('share text gives nothing away', () => {
  const text = L.shareText(3, ['nacre', 'crane'], 'crane');
  assert.equal(text, 'Hunch 3 · 2/6\n▣▣▣▣■\n■■■■■');
  assert.match(L.shareText(0, ['moldy'], 'crane'), /^Hunch practice · X\/6\n□□□□□$/);
});
