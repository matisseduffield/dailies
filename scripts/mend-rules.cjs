// What makes a Mend puzzle fair for its day, shared by the builder and the tests.
// lib.js holds the levers the page needs (board, tiles in place, swaps). The two
// that only matter at build time are here: how rare the words are, and how
// misleading the opening is.
const { readFileSync } = require('node:fs');
const path = require('node:path');
const L = require('../web/mend/lib.js');
const { candidates } = require('./mend-bots.cjs');

// Sizes are SCOWL's: 10 is the most everyday, 35 still common.
function loadWords(file = path.join(__dirname, 'mend-words.txt')) {
  const tiers = {};
  let proof = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const parts = line.split(' ');
    if (parts[0] === 'answers') tiers[parts[1]] = parts.slice(2);
    if (parts[0] === 'proof') proof = parts.slice(1);
  }
  const sizeOf = new Map();
  for (const size of [35, 20, 10]) for (const w of tiers[size]) sizeOf.set(w, size);
  return { tiers, proof, sizeOf };
}

// Sunday to Saturday: how many of the puzzle's words come from outside the most
// everyday lists. Every answer is a word people know, so this only eases the
// start of the week; the weekend's difficulty comes from the board and the mix.
const RARE = [
  { most: 6, least: 3 },   // Sunday
  { most: 0, least: 0 },   // Monday
  { most: 0, least: 0 },
  { most: 1, least: 0 },
  { most: 2, least: 1 },
  { most: 3, least: 2 },
  { most: 5, least: 3 },   // Saturday
];

// Share of a day's seeds to pass over, least misleading first. Monday takes the
// plainest of what's on offer, Sunday the most misleading.
const LURING = [1, 0, 0.15, 0.4, 0.6, 0.8, 0.95];

// Sunday to Saturday: openings to look for that show a real word in the wrong
// place. A line that reads as finished is the worst trap of all, so the end of
// the week goes looking for one.
const DECOYS = [1, 0, 0, 0, 0, 1, 1];

const wordsOf = (shape, board) => shape.words.map(word => word.map(t => board[t]).join(''));

function rareCount(words, sizeOf) {
  return words.filter(w => sizeOf.get(w) === 35).length;
}

// Past forms that earned their place by being words in their own right. One to a
// board is fine; two start to read as padding. Plain plurals and past tenses are
// out of the answers altogether, and these are the only words ending in S that
// aren't one of the ordinary -SS, -US and -IS endings.
const PAST_FORMS = new Set('blown bound broke broken built burnt drunk drunken found frozen hidden molten smitten spent stolen stuck sunken wound'.split(' '));
const SINGULAR_S = new Set('atlas canvas chaos cosmos debris series'.split(' '));
const adverb = w => w.endsWith('ly');
// Words that read as filler: past forms, and the few -LY words kept.
const padding = words => words.filter(w => PAST_FORMS.has(w)).length;
const readsWell = words => padding(words) <= 1 && words.filter(adverb).length <= 2;

// How misleading an opening is. For each word: how many answer words other than
// the true one still fit everything the colours say. Those are the wrong ideas
// a player has to get past, and more of them means more swaps thrown away.
function lures(shape, start, answer, vocab) {
  const marks = L.marks(shape, start, answer);
  let total = 0;
  shape.words.forEach((_, w) => { total += candidates(shape, start, marks, w, vocab, null).length - 1; });
  return total;
}

// Words on the opening board that read as a real word but are the wrong one. A
// row that already looks finished is the worst trap of all.
function decoys(shape, start, answer, real) {
  const shown = wordsOf(shape, start), meant = wordsOf(shape, answer);
  return shown.filter((w, i) => w !== meant[i] && real.has(w)).length;
}

module.exports = { loadWords, RARE, LURING, DECOYS, PAST_FORMS, SINGULAR_S, wordsOf, rareCount, readsWell, lures, decoys };
