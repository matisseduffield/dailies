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

test('hard mode holds a guess to the clues so far', () => {
  const none = L.missedClue('crate', [], 'crane');
  assert.equal(none, null);
  // CRATE leaves C, R and A in place, and E at the end.
  assert.equal(L.missedClue('blame', ['crate'], 'crane'), 'Keep C in spot 1');
  assert.equal(L.missedClue('crane', ['crate'], 'crane'), null);
  assert.equal(L.missedClue('craze', ['crate'], 'crane'), null);
  // NACRE finds every letter elsewhere but the E: they must all come back.
  assert.equal(L.missedClue('dance', ['nacre'], 'crane'), 'Use the R you found');
  assert.equal(L.missedClue('caner', ['nacre'], 'crane'), 'Keep E in spot 5');
  assert.equal(L.missedClue('rance', ['nacre'], 'crane'), null);
  // A letter found twice has to be used twice.
  assert.equal(L.missedClue('sweat', ['geese'], 'eerie'), 'Keep E in spot 2');
  assert.equal(L.missedClue('lemon', ['llama'], 'hello'), 'Use 2 Ls');
  // Every earlier guess counts, not just the last.
  assert.equal(L.missedClue('crepe', ['noble', 'crypt'], 'crane'), 'Use the N you found');
});

test('the daily words never move', () => {
  // Rebuilding the lists must leave the answers as they were: one word out
  // shifts every day after it.
  const answers = L.split(D.answers);
  assert.equal(answers.length, 2066);
  assert.equal(answers[0], 'lager');
  assert.equal(require('node:crypto').createHash('sha256').update(D.answers).digest('hex').slice(0, 16), '0152fe62b493bd70');
});

test('rare openers are accepted, and nonsense is not', () => {
  for (const w of ['salet', 'soare', 'roate', 'reast', 'tares']) assert.ok(dict.all.has(w), w);
  for (const w of ['zzzzz', 'qwert', 'aaaaa']) assert.ok(!dict.all.has(w), w);
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
  assert.equal(L.shareText(3, ['nacre', 'crane'], 'crane'), 'Hunch 3 · 2/6');
  assert.equal(L.shareText(0, ['moldy'], 'crane'), 'Hunch practice · X/6');
  assert.equal(L.shareText(3, ['crane'], 'crane', true), 'Hunch 3 · 1/6 · Hard');
  assert.equal(L.cardText(['moldy', 'nacre', 'crane'], 'crane'), 'Hunch 3/6 ⬜⬜🟩');
  assert.equal(L.cardText(['moldy', 'nacre'], 'crane'), 'Hunch X/6 ⬜⬜');
  assert.equal(L.cardText(['moldy', 'crane'], 'crane', true), 'Hunch 2/6 · Hard ⬜🟩');
});

test('a clock set before the first day still gets a word', () => {
  assert.ok(L.daily(0, dict));
  assert.ok(L.daily(-400, dict));
});
