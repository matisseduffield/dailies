const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const L = require('../web/overland/lib.js');
const D = require('../web/overland/days.js');
const M = require('../web/overland/map.js');
const R = require('../scripts/overland-rules.cjs');

const C = M.countries;
const touch = (a, b) => C[a].borders.includes(b);
const portugalToGermany = L.game(M, 'PRT', 'DEU', 3);

test('every border runs both ways, between countries on the map', () => {
  for (const [code, c] of Object.entries(C)) {
    for (const b of c.borders) {
      assert.ok(C[b], `${code} borders unknown ${b}`);
      assert.ok(C[b].borders.includes(code), `${code}-${b} only one way`);
    }
    assert.ok(!c.borders.includes(code));
  }
});

test('borders people get wrong are right', () => {
  const yes = [['ESP', 'MAR'], ['BWA', 'ZMB'], ['RUS', 'POL'], ['RUS', 'LTU'], ['RUS', 'PRK'], ['GBR', 'IRL'], ['IDN', 'PNG'], ['IDN', 'TLS'],
    ['IDN', 'MYS'], ['MYS', 'BRN'], ['DJI', 'SOM'], ['ETH', 'SOM'], ['CHN', 'AFG'], ['AZE', 'TUR'], ['HTI', 'DOM'], ['ITA', 'VAT'], ['ITA', 'SMR'],
    ['FRA', 'MCO'], ['CHE', 'LIE'], ['AUT', 'LIE'], ['ZAF', 'LSO'], ['ZAF', 'SWZ'], ['MOZ', 'SWZ'], ['NAM', 'ZMB'], ['KOR', 'PRK'], ['ISR', 'EGY']];
  for (const [a, b] of yes) assert.ok(touch(a, b), `${a}-${b}`);
  const no = [['FRA', 'BRA'], ['FRA', 'SUR'], ['GBR', 'FRA'], ['DNK', 'SWE'], ['SGP', 'MYS'], ['BHR', 'SAU'], ['USA', 'RUS'], ['JPN', 'KOR'], ['ZWE', 'NAM'], ['AUS', 'IDN'], ['ESP', 'GBR']];
  for (const [a, b] of no) assert.ok(!touch(a, b), `${a}-${b}`);
  for (const island of ['AUS', 'JPN', 'NZL', 'ISL', 'CUB', 'MDG', 'LKA', 'SGP', 'CYP', 'TWN']) assert.deepEqual(C[island].borders, [], island);
});

test('routes are the shortest there are', () => {
  assert.deepEqual(L.route(M, 'PRT', 'ESP'), ['PRT', 'ESP']);
  assert.equal(L.route(M, 'PRT', 'DEU').length, 4);
  assert.deepEqual(L.route(M, 'AUS', 'NZL'), []);
  assert.deepEqual(L.route(M, 'PRT', 'USA'), []);
  assert.equal(L.countRoutes(M, 'PRT', 'ESP'), 1);
  assert.equal(L.countRoutes(M, 'PRT', 'USA'), 0);
  assert.deepEqual([...L.onBest(M, 'PRT', 'DEU')].sort(), ['DEU', 'ESP', 'FRA', 'PRT']);
});

test('search finds what people type', () => {
  const top = q => L.search(M, q)[0];
  assert.equal(top('usa'), 'USA');
  assert.equal(top('uk'), 'GBR');
  assert.equal(top('nz'), 'NZL');
  assert.equal(top('burma'), 'MMR');
  assert.equal(top('turkiye'), 'TUR');
  assert.equal(top('czech'), 'CZE');
  assert.equal(top('ivory'), 'CIV');
  assert.equal(top('sudan'), 'SDN');
  assert.equal(top('southafrica'), 'ZAF');
  assert.ok(L.search(M, 'afr').includes('ZAF'));
  assert.ok(L.search(M, 'africa').includes('CAF'));
  assert.ok(L.search(M, 'congo').includes('COD') && L.search(M, 'congo').includes('COG'));
  assert.equal(top('sao'), 'STP');
  assert.deepEqual(L.search(M, 'x'), []);
  assert.deepEqual(L.search(M, 'zzz'), []);
  // Anywhere in a name, once there are three letters.
  assert.deepEqual(L.search(M, 'stan').sort(), ['AFG', 'KAZ', 'KGZ', 'PAK', 'TJK', 'TKM', 'UZB']);
  assert.ok(L.search(M, 'land').includes('THA') && L.search(M, 'land').includes('FIN'));
  assert.deepEqual(L.search(M, 'ia'), []);
  // Starts of names still come first.
  assert.deepEqual(L.search(M, 'niger').slice(0, 2), ['NER', 'NGA']);
  // Near misses, only when nothing else matches.
  assert.equal(top('columbia'), 'COL');
  assert.equal(top('phillipines'), 'PHL');
  assert.equal(top('kazakstan'), 'KAZ');
  assert.equal(top('swizerland'), 'CHE');
  assert.equal(top('argentnia'), 'ARG');
  assert.deepEqual(L.search(M, 'zzzz'), []);
});

test('guesses in any order join the ends, and only then is it won', () => {
  let s = L.replay(M, portugalToGermany, ['FRA']);
  assert.ok(!s.won && !s.over);
  assert.ok(s.joined.has('FRA'));   // France touches Germany
  assert.equal(s.left, 4);
  s = L.replay(M, portugalToGermany, ['FRA', 'ESP']);
  assert.ok(s.won && s.over);
  const far = L.game(M, 'PRT', 'POL', 3);
  assert.deepEqual([...L.replay(M, far, ['FRA']).joined], []);   // nothing near it yet
  assert.deepEqual([...L.replay(M, far, ['FRA', 'ESP']).joined].sort(), ['ESP', 'FRA']);
});

test('a game is lost when the guesses run out', () => {
  const game = L.game(M, 'PRT', 'DEU', 1);
  assert.equal(game.limit, 3);
  const s = L.replay(M, game, ['JPN', 'NZL', 'AUS']);
  assert.ok(s.over && !s.won);
  assert.equal(s.left, 0);
  // The last guess can still win it.
  const close = L.replay(M, game, ['JPN', 'FRA', 'ESP']);
  assert.ok(close.over && close.won);
});

test('a damaged save is cleaned, and nothing is counted twice', () => {
  const clean = L.cleanGuesses(M, portugalToGermany, ['FRA', 'FRA', 'PRT', 'DEU', 'XXX', 7, 'ESP', 'ITA']);
  assert.deepEqual(clean, ['FRA', 'ESP']);
  assert.deepEqual(L.cleanGuesses(M, portugalToGermany, null), []);
});

test('the share text gives no names away', () => {
  const text = L.shareText(4, M, portugalToGermany, ['ITA', 'FRA', 'ESP']);
  // Italy joins up through France but isn't on a shortest way: yellow.
  assert.equal(text, 'Overland 4 · 3 guesses · best 2\n🟨🟩🟩');
  assert.equal(L.shareText(4, M, portugalToGermany, ['JPN', 'ESP']), 'Overland 4 · Didn’t make it · best 2\n🟥🟩');
  assert.equal(L.cardText(M, portugalToGermany, ['ITA', 'FRA', 'ESP']), 'Overland 3 guesses 🟨🟩🟩');
  assert.equal(L.scoreText(portugalToGermany, L.replay(M, portugalToGermany, ['ESP', 'FRA'])), '2 guesses, best 2');
  const lost = L.game(M, 'PRT', 'DEU', 0);
  assert.equal(L.scoreText(lost, L.replay(M, lost, ['JPN', 'AUS'])), 'Lost, best 2');
  assert.match(L.shareText(0, M, portugalToGermany, ['ESP']), /^Overland practice/);
});

test('streaks count days won in a row', () => {
  assert.equal(L.streak([1, 2, 3], 3), 3);
  assert.equal(L.streak([1, 2, 3], 4), 3);
  assert.equal(L.streak([1, 2, 3], 5), 0);
  assert.equal(L.bestStreak([1, 2, 5, 6, 7]), 3);
});

test('every day keeps to the rules for its weekday', () => {
  assert.equal(D.days.length % 7, 0);
  assert.equal(L.weekdayOf(1, D.epoch), 5);   // the first day was a Friday
  D.days.forEach((line, i) => {
    const [start, end, spare] = line.split(' ');
    const rule = R.WEEK[L.weekdayOf(i + 1, D.epoch)];
    assert.deepEqual(R.problems(M, i + 1, start, end, D.epoch), [], `day ${i + 1}: ${line}`);
    assert.equal(Number(spare), rule.spare, `day ${i + 1}`);
  });
});

test('no pair of countries comes round twice', () => {
  const pairs = D.days.map(l => l.split(' ').slice(0, 2).sort().join('-'));
  assert.equal(new Set(pairs).size, pairs.length);
});

test('a day past the end of the list goes round, on the same weekday', () => {
  const n = D.days.length;
  assert.deepEqual(L.daily(n + 1, D, M), L.daily(1, D, M));
  assert.equal(L.weekdayOf(n + 1, D.epoch), L.weekdayOf(1, D.epoch));
  assert.deepEqual(L.daily(0, D, M), L.daily(n, D, M));
});

test('days already dealt never change', () => {
  const hash = crypto.createHash('sha256').update(D.days.join('\n')).digest('hex').slice(0, 16);
  assert.equal(hash, '47759bb404c182aa');
});

test('practice deals a fair route, the same from the same seed', () => {
  for (let seed = 1; seed < 200; seed++) {
    const g = L.practice(seed, M);
    assert.ok(g.best >= L.PRACTICE.length[0] && g.best <= L.PRACTICE.length[1], `seed ${seed}`);
    assert.deepEqual(g, L.practice(seed, M));
  }
});

test('every country can be drawn and named', () => {
  for (const [code, c] of Object.entries(C)) {
    assert.ok(c.name && c.d.startsWith('M'), code);
    assert.equal(c.box.length, 4);
    assert.ok(c.box[0] <= c.box[2] && c.box[1] <= c.box[3], code);
    assert.ok(c.at[0] >= 0 && c.at[0] <= M.width, code);
  }
  assert.ok(Object.keys(C).length >= 190);
  assert.equal(new Set(Object.values(C).map(c => c.name)).size, Object.keys(C).length);
});
