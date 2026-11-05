const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const L = require('../web/cluey/lib.js');
const D = require('../web/cluey/puzzles.js');
const R = require('../scripts/cluey-rules.cjs');

const SCRIPTS = path.join(__dirname, '../scripts/cluey');
const days = readFileSync(path.join(SCRIPTS, 'grids.txt'), 'utf8').split('\n').filter(Boolean).map(line => {
  const [grid, levels] = line.split(' ');
  return { grid, levels: [...levels].map(Number) };
});
const all = D.puzzles.map(L.parse);
// SCOWL size: how common a word is. Words on the lively list count as common.
const sizes = new Map(['words.txt', 'inflected.txt'].flatMap(f => readFileSync(path.join(SCRIPTS, f), 'utf8').split('\n').filter(Boolean).map(l => l.split(' '))));
const lively = new Set(readFileSync(path.join(SCRIPTS, 'lively.txt'), 'utf8').split('\n').filter(l => !l.startsWith('#')).join(' ').split(/\s+/));
const sizeOf = word => (lively.has(word) ? 20 : Number(sizes.get(word) || 35));
const day = (d, data = D) => L.daily(d, data);

// A small grid to play on:  O W L
//                           R O E
//                           B E T
const RAW = ['owl/roe/bet', '1dHunter', '1dFish eggs', '1dGamble', '1dSphere', '1dSorrow', '1dAllow'];
const mini = () => L.parse(RAW);
const start = (p, over = {}) => ({ fill: L.blank(p), marks: L.blank(p), cell: 0, across: true, ...over });
const typed = (p, game, letters) => [...letters].reduce((g, ch) => L.type(p, g, ch), game);

test('a puzzle reads as numbered answers, across first', () => {
  const p = mini();
  assert.equal(p.size, 3);
  assert.deepEqual(p.entries.map(e => [L.label(e), e.word]), [['1A', 'owl'], ['4A', 'roe'], ['5A', 'bet'], ['1D', 'orb'], ['2D', 'woe'], ['3D', 'let']]);
  assert.equal(p.entries[1].clue, 'Fish eggs');
  assert.equal(p.entries[1].level, 1);
  assert.equal(p.entries[1].tag, 'd');
  assert.deepEqual(p.of[4], [1, 4]);
  assert.equal(L.entryAt(p, 4, false).word, 'woe');
});

test('blocks are skipped when numbering', () => {
  const p = L.parse(['##far/#tuna/arrow/darn#/spy##', ...Array(10).fill('1dx')]);
  assert.equal(p.numbers[2], 1);
  assert.equal(p.entries[0].word, 'far');
  assert.equal(p.answer[0], '#');
  assert.equal(p.cells.length, 19);
});

test('typing fills a word then moves to the next clue with a gap', () => {
  const p = mini();
  let g = typed(p, start(p), 'ow');
  assert.equal(g.cell, 2);
  g = L.type(p, g, 'l');
  assert.equal(g.fill.slice(0, 3), 'owl');
  assert.equal(g.cell, 3);               // on to 4 Across
  assert.equal(g.across, true);
});

test('typing skips letters already in the word', () => {
  const p = mini();
  let g = start(p);
  g = { ...g, fill: 'o l      ' };
  g = L.type(p, { ...g, cell: 1 }, 'w');
  assert.equal(g.fill.slice(0, 3), 'owl');
  assert.equal(g.cell, 3);
  // A gap earlier in the word comes back round before moving on.
  g = L.type(p, { ...start(p), fill: ' w       ', cell: 2 }, 'l');
  assert.equal(g.cell, 0);
});

test('typing over a letter moves on one square and goes no further than the word', () => {
  const p = mini();
  let g = { ...start(p), fill: 'xyz      ' };
  g = L.type(p, g, 'o');
  assert.equal(g.cell, 1);
  g = L.type(p, { ...g, cell: 2 }, 'l');
  assert.equal(g.cell, 2);
});

test('the last gap in the grid moves on past finished clues', () => {
  const p = mini();
  const g = L.type(p, { ...start(p), fill: p.answer.slice(0, 8) + ' ', cell: 8, across: true }, 't');
  assert.equal(g.fill, p.answer);
  assert.equal(g.cell, 8);
});

test('backspace clears a letter, then steps back', () => {
  const p = mini();
  let g = typed(p, start(p), 'ow');
  assert.equal(g.cell, 2);
  g = L.erase(p, g);                      // empty here: step back and take W
  assert.equal(g.cell, 1);
  assert.equal(g.fill[1], ' ');
  g = L.erase(p, { ...g, fill: 'o' + g.fill.slice(1), cell: 0 });
  assert.equal(g.fill[0], ' ');
  assert.equal(g.cell, 0);                // a letter here just goes
});

test('backspace at the start of a word steps to the last clue and takes nothing', () => {
  const p = mini();
  const before = { ...start(p), fill: 'owl      ', cell: 3 };
  const g = L.erase(p, before);
  assert.equal(g.cell, 2);
  assert.equal(g.fill, before.fill);
});

test('locked letters survive typing and backspace', () => {
  const p = mini();
  const marks = ' c       ';
  let g = { ...start(p), fill: 'ow       ', marks, cell: 1 };
  g = L.type(p, g, 'q');
  assert.equal(g.fill.slice(0, 3), 'owq');
  g = L.erase(p, { ...g, cell: 2 });
  assert.equal(g.fill.slice(0, 3), 'ow ');
  g = L.erase(p, g);                      // past the locked W to the O
  assert.equal(g.fill.slice(0, 2), ' w');
  assert.equal(g.cell, 0);
});

test('fixing a letter marked wrong clears the mark', () => {
  const p = mini();
  const g = L.type(p, { ...start(p), fill: 'q        ', marks: 'x        ' }, 'o');
  assert.equal(g.marks[0], ' ');
  assert.equal(L.erase(p, { ...start(p), fill: 'q        ', marks: 'x        ' }).marks[0], ' ');
});

test('check marks letters and leaves gaps alone', () => {
  const p = mini();
  const g0 = { ...start(p), fill: 'oq       ' };
  assert.ok(L.canCheck(g0, p.entries[0]));
  const g = L.check(p, g0, p.entries[0]);
  assert.equal(g.marks.slice(0, 3), 'cx ');
  assert.equal(L.canCheck(g, p.entries[0]), false);   // nothing new: no charge
  assert.equal(L.canCheck(start(p), p.entries[0]), false);
});

test('reveal gives the right letter and locks it', () => {
  const p = mini();
  const g = L.reveal(p, { ...start(p), fill: 'q        ' }, 0);
  assert.equal(g.fill[0], 'o');
  assert.ok(L.locked(g.marks, 0));
});

test('clue steps go in order and land on a gap', () => {
  const p = mini();
  assert.deepEqual(L.stepClue(p, L.blank(p), 0, 1), { cell: 3, across: true });
  assert.deepEqual(L.stepClue(p, L.blank(p), 0, -1), { cell: 2, across: false });
  assert.deepEqual(L.stepClue(p, L.blank(p), 5, 1), { cell: 0, across: true });
  assert.deepEqual(L.stepClue(p, 'r o   ' + '   ', 2, 1), { cell: 3, across: false });
});

test('arrows jump blocks and stop at the edge', () => {
  const p = L.parse(['##far/#tuna/arrow/darn#/spy##', ...Array(10).fill('1dx')]);
  assert.equal(L.arrow(p, 11, -1, 0), 6);
  assert.equal(L.arrow(p, 10, -1, 0), 10);
  assert.equal(L.arrow(p, 2, 0, -1), 2);
  assert.equal(L.arrow(p, 24 - 2, 0, 1), 22);
});

test('a clean solve has no help of any kind', () => {
  assert.ok(L.clean({ checks: 0, reveals: 0, misses: 0 }));
  assert.ok(!L.clean({ checks: 1, reveals: 0, misses: 0 }));
  assert.ok(!L.clean({ checks: 0, reveals: 1, misses: 0 }));
  assert.ok(!L.clean({ checks: 0, reveals: 0, misses: 1 }));
  assert.equal(L.helpText({ checks: 1, reveals: 2, misses: 1 }), '1 check, 2 reveals, 1 wrong finish');
});

test('the clock reads as minutes and seconds', () => {
  assert.equal(L.clock(0), '0:00');
  assert.equal(L.clock(61999), '1:01');
  assert.equal(L.clock(3723000), '1:02:03');
});

test('sharing gives no letters away', () => {
  const p = day(1);
  const clean = L.shareText(1, p, { ms: 83000, checks: 0, reveals: 0, misses: 0 });
  assert.equal(clean, `Cluey 1 · ${p.size}×${p.size} · 1:23 · Clean`);
  const helped = L.shareText(2, p, { ms: 83000, checks: 2, reveals: 1, misses: 0 });
  assert.match(helped, /2 checks, 1 reveal/);
  assert.match(L.shareText(3, p, { ms: 83000, gaveUp: true, checks: 0, reveals: 0, misses: 0 }), /Gave up at 1:23/);
  for (const e of p.entries) assert.ok(!clean.toLowerCase().includes(e.word));
});

test('streaks count days in a row', () => {
  assert.equal(L.streak([1, 2, 3], 3), 3);
  assert.equal(L.streak([1, 2, 3], 4), 3);
  assert.equal(L.streak([1, 2, 3], 5), 0);
  assert.equal(L.bestStreak([1, 2, 5, 6, 7]), 3);
});

test('days follow the calendar from the epoch', () => {
  assert.equal(D.epoch, '2026-11-05');
  assert.equal(L.dayNumber(new Date(2026, 10, 5, 0, 1), D.epoch), 1);
  assert.equal(L.dayNumber(new Date(2026, 10, 5, 23, 59), D.epoch), 1);
  assert.equal(L.dayNumber(new Date(2026, 10, 6), D.epoch), 2);
  assert.equal(L.weekdayOf(1, D.epoch), 4);    // a Thursday
});

test('the first days keep their puzzles', () => {
  assert.equal(D.puzzles[0][0], FIRST[0]);
  assert.equal(D.puzzles[1][0], FIRST[1]);
  assert.equal(D.puzzles[2][0], FIRST[2]);
  assert.equal(D.puzzles[6][0], FIRST[6]);
});
const FIRST = ['site#/omen#/waste/#glee/#earl', '#pal##/pave##/agenda/rental/##girl/##elk#', 'spud###/panic##/inter##/neo#ear/##llama/##deter/###gene', '###sash/###idle/#stream/ute#lip/barren#/else###/reed###', '#swat/#cash/tripe/wave#/open#', '##gas/spurt/naive/allow/get##', '#olaf/luigi/inner/scene/pert#'];

test('a clock set before the first day still gets a puzzle', () => {
  for (const d of [0, -1, -6, -209, -210, -100000]) {
    const p = day(d);
    assert.ok(p.entries.length >= 10);
    // Weekdays still match, because the list is whole weeks.
    assert.equal(R.WEEK[L.weekdayOf(d, D.epoch)].size, p.size);
  }
});

test('the list goes round on the weekday it was made for', () => {
  assert.equal(D.puzzles.length % 7, 0);
  assert.ok(D.puzzles.length >= 200);
  assert.equal(L.rawFor(D.puzzles.length + 1, D), D.puzzles[0]);
  const n = D.puzzles.length;
  for (let d = 1; d <= 14; d++) assert.equal(L.weekdayOf(d, D.epoch), L.weekdayOf(d + n, D.epoch));
});

test('puzzles.js is exactly what the bank and grids make', () => {
  assert.equal(days.length, D.puzzles.length);
  days.forEach((d, i) => {
    assert.equal(D.puzzles[i][0], d.grid);
    assert.deepEqual(D.puzzles[i].slice(1).map(c => Number(c[0])), d.levels);
  });
});

test('every grid is clean: symmetric, whole, every letter in two answers', () => {
  D.puzzles.forEach((raw, i) => {
    assert.equal(R.gridFault(raw[0]), null, `day ${i + 1}`);
    assert.equal(raw.length - 1, R.entries(raw[0]).length, `day ${i + 1}`);
  });
});

test('every day meets the rules for its weekday', () => {
  all.forEach((p, i) => {
    const day = i + 1;
    const rule = R.WEEK[L.weekdayOf(day, D.epoch)];
    assert.equal(p.size, rule.size, `day ${day} size`);
    const blocks = p.size * p.size - p.cells.length;
    assert.ok(rule.blocks.includes(blocks), `day ${day} has ${blocks} blocks`);
    const mix = [1, 2, 3].map(l => p.entries.filter(e => e.level === l).length);
    assert.deepEqual(mix, rule.mix, `day ${day} clue levels`);
    const rare = p.entries.filter(e => sizeOf(e.word) > 20).length;
    assert.ok(rare <= rule.rare, `day ${day} has ${rare} less common answers`);
  });
});

test('difficulty rises through the week, measured', () => {
  const byDay = {};
  all.forEach((p, i) => {
    const w = L.weekdayOf(i + 1, D.epoch);
    (byDay[w] ||= []).push(R.difficulty(D.puzzles[i][0], p.entries.map(e => e.level)));
  });
  const mean = list => list.reduce((a, b) => a + b, 0) / list.length;
  const week = [1, 2, 3, 4, 5].map(w => mean(byDay[w]));
  for (let i = 1; i < week.length; i++) assert.ok(week[i] > week[i - 1], `weekday ${i + 1}`);
  assert.ok(mean(byDay[6]) > week[4] && mean(byDay[0]) > week[4]);
  // No single Monday may beat the easiest Tuesday by much, and so on: the worst
  // day of each weekday stays under the best of the next but one.
  for (const [a, b] of [[1, 3], [2, 4], [3, 5], [4, 6]]) assert.ok(Math.max(...byDay[a]) < Math.min(...byDay[b]), `${a} against ${b}`);
});

test('no answer comes back within 60 days', () => {
  const last = new Map();
  all.forEach((p, i) => {
    for (const e of p.entries) {
      if (last.has(e.word)) assert.ok(i - last.get(e.word) >= R.REPEAT_GAP, `${e.word} on day ${i + 1}`);
      last.set(e.word, i);
    }
  });
});

test('no two puzzles share more than a third of their answers', () => {
  D.puzzles.forEach((a, i) => D.puzzles.slice(0, i).forEach((b, j) => {
    const share = R.shared(a[0], b[0]);
    assert.ok(share <= R.MAX_SHARED, `days ${j + 1} and ${i + 1} share ${Math.round(share * 100)}%`);
  }));
});

test('the same square turned on its side counts as the same grid', () => {
  assert.equal(R.shared('owl/roe/bet', 'orb/woe/let'), 1);
});

test('no joke is recycled, and no reference is leaned on', () => {
  const list = all.flatMap((p, i) => p.entries.map(e => ({ day: i + 1, word: e.word, clue: e.clue })));
  assert.deepEqual(R.recycled(list), []);
});

test('recycling is caught', () => {
  assert.ok(R.nearCopy('Winner of a war in 1932', "Winner of Australia's 1932 war"));
  assert.ok(R.nearCopy('Keen on', 'Really keen on'));
  assert.ok(!R.nearCopy('Cheek', 'Backchat'));
  const faults = R.recycled([1, 40, 80].map(day => ({ day, word: 'owl' + day, clue: `Duolingo mascot number ${day}` })));
  assert.equal(faults.length, 2);   // the name and the stock phrase
  assert.equal(R.recycled([1, 10].map(day => ({ day, word: 'x' + day, clue: `Likes the Duolingo app ${day}` }))).length, 1);
});

test('a level 3 clue misdirects, so a puzzle has one plain blank there at most', () => {
  all.forEach((p, i) => {
    const blanks = p.entries.filter(e => e.level === 3 && e.clue.includes('___'));
    assert.ok(blanks.length <= 1, `day ${i + 1}: ${blanks.map(e => e.clue).join(' / ')}`);
  });
});

test('every recent clue has a source, or is plain common knowledge', () => {
  const lines = readFileSync(path.join(SCRIPTS, 'verified.txt'), 'utf8').split('\n').filter(Boolean);
  all.forEach((p, i) => {
    for (const e of p.entries.filter(x => x.tag === 'n')) {
      const line = lines.find(l => l.startsWith(`${i + 1} ${e.word} | ${e.clue} |`));
      assert.ok(line, `day ${i + 1} ${e.word}: ${e.clue}`);
      assert.match(line, /https?:|common knowledge/, line);
    }
  });
});

test('no clue is ever used twice', () => {
  const clues = new Set();
  all.forEach((p, i) => {
    for (const e of p.entries) {
      const k = e.clue.toLowerCase();
      assert.ok(!clues.has(k), `day ${i + 1}: ${e.clue}`);
      clues.add(k);
    }
  });
});

test('every puzzle has its mix of clues', () => {
  all.forEach((p, i) => {
    assert.equal(R.mixFault(p.entries), null, `day ${i + 1}`);
    for (const e of p.entries) assert.ok(R.TAGS.includes(e.tag), `day ${i + 1} ${e.word}`);
  });
});

test('recent culture is about a tenth of the clues, one or two to a puzzle', () => {
  const list = all.flatMap(p => p.entries);
  const share = list.filter(e => e.tag === 'n').length / list.length;
  assert.ok(share >= .1 && share <= .15, `${(share * 100).toFixed(1)}%`);
});

test('every clue is fair on what a machine can check', () => {
  all.forEach((p, i) => {
    const words = p.entries.map(e => e.word);
    for (const e of p.entries) {
      assert.equal(R.clueFault(e.clue, e.word, words), null, `day ${i + 1} ${e.word}: ${e.clue}`);
    }
  });
});

test('no answer in a grid gives another away', () => {
  all.forEach((p, i) => {
    const words = p.entries.map(e => e.word);
    words.forEach((a, x) => words.forEach((b, y) => assert.ok(x === y || !R.related(a, b), `day ${i + 1}: ${a} ${b}`)));
  });
});

test('no rejected word is an answer', () => {
  const rejected = new Set(readFileSync(path.join(SCRIPTS, 'reject.txt'), 'utf8').split('\n').filter(l => !l.startsWith('#')).join(' ').split(/\s+/));
  for (const p of all) for (const e of p.entries) assert.ok(!rejected.has(e.word), e.word);
});

test('nothing in the bank breaks its format', () => {
  for (const f of readdirSync(SCRIPTS).filter(f => /^clues-/.test(f))) {
    readFileSync(path.join(SCRIPTS, f), 'utf8').split('\n').forEach((line, i) => {
      if (!line.trim() || line.startsWith('#')) return;
      assert.match(line, /^(day \d+|[a-z]+ [123] [dbxcnpw] \S.*\S)$/, `${f}:${i + 1}`);
      assert.ok(!/—|–/.test(line), `${f}:${i + 1} has a long dash`);
    });
  }
});
