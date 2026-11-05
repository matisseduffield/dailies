const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../web/dated/lib.js');
const D = require('../web/dated/days.js');
const R = require('../scripts/dated-rules.cjs');

const bank = R.readBank();
const byText = new Map(bank.map(e => [e.text, e]));
const eventsOf = cards => cards.map(c => byText.get(c.text));
const allDays = D.days.map((_, at) => L.daily(at + 1, D).cards);
const PINNED = ["7lmvgi1wekfe6e4th9","dy7bn9lega6aj3k96pfa","493ai9lc5388fh"];   // days 1, 2 and 5
const cards = years => years.map((year, id) => ({ id, year, text: `Event ${year}` }));

test('a right card goes in, and a wrong one lands in its true place', () => {
  const game = cards([1950, 1900, 2000, 1975]);
  let s = L.replay(game, []);
  assert.equal(s.next.year, 1900);
  assert.equal(s.lives, 3);
  s = L.replay(game, [0]);
  assert.deepEqual(s.line.map(c => c.year), [1900, 1950]);
  assert.equal(s.placed, 1);
  s = L.replay(game, [0, 0]);   // 2000 put first: wrong
  assert.deepEqual(s.line.map(c => [c.year, c.mark]), [[1900, 'right'], [1950, 'start'], [2000, 'wrong']]);
  assert.equal(s.lives, 2);
  assert.equal(s.placed, 1);
  assert.equal(s.next.year, 1975);
});

test('only one slot is right, and the timeline stays in order', () => {
  const line = cards([1900, 1950, 2000]);
  assert.equal(L.rightSlot(line, 1800), 0);
  assert.equal(L.rightSlot(line, 1925), 1);
  assert.equal(L.rightSlot(line, 1975), 2);
  assert.equal(L.rightSlot(line, 2020), 3);
});

test('a game ends when every card is placed or the lives run out', () => {
  const game = cards([1950, 1900, 2000, 1975, 1925, 1990]);
  const won = L.replay(game, [0, 2, 2, 1, 4]);
  assert.ok(won.over && won.won);
  assert.equal(won.placed, 5);
  assert.equal(won.lives, 3);
  const lost = L.replay(game, [1, 0, 0]);
  assert.ok(lost.over && !lost.won);
  assert.equal(lost.lives, 0);
  assert.equal(lost.next, null);
  // Lives gone on the very last card still counts as a loss.
  const late = L.replay(cards([1950, 1900, 2000, 1975]), [1, 0, 0]);
  assert.ok(late.over && !late.won);
});

test('after a game every card is on the line with its year, in order', () => {
  const game = cards([1950, 1900, 2000, 1975, 1925]);
  const line = L.finalLine(game, [1, 0, 0]);
  assert.deepEqual(line.map(c => c.year), [1900, 1925, 1950, 1975, 2000]);
  assert.equal(line.find(c => c.year === 1925).mark, 'unseen');
});

test('damaged moves are cut off, not trusted', () => {
  const game = cards([1950, 1900, 2000, 1975]);
  assert.deepEqual(L.cleanMoves(game, 'nonsense'), []);
  assert.deepEqual(L.cleanMoves(game, [0, 99, 1]), [0]);
  assert.deepEqual(L.cleanMoves(game, [0, -1]), [0]);
  assert.deepEqual(L.cleanMoves(game, [0, 2.5]), [0]);
  assert.deepEqual(L.cleanMoves(game, [0, 2, 2, 0, 0, 0]), [0, 2, 2]);
  assert.deepEqual(L.cleanMoves(cards([1950, 1900, 2000, 1975, 1925, 1990]), [1, 0, 0, 0, 0]), [1, 0, 0]);
});

test('streaks count days finished in a row', () => {
  assert.equal(L.streak([1, 2, 3], 3), 3);
  assert.equal(L.streak([1, 2, 3], 4), 3);
  assert.equal(L.streak([1, 2, 3], 5), 0);
  assert.equal(L.bestStreak([1, 2, 5, 6, 7, 9]), 3);
});

test('sharing gives nothing away', () => {
  const game = allDays[0];
  const moves = [];
  for (;;) {
    const s = L.replay(game, moves);
    if (s.over) break;
    moves.push(L.rightSlot(s.line, s.next.year));
  }
  const text = L.shareText(1, L.replay(game, moves));
  assert.match(text, /^Dated 1 · \d+ of \d+ placed, 3 lives left\n■+$/);
  assert.ok(!/\b(1[5-9]|20)\d\d\b/.test(text));
  assert.match(L.shareText(0, L.replay(cards([1950, 1900, 2000, 1975]), [1, 0, 0])), /^Dated practice · 0 of 3 placed, Out of lives\n□□□$/);
});

test('the first days keep their cards', () => {
  assert.equal(L.weekdayOf(1, D.epoch), 4);   // Thursday 5 November 2026
  assert.equal(L.weekdayOf(5, D.epoch), 1);
  assert.equal(D.days[0], PINNED[0]);
  assert.equal(D.days[1], PINNED[1]);
  assert.equal(D.days[4], PINNED[2]);
});

test('a clock set before the first day still gets a game', () => {
  const day = L.dayNumber(new Date(2020, 0, 1), D.epoch);
  assert.ok(day < 0);
  assert.ok(L.daily(day, D).cards.length >= 7);
  assert.ok(L.daily(0, D).cards.length >= 7);
  assert.deepEqual(L.daily(0, D), L.daily(D.days.length, D));
  assert.deepEqual(L.daily(D.days.length + 1, D), L.daily(1, D));
});

test('days count in the player\'s calendar', () => {
  assert.equal(L.dayNumber(new Date(2026, 10, 5, 0, 1), D.epoch), 1);
  assert.equal(L.dayNumber(new Date(2026, 10, 5, 23, 59), D.epoch), 1);
  assert.equal(L.dayNumber(new Date(2026, 10, 6), D.epoch), 2);
});

test('there are whole weeks of days, so each stays on its weekday', () => {
  assert.equal(D.days.length, R.DAYS);
  assert.equal(R.DAYS % 7, 0);
});

test('every stored day meets its weekday\'s rule', () => {
  allDays.forEach((day, at) => {
    assert.deepEqual(R.dayProblems(at + 1, eventsOf(day)), [], `day ${at + 1}`);
  });
});

test('no day has two events in one year', () => {
  allDays.forEach((day, at) => {
    assert.equal(new Set(day.map(c => c.year)).size, day.length, `day ${at + 1}`);
  });
});

test('no event comes back within 60 days, round the end of the list too', () => {
  const seen = new Map();
  allDays.forEach((day, at) => day.forEach(c => seen.set(c.id, [...(seen.get(c.id) || []), at])));
  for (const [id, days] of seen) {
    days.forEach((a, i) => days.slice(i + 1).forEach(b => {
      const gap = Math.min(b - a, R.DAYS - (b - a));
      assert.ok(gap > R.COOL, `${D.texts[id]} on ${a + 1} and ${b + 1}`);
    }));
  }
});

test('no two days share more than two events', () => {
  const sets = allDays.map(day => new Set(day.map(c => c.id)));
  sets.forEach((a, i) => sets.slice(i + 1).forEach((b, j) => {
    const shared = [...a].filter(id => b.has(id)).length;
    assert.ok(shared <= R.SHARED, `days ${i + 1} and ${i + j + 2} share ${shared}`);
  }));
});

test('difficulty builds through the week', () => {
  const byDay = R.WEEK.map(() => []);
  allDays.forEach((day, at) => byDay[L.weekdayOf(at + 1, D.epoch)].push(R.measure(day.map(c => c.year))));
  const mean = (list, key) => list.reduce((a, m) => a + m[key], 0) / list.length;
  const week = [1, 2, 3, 4, 5, 6, 0].map(w => byDay[w]);
  for (let i = 1; i < 7; i++) {
    assert.ok(mean(week[i], 'cards') >= mean(week[i - 1], 'cards'));
    assert.ok(Math.min(...week[i].map(m => m.gap)) <= Math.min(...week[i - 1].map(m => m.gap)));
    assert.ok(mean(week[i], 'close') >= mean(week[i - 1], 'close'));
  }
  // Mean gap isn't a rule, so Tuesday and Wednesday can swap, but the week falls.
  for (const [easier, harder] of [[0, 3], [3, 4], [4, 5], [5, 6]]) {
    assert.ok(mean(week[harder], 'meanGap') < mean(week[easier], 'meanGap'));
  }
});

test('the whole bank gets used, and the data matches the source files', () => {
  assert.equal(D.years.length, bank.length);
  assert.equal(new Set(allDays.flat().map(c => c.id)).size, bank.length);
  D.texts.forEach((text, id) => assert.equal(byText.get(text).year, D.years[id], text));
});

test('every event is fit to show', () => {
  const seen = new Set();
  for (const e of bank) {
    assert.deepEqual(R.eventProblems(e), [], e.text);
    assert.ok(!seen.has(e.text), `twice: ${e.text}`);
    seen.add(e.text);
    assert.equal(e.text, e.text.trim().replace(/ {2,}/g, ' '));
  }
  assert.ok(bank.length >= 800);
  assert.ok(bank.filter(e => e.subject === 'australia').length >= 100);
});

test('wording says what is being dated, not just a name', () => {
  for (const e of bank) assert.ok(e.text.split(' ').length >= 2, e.text);
  // Each of these would be a bare name, with nothing to say what the year is of.
  assert.ok(!bank.some(e => /^(Vegemite|The Opera House|Bluey|Lego)$/.test(e.text)));
});

test('practice deals fair games from any seed, the same each time', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const { cards: game } = L.practice(seed, D);
    assert.equal(game.length, L.PRACTICE.cards);
    assert.ok(R.measure(game.map(c => c.year)).gap >= L.PRACTICE.gap, `seed ${seed}`);
    const keys = game.map(c => L.names(c.text));
    keys.forEach((a, i) => keys.slice(i + 1).forEach(b => assert.ok(!L.clash(a, b))));
  }
  assert.deepEqual(L.practice(42, D), L.practice(42, D));
});

test('cards on the same subject are spotted', () => {
  assert.ok(L.clash(L.names('Apple launches the iPod'), L.names('Apple Watch goes on sale')));
  assert.ok(!L.clash(L.names('Sydney Opera House opens'), L.names('Sydney Harbour Bridge opens')));
});

test('packing round-trips', () => {
  const ids = [0, 35, 36, 859, 1295];
  assert.deepEqual(L.unpack(L.pack(ids)), ids);
});
