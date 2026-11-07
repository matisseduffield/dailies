// The hand-written lists only ever grow at the end. These pin what was already in each
// when it was extended, because a puzzle's place is its day and players have played
// them, and they check nothing has been written twice.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const hash = text => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);

const SL = require('../web/sorted/lib.js');
const sorted = SL.parse(require('../web/sorted/puzzles.js').text);
const SR = require('../scripts/sorted-rules.cjs');
const cluey = require('../web/cluey/puzzles.js');
const CR = require('../scripts/cluey-rules.cjs');
const dated = require('../web/dated/days.js');
const DR = require('../scripts/dated-rules.cjs');
const ML = require('../web/mend/lib.js');
const mend = require('../web/mend/days.js');

// How long each list was when it was last extended, and what it held.
const SORTED_KEPT = 203, CLUEY_KEPT = 210, DATED_KEPT = 364, DATED_EVENTS = 850, MEND_KEPT = 728;
// The end of 2028, counting from 5 November 2026 as day 1.
const LAST_DAY = 788;

test('days already in a list stay exactly as they were', () => {
  assert.equal(hash(JSON.stringify(sorted.slice(0, SORTED_KEPT))), '1a5f1944d21747b6');
  assert.equal(hash(JSON.stringify(cluey.puzzles.slice(0, CLUEY_KEPT))), '8011a74ce113dc05');
  assert.equal(hash(JSON.stringify([dated.years.slice(0, DATED_EVENTS), dated.texts.slice(0, DATED_EVENTS), dated.days.slice(0, DATED_KEPT)])), '697577b557fa5096');
  const boards = Array.from({ length: MEND_KEPT }, (_, at) => {
    const p = ML.puzzle(at, mend);
    return `${p.answer.join('')}:${p.start.join('')}`;
  });
  assert.equal(hash(boards.join('\n')), 'fd113617977da416');
});

test('every list reaches the end of 2028, in whole weeks', () => {
  for (const n of [sorted.length, cluey.puzzles.length, dated.days.length, mend.days]) {
    assert.ok(n >= LAST_DAY, `${n} days`);
    assert.equal(n % 7, 0);
  }
});

test('no Sorted group is written twice', () => {
  // Two old pairs share three words. They've been played, so they stay.
  const known = /puzzle (27|42)\) and .* \(puzzle (197|199)\)$/;
  assert.deepEqual(SR.repeats(sorted).filter(f => !known.test(f)), []);
  sorted.forEach((p, at) => assert.deepEqual(SR.boardFaults(p), [], `puzzle ${at + 1}`));
});

test('no two Sorted boards are the same', () => {
  const boards = sorted.map(p => SL.wordsOf(p).map(w => w.toLowerCase()).sort().join());
  assert.equal(new Set(boards).size, boards.length);
});

test('no Cluey grid comes twice, in any turn', () => {
  const grids = cluey.puzzles.map(p => p[0]);
  assert.equal(new Set(grids).size, grids.length);
  const turned = g => {
    const rows = g.split('/');
    return rows.map((_, c) => rows.map(r => r[c]).join('')).join('/');
  };
  const seen = new Set(grids);
  for (const g of grids) assert.ok(!seen.has(turned(g)), g);
});

test('no Dated event is written twice', () => {
  const bank = DR.readBank();
  assert.equal(new Set(bank.map(e => e.text.toLowerCase())).size, bank.length);
  const fresh = bank.filter(e => dated.texts.indexOf(e.text) >= DATED_EVENTS);
  assert.deepEqual(DR.repeats(bank, fresh), []);
});

test('the same event in new words is caught', () => {
  const event = (year, text) => ({ year, text, keys: [] });
  assert.ok(DR.sameEvent(event(1969, 'Neil Armstrong walks on the Moon'), event(1969, 'Neil Armstrong walks on the Moon first')));
  assert.ok(DR.sameEvent(event(2007, 'Apple launches the iPhone'), event(2007, 'Apple launches its iPhone')));
  assert.ok(!DR.sameEvent(event(2001, 'Apple launches the iPod'), event(2010, 'Apple launches the iPad')));
});

test('new Dated events keep the numbers after the old ones', () => {
  assert.ok(dated.texts.length <= 36 * 36, 'days hold a card in two characters');
  const lines = ['australia', 'books', 'brands', 'film', 'food', 'games', 'internet', 'music', 'science', 'sport', 'tech', 'tv', 'world']
    .flatMap(f => readFileSync(path.join(__dirname, '../scripts/dated', f + '.txt'), 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')));
  assert.equal(lines.length, dated.texts.length);
});
