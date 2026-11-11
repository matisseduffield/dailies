const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../web/sorted/lib.js');
const D = require('../web/sorted/puzzles.js');
const puzzles = L.parse(D.text);

const sample = L.parse(`
Fruit: Mango, Peach, Plum, Kiwi
Greens: Olive, Emerald, Mint, Jade
Tools: Hammer, Spanner, Pliers, Chisel
Palindromes: Level, Kayak, Radar, Civic
`)[0];
const [fruit, greens, tools, palindromes] = sample.map(g => g.words);
const wrong = ['Mango', 'Peach', 'Olive', 'Mint'];
const close = ['Mango', 'Peach', 'Plum', 'Olive'];

test('the text reads as groups, easiest first', () => {
  assert.equal(sample.length, 4);
  assert.deepEqual(sample[1], { name: 'Greens', words: ['Olive', 'Emerald', 'Mint', 'Jade'], level: 1 });
  assert.equal(L.parse('A: 1, 2, 3, 4\n\nB: 5, 6, 7, 8\r\n').length, 2);
});

test('every puzzle is fair to deal', () => {
  const names = new Map();
  puzzles.forEach((p, i) => {
    const at = `puzzle ${i + 1}`;
    assert.equal(p.length, 4, at);
    for (const g of p) {
      assert.equal(g.words.length, 4, `${at}: ${g.name}`);
      assert.ok(g.name && g.name.length <= 34, `${at}: ${g.name}`);
      assert.ok(!names.has(g.name.toLowerCase()), `${at}: ${g.name} is also in puzzle ${names.get(g.name.toLowerCase())}`);
      names.set(g.name.toLowerCase(), i + 1);
      for (const w of g.words) {
        const parts = w.split(' ');
        assert.ok(w && parts.length <= 2 && parts.every(s => s.length <= 10), `${at}: ${w}`);
      }
    }
    const all = L.wordsOf(p).map(w => w.toLowerCase());
    assert.equal(new Set(all).size, 16, `${at} repeats a word`);
  });
});

test('a guess is right, one away or wrong', () => {
  assert.deepEqual(L.check(tools, sample), { group: 2, near: false });
  assert.deepEqual(L.check([...fruit].reverse(), sample), { group: 0, near: false });
  assert.deepEqual(L.check(close, sample), { group: -1, near: true });
  assert.deepEqual(L.check(wrong, sample), { group: -1, near: false });
});

test('the same four words in any order count as tried', () => {
  assert.ok(L.tried(['Mint', 'Olive', 'Peach', 'Mango'], [close, wrong]));
  assert.ok(!L.tried(['Mango', 'Peach', 'Plum', 'Mint'], [close, wrong]));
});

test('a game follows from its guesses', () => {
  assert.deepEqual(L.progress([], sample), { solved: [], mistakes: 0, won: false, done: false });
  const p = L.progress([palindromes, wrong, fruit], sample);
  assert.deepEqual(p, { solved: [3, 0], mistakes: 1, won: false, done: false });
  assert.ok(L.progress([fruit, greens, wrong, tools, palindromes], sample).won);
  const lost = L.progress([wrong, close, ['Mango', 'Plum', 'Olive', 'Jade'], ['Peach', 'Plum', 'Olive', 'Mint']], sample);
  assert.deepEqual(lost, { solved: [], mistakes: 4, won: false, done: true });
});

test('days follow the calendar, and the list goes round', () => {
  assert.equal(L.dayNumber(new Date(2026, 10, 5), D.epoch), 1);
  assert.equal(L.dayNumber(new Date(2026, 10, 6, 23, 59), D.epoch), 2);
  assert.equal(L.daily(1, puzzles), puzzles[0]);
  assert.equal(L.daily(puzzles.length + 1, puzzles), puzzles[0]);
});

test('a day always deals the same board, with every word on it', () => {
  assert.deepEqual(L.deal(5, sample), L.deal(5, sample));
  assert.notDeepEqual(L.deal(5, sample), L.deal(6, sample));
  assert.deepEqual([...L.deal(5, sample)].sort(), L.wordsOf(sample).sort());
});

test('streaks run up to today or yesterday', () => {
  assert.equal(L.streak([1, 2, 3], 3), 3);
  assert.equal(L.streak([1, 2, 3], 4), 3);
  assert.equal(L.streak([1, 2, 3], 5), 0);
  assert.equal(L.bestStreak([1, 2, 5, 6, 7]), 3);
});

test('sharing shows the shape of the game and no words', () => {
  const won = L.shareText(3, [close, fruit, greens, tools, palindromes], sample);
  assert.equal(won, 'Sorted 3 · 1 mistake\n🟦🟦🟦🟩\n🟦🟦🟦🟦\n🟩🟩🟩🟩\n🟨🟨🟨🟨\n🟧🟧🟧🟧');
  assert.match(L.shareText(3, [fruit, greens, tools, palindromes], sample), /^Sorted 3 · Perfect\n/);
  const lostGuesses = [fruit, wrong, close, ['Mango', 'Plum', 'Olive', 'Jade'], ['Peach', 'Plum', 'Olive', 'Mint']];
  assert.match(L.shareText(3, lostGuesses, sample), /^Sorted 3 · 1 of 4 groups\n/);
  assert.equal(L.cardText([close, fruit, greens, tools, palindromes], sample), 'Sorted 1 mistake 🟥🟦🟩🟨🟧');
  assert.equal(L.cardText(lostGuesses, sample), 'Sorted 1 of 4 groups 🟦🟥🟥🟥🟥');
});

test('a clock set before the first day still gets a puzzle', () => {
  assert.ok(L.daily(0, puzzles));
  assert.ok(L.daily(-400, puzzles));
});
