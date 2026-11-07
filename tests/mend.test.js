const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const L = require('../web/mend/lib.js');
const D = require('../web/mend/days.js');
const P = require('../scripts/mend-proof.cjs');
const R = require('../scripts/mend-rules.cjs');
const B = require('../scripts/mend-bots.cjs');
const { checkAll } = require('../scripts/mend-check.cjs');

const { tiers, proof, sizeOf } = R.loadWords();
const total = D.seeds.length / 3;
const list = Array.from({ length: total }, (_, at) => L.puzzle(at, D));
const weekdayAt = at => L.weekdayOf(at + 1, D.epoch);
const MON_TO_SUN = [1, 2, 3, 4, 5, 6, 0];

// A plain row of tiles, a plus of two crossing words and an H of three.
const row = n => L.layout(['X'.repeat(n)]);
const plus = L.layout(['.X..', 'XXXX', '.X..']);   // tile 2 is the crossing
const aitch = L.layout(['X.X', 'XXX', 'X.X']);     // tiles 2 and 4 are crossings
// Each tile's mark by first letter: h, n (near) or m.
const says = (shape, board, answer) => L.marks(shape, [...board], [...answer]).map(m => m[0]).join('');

test('in place is green, wanted elsewhere yellow, the rest grey', () => {
  assert.equal(says(row(5), 'stone', 'stone'), 'hhhhh');
  assert.equal(says(row(5), 'tsone', 'stone'), 'nnhhh');
  assert.equal(says(row(5), 'stonx', 'stone'), 'hhhhm');
});

test('a word lights only as many of a letter as it still needs', () => {
  assert.equal(says(row(5), 'eelap', 'plane'), 'nmnnn', 'one E wanted, two on show: the first lights, as in Hunch');
  assert.equal(says(row(4), 'abee', 'eeab'), 'nnnn', 'two wanted, two on show: both light');
});

test('a green tile has its place and asks for nothing more', () => {
  assert.equal(says(row(5), 'eatbe', 'table'), 'mhnnh', 'the one E is home, so a loose E is grey');
  assert.equal(says(row(5), 'eexgl', 'eagle'), 'hnmnn', 'one E home, one still wanted');
});

test('a yellow always means a place other than its own', () => {
  assert.equal(says(row(3), 'aab', 'baa'), 'nhn');
  assert.equal(says(row(3), 'abc', 'bac'), 'nnh');
});

test('a crossing tile can be lit by either word', () => {
  // Answer: TOE down, GOAT across. Tiles: T, G O A T, E.
  assert.equal(says(plus, 'tgaote', 'tgoate'), 'hhnnhh', 'the row wants the A');
  assert.equal(says(plus, 'tgeato', 'tgoate'), 'hhnhhn', 'only the column wants the E');
  assert.equal(says(plus, 'tgzate', 'tgoate'), 'hhmhhh', 'neither wants the Z');
});

test('a tile in one word speaks for that word only', () => {
  // The top tile isn't in the row, so a letter only the row wants is grey up there.
  assert.equal(says(plus, 'agotet', 'tgoate'), 'mhhnmn');
  assert.equal(says(plus, 'tgoaet', 'tgoate'), 'hhhhmm', 'each belongs in the other word, and neither word wants it');
});

test('a tile stands for one missing letter, so two wants need two tiles', () => {
  // Top is E (column) and the row's last is E. The crossing tile shows E and so
  // does the row. Reading order would give both wants to the crossing tile and
  // grey out the row's E, which the row is short of.
  const m = L.marks(plus, [...'yaeebz'], [...'eabcez']);
  assert.equal(m[2], 'near');
  assert.equal(m[3], 'near');
});

test('a want moves to a tile not already lit, so nothing is grey that could light', () => {
  // The row wants one E and the left column wants one E. Both crossing tiles show E.
  const m = L.marks(aitch, [...'xpeyest'], [...'epqerst']);
  assert.equal(m[2], 'near');
  assert.equal(m[4], 'near');
});

test('tiles in one word light before tiles on a crossing', () => {
  // The row wants one E and shows two; the column wants none. The E in the row
  // alone can only mean the row, so it takes the light.
  assert.equal(says(plus, 'tgeeax', 'tgoaex'), 'hhmnnh');
});

test('colours hold up on any board', () => {
  const random = L.rng(5);
  const shapes = Object.values(L.SHAPES);
  for (let n = 0; n < 4000; n++) {
    const shape = shapes[n % shapes.length];
    // A small alphabet makes repeats and crossings collide often.
    const letters = 'abcde';
    const answer = shape.cells.map(() => letters[Math.floor(random() * 5)]);
    const board = L.shuffled(answer, random);
    const marks = L.marks(shape, board, answer);
    marks.forEach((m, i) => assert.equal(m === 'hit', board[i] === answer[i]));
    for (const word of shape.words) {
      for (const c of letters) {
        const need = word.filter(t => marks[t] !== 'hit' && answer[t] === c).length;
        const shown = word.filter(t => marks[t] !== 'hit' && board[t] === c);
        const lit = shown.filter(t => marks[t] === 'near').length;
        // A grey letter means the word already shows all it needs of that letter.
        if (shown.some(t => marks[t] === 'miss')) assert.ok(lit >= need, `${word} ${c}`);
      }
    }
    // Every yellow answers a real want, and no want is served twice.
    board.forEach((c, i) => {
      if (marks[i] !== 'near') return;
      assert.ok(shape.wordsOf[i].some(w => shape.words[w].some(t => t !== i && marks[t] !== 'hit' && answer[t] === c)));
    });
    for (const c of letters) {
      const wants = shape.words.reduce((sum, word) => sum + word.filter(t => marks[t] !== 'hit' && answer[t] === c).length, 0);
      const lit = board.filter((ch, i) => ch === c && marks[i] === 'near').length;
      assert.ok(lit <= wants);
    }
  }
});

test('swaps that can\'t help are refused and cost nothing', () => {
  const answer = [...'stone'];
  assert.equal(L.refusal([...'sotne'], answer, 1, 1), 'same');
  assert.equal(L.refusal([...'sotne'], answer, 0, 1), 'placed');
  assert.equal(L.refusal([...'sotne'], answer, 1, 0), 'placed');
  assert.equal(L.refusal([...'aabbe'], [...'bbaae'], 0, 1), 'equal');
  assert.equal(L.refusal([...'sotne'], answer, 1, 2), null);
});

test('a game follows from its swaps, and tiles keep their identity', () => {
  const { board, tiles } = L.replay([...'abc'], [[0, 1], [1, 2]]);
  assert.deepEqual(board, [...'bca']);
  assert.deepEqual(tiles, [2, 0, 1]);   // tile a ended at place 2, b at 0, c at 1
});

test('after a loss, every tile has a place on the answer and home tiles stay', () => {
  const random = L.rng(11);
  for (let n = 0; n < 500; n++) {
    const answer = Array.from({ length: 12 }, () => 'abcd'[Math.floor(random() * 4)]);
    const board = L.shuffled(answer, random);
    const home = L.homes(board, answer);
    assert.equal(new Set(home).size, 12);
    home.forEach((place, i) => {
      assert.equal(answer[place], board[i]);
      if (board[i] === answer[i]) assert.equal(place, i);
    });
  }
});

// Every state reachable by swaps, nearest first. Slow, and needs no theory.
function bruteSwaps(from, to) {
  const goal = to.join('');
  let level = new Set([from.join('')]);
  const seen = new Set(level);
  for (let depth = 0; ; depth++) {
    if (level.has(goal)) return depth;
    const next = new Set();
    for (const s of level) {
      const a = [...s];
      for (let i = 0; i < a.length; i++) {
        for (let j = i + 1; j < a.length; j++) {
          [a[i], a[j]] = [a[j], a[i]];
          const k = a.join('');
          if (!seen.has(k)) { seen.add(k); next.add(k); }
          [a[i], a[j]] = [a[j], a[i]];
        }
      }
    }
    level = next;
  }
}

test('the fewest swaps counts loops, and repeated letters open shorter ways', () => {
  assert.equal(P.fewestSwaps([...'abc'], [...'abc']), 0);
  assert.equal(P.fewestSwaps([...'ba'], [...'ab']), 1);
  assert.equal(P.fewestSwaps([...'bca'], [...'abc']), 2);
  assert.equal(P.fewestSwaps([...'abab'], [...'baba']), 2);
  assert.equal(P.fewestSwaps([...'aabb'], [...'bbaa']), 2);
});

test('the fewest swaps matches a search of every state', () => {
  const random = L.rng(3);
  for (let n = 0; n < 300; n++) {
    const len = 4 + (n % 5);
    const answer = Array.from({ length: len }, () => 'abcd'[Math.floor(random() * 4)]);
    const board = L.shuffled(answer, random);
    assert.equal(P.fewestSwaps(board, answer), bruteSwaps(board, answer), `${board.join('')} ${answer.join('')}`);
  }
});

test('the proof finds every arrangement, including letters traded between words', () => {
  const words = P.wordIndex(['shore', 'share', 'stomp', 'stamp']);
  const rows = L.layout(['XXXXX', '.....', 'XXXXX']);
  const found = P.solutions(rows, [...'shorestamp'], words, 10);
  assert.equal(found.length, 4);   // each pair, either way up
  assert.ok(found.includes('shorestamp') && found.includes('sharestomp'));
});

test('the proof agrees with trying every arrangement', () => {
  const shape = L.layout(['XXX', 'X.X', 'X.X']);   // three words of three letters
  const words = ['cat', 'car', 'tar', 'rat', 'art', 'act', 'tac', 'ate', 'ear', 'era', 'are', 'tea', 'eat', 'cart', 'care', 'race', 'acre', 'rate', 'tear', 'crate'];
  const index = P.wordIndex(words);
  const real = new Set(words);
  const letters = [...'catrear'];
  const seen = new Set();
  const perm = (rest, built) => {
    if (!rest.length) {
      if (shape.words.every(w => real.has(w.map(t => built[t]).join('')))) seen.add(built.join(''));
      return;
    }
    const tried = new Set();
    rest.forEach((ch, i) => {
      if (tried.has(ch)) return;
      tried.add(ch);
      perm(rest.filter((_, j) => j !== i), [...built, ch]);
    });
  };
  perm(letters, []);
  assert.deepEqual(P.solutions(shape, letters, index, 1e6).sort(), [...seen].sort());
});

test('no board is the same across its diagonal, or it would have two solutions', () => {
  const mirror = L.layout(['XXX', 'X..', 'X..']);
  assert.equal(P.solutions(mirror, [...'catar'], P.wordIndex(['cat', 'car']), 10).length, 2);
  for (const shape of Object.values(L.SHAPES)) {
    const cells = new Set(shape.cells.map(([r, c]) => `${r},${c}`));
    assert.ok(shape.cells.some(([r, c]) => !cells.has(`${c},${r}`)), shape.name);
  }
});

test('every board fits a phone with room for a 44 px tile', () => {
  for (const shape of Object.values(L.SHAPES)) {
    assert.ok(shape.cols <= 6 && shape.rows <= 7, shape.name);
    // Every tile is in a word, and every line of two or more is one.
    assert.ok(shape.wordsOf.every(w => w.length >= 1 && w.length <= 2));
    assert.ok(shape.words.every(w => w.length >= 5 && w.length <= 7));
  }
});

test('days count in the player\'s calendar from the epoch', () => {
  assert.equal(L.dayNumber(new Date(2026, 10, 5, 0, 1), D.epoch), 1);
  assert.equal(L.dayNumber(new Date(2026, 10, 5, 23, 59), D.epoch), 1);
  assert.equal(L.dayNumber(new Date(2026, 10, 6, 0, 0), D.epoch), 2);
  assert.equal(L.dayNumber(new Date(2026, 10, 4, 12, 0), D.epoch), 0);
  assert.equal(L.weekdayOf(1, D.epoch), 4);   // Thursday
});

test('the first days keep their puzzles', () => {
  const first = day => {
    const p = L.daily(day, D);
    return [p.shape.name, R.wordsOf(p.shape, p.answer).join(' '), p.start.join('')];
  };
  assert.deepEqual(first(1), ['comb', 'prefer affect gruff offer froth', 'pfecegroertahfffoufrf']);
  assert.deepEqual(first(2), ['tower', 'tabby await group wayward obvious', 'waoaadpywstoutrivbabgoy']);
  assert.deepEqual(first(5), ['wheel', 'fuzzy outer union cycle', 'lnnzczrciuufteyo']);
});

test('a clock set before the first day still gets a puzzle', () => {
  for (const day of [0, -1, -6, -400, -100000]) {
    const p = L.daily(day, D);
    assert.equal(p.answer.length, p.shape.cells.length);
    assert.equal(p.start.length, p.answer.length);
  }
});

test('the list goes round onto the same weekday', () => {
  assert.equal(D.days % 7, 0);
  for (const day of [D.days + 1, D.days + 4, 2 * D.days + 3, 0, -3, -D.days + 2]) {
    const expected = L.WEEK[L.weekdayOf(day, D.epoch)];
    assert.ok(expected.boards.includes(L.daily(day, D).shape.name), `day ${day}`);
  }
});

test('days to the start of 2029, and spares for Practice', () => {
  assert.equal(D.days, 791);
  assert.ok(total > D.days);
  const lengths = list.reduce((sum, p) => sum + p.answer.length, 0);
  assert.equal(D.letters.length, lengths);
  assert.match(D.letters, /^[a-z]+$/);
  assert.match(D.seeds, /^[0-9a-z]+$/);
});

test('every puzzle is the right board for its day', () => {
  list.forEach((p, at) => {
    const rule = L.WEEK[weekdayAt(at)];
    assert.ok(rule.boards.includes(p.shape.name), `${at}`);
    assert.equal(p.swaps, rule.fewest + rule.spare);
  });
});

test('every word is an answer word and the right rarity for the day', () => {
  list.forEach((p, at) => {
    const words = R.wordsOf(p.shape, p.answer);
    assert.equal(new Set(words).size, words.length, `${at} repeats a word`);
    for (const w of words) assert.ok(sizeOf.has(w), `${at}: ${w}`);
    const rule = R.RARE[weekdayAt(at)];
    const rare = R.rareCount(words, sizeOf);
    assert.ok(rare >= rule.least && rare <= rule.most, `${at}: ${rare} rare words`);
  });
});

test('every opening has the right tiles in place and no word finished', () => {
  list.forEach((p, at) => {
    assert.deepEqual([...p.start].sort(), [...p.answer].sort(), `${at}`);
    assert.equal(p.start.filter((c, i) => c === p.answer[i]).length, p.shape.keep, `${at}`);
    for (const word of p.shape.words) assert.ok(word.some(t => p.start[t] !== p.answer[t]), `${at}`);
  });
});

test('every puzzle has exactly one solution among all the words in SCOWL up to size 80, and needs exactly its day\'s fewest swaps', async () => {
  const { checked, failures } = await checkAll();
  assert.equal(checked, total);
  assert.deepEqual(failures, []);
});

test('the proof finds a second solution if there is one', () => {
  // Trade two letters of a word that sit on no crossing. Teach the proof that the
  // result is a word, and a stored puzzle must then show two solutions.
  let tried = 0;
  for (const p of list.slice(0, 50)) {
    const word = p.shape.words[0];
    const free = word.map((t, i) => i).filter(i => p.shape.wordsOf[word[i]].length === 1);
    const letters = word.map(t => p.answer[t]);
    const [i, j] = [free[0], free.find(k => letters[k] !== letters[free[0]])];
    if (j === undefined) continue;
    [letters[i], letters[j]] = [letters[j], letters[i]];
    assert.equal(P.solutions(p.shape, p.answer, P.wordIndex([...proof, letters.join('')]), 2).length, 2, `${p.at}`);
    tried++;
  }
  assert.ok(tried >= 40, `only ${tried} puzzles tried`);
});

test('words are spread out: 90 days apart and 16 days at most', () => {
  const last = new Map();
  const uses = new Map();
  const whole = new Set();
  list.forEach((p, at) => {
    // Practice may repeat itself (scripts/mend-swap-days.cjs), but never a daily board.
    assert.ok(!whole.has(p.answer.join('')) || (at >= D.days && list.findIndex(q => q.answer.join('') === p.answer.join('')) >= D.days), `${at}`);
    whole.add(p.answer.join(''));
    if (at >= D.days) return;
    for (const w of R.wordsOf(p.shape, p.answer)) {
      if (last.has(w)) assert.ok(at - last.get(w) >= 90, `${w} at ${at}`);
      last.set(w, at);
      uses.set(w, (uses.get(w) || 0) + 1);
    }
  });
  assert.ok(Math.max(...uses.values()) <= 16);
  assert.ok(uses.size >= 1000, `only ${uses.size} different words`);
});

test('Practice never gives away a daily puzzle', () => {
  const daily = new Set(list.slice(0, D.days).map(p => p.answer.join('')));
  for (const p of list.slice(D.days)) assert.ok(!daily.has(p.answer.join('')));
});

// The owner's rule for answers: words most adults know and are happy to see, fine
// in Britain and Australia, with no padding. The data is meant never to need
// rewriting, so these hold for the list and for every stored puzzle.
const NEVER = `
  queer chink pansy spunk bitch bloody bugger whore penis vagina prick semen sperm
  faggot retard cretin midget moron idiot rapist racist sexist nazis
  death dying fatal grief abort lynch slave vomit cancer murder corpse coffin
  suicide autopsy terror
  bible roman french scotch maria peter harry
  color honor humor labor center theater liter fiber gotten candy diner faucet
  diaper sidewalk license program yogurt
  datum octal halon cumming ashcan tripos thous genii uteri unman unsay betcha
  gonna wanna gimme lemme kinda sorta dunno
  about after their there which would could should because through
`.split(/\s+/).filter(Boolean);

test('no answer comes from the words left out', () => {
  const out = readFileSync(path.join(__dirname, '../scripts/mend-not-answers.txt'), 'utf8').split('\n').filter(l => !l.startsWith('#')).join(' ').split(/\s+/).filter(Boolean);
  assert.ok(out.length > 2500, 'the hand-read list is all there');
  for (const w of [...out, ...NEVER]) assert.ok(!sizeOf.has(w), w);
  const used = new Set(list.flatMap(p => R.wordsOf(p.shape, p.answer)));
  for (const w of [...out, ...NEVER]) assert.ok(!used.has(w), w);
});

test('answers are the right length, and there are plenty of them', () => {
  for (const w of sizeOf.keys()) assert.match(w, /^[a-z]{5,7}$/);
  assert.ok(sizeOf.size >= 4000 && sizeOf.size <= 4200, `${sizeOf.size} answers`);
  assert.ok(tiers[10].length && tiers[20].length && tiers[35].length);
});

test('no answer is a plain plural or a plain past tense', () => {
  for (const w of sizeOf.keys()) {
    if (w.endsWith('s') && !/(ss|us|is)$/.test(w)) assert.ok(R.SINGULAR_S.has(w), `${w} looks like a plural`);
    assert.ok(!/(iest|ings)$/.test(w), w);
  }
  const ed = [...sizeOf.keys()].filter(w => w.endsWith('ed')).sort();
  assert.deepEqual(ed, ['ashamed', 'belated', 'beloved', 'exceed', 'hundred', 'proceed', 'sacred', 'seaweed', 'shred', 'speed', 'succeed', 'unused']);
});

test('spellings are British and Australian', () => {
  const real = new Set(proof);
  for (const w of sizeOf.keys()) {
    if (w.endsWith('or')) assert.ok(!real.has(w.slice(0, -2) + 'our'), w);
    if (w.endsWith('ize') && w !== 'prize' && w !== 'seize' && w !== 'maize') assert.ok(!real.has(w.slice(0, -3) + 'ise'), w);
    if (w.endsWith('ense')) assert.ok(!real.has(w.slice(0, -4) + 'ence'), w);
  }
});

test('no board is padded out', () => {
  list.forEach((p, at) => {
    const words = R.wordsOf(p.shape, p.answer);
    assert.ok(words.filter(w => R.PAST_FORMS.has(w)).length <= 1, `${at}: ${words}`);
    assert.ok(words.filter(w => w.endsWith('ly')).length <= 2, `${at}: ${words}`);
    assert.ok(R.readsWell(words), `${at}`);
  });
});

test('a measured week: every lever gets harder from Monday to Sunday', () => {
  const week = MON_TO_SUN.map(day => {
    const puzzles = list.filter((_, at) => weekdayAt(at) === day);
    const mean = fn => puzzles.reduce((sum, p) => sum + fn(p), 0) / puzzles.length;
    return {
      tiles: mean(p => p.answer.length),
      keep: mean(p => p.shape.keep),
      tight: mean(p => p.shape.spare / p.shape.fewest),
      rare: mean(p => R.rareCount(R.wordsOf(p.shape, p.answer), sizeOf)),
    };
  });
  for (let i = 1; i < 7; i++) {
    assert.ok(week[i].tiles > week[i - 1].tiles, 'boards grow');
    assert.ok(week[i].keep <= week[i - 1].keep, 'no more tiles in place');
    assert.ok(week[i].tight < week[i - 1].tight, 'less to spare for the size of the job');
    assert.ok(week[i].rare >= week[i - 1].rare, 'rarer words');
  }
});

test('the end of the week lays decoys', () => {
  const real = new Set(proof);
  const share = day => {
    const puzzles = list.filter((_, at) => weekdayAt(at) === day);
    return puzzles.filter(p => R.decoys(p.shape, p.start, p.answer, real) > 0).length / puzzles.length;
  };
  for (const day of [5, 6, 0]) assert.ok(share(day) > .25, `day ${day}: ${share(day)}`);
  for (const day of [1, 2, 3, 4]) assert.ok(share(day) < .05, `day ${day}: ${share(day)}`);
});

test('openings get more misleading through the week', () => {
  const vocab = P.wordIndex([...sizeOf.keys()]);
  const means = MON_TO_SUN.map(day => {
    const sample = list.map((p, at) => [p, at]).filter(([, at]) => at < D.days && weekdayAt(at) === day);
    return sample.reduce((sum, [p]) => sum + R.lures(p.shape, p.start, p.answer, vocab), 0) / sample.length;
  });
  for (let i = 1; i < 7; i++) assert.ok(means[i] > means[i - 1], `${means}`);
});

test('careless play fails and careful play has swaps to spare', () => {
  const random = L.rng(2026);
  const results = MON_TO_SUN.map(day => {
    const sample = list.filter((_, at) => weekdayAt(at) === day).slice(0, 12);
    let sloppyWins = 0, sharpWins = 0, sharpLeft = 0;
    for (const p of sample) {
      const sloppy = B.play(p.shape, p.start, p.answer, p.swaps, B.sloppy(p.shape, random));
      const sharp = B.play(p.shape, p.start, p.answer, p.swaps, B.reader(p.shape, P.wordIndex([...sizeOf.keys()]), random, { crossCheck: true }));
      if (sloppy >= 0) sloppyWins++;
      if (sharp >= 0) { sharpWins++; sharpLeft += sharp; }
    }
    return { sloppy: sloppyWins / sample.length, sharp: sharpWins / sample.length, left: sharpLeft / Math.max(1, sharpWins) };
  });
  results.forEach((r, i) => {
    assert.ok(r.sharp >= .75, `day ${i}: sharp player wins ${r.sharp}`);
    assert.ok(r.left >= 1, `day ${i}: sharp player has ${r.left} left`);
    assert.ok(r.sloppy <= .5, `day ${i}: careless player wins ${r.sloppy}`);
  });
});

test('streaks count days in a row', () => {
  assert.equal(L.streak([1, 2, 3], 3), 3);
  assert.equal(L.streak([1, 2, 3], 4), 3);
  assert.equal(L.streak([1, 2, 3], 5), 0);
  assert.equal(L.streak([1, 3], 3), 1);
  assert.equal(L.bestStreak([1, 2, 5, 6, 7, 9]), 3);
  assert.equal(L.bestStreak([]), 0);
});

test('the share shows how each swap went and gives no letter away', () => {
  const start = [...'badc'], answer = [...'abcd'];
  const won = L.shareText(7, start, answer, [[0, 1], [2, 3]], 4, { won: true });
  assert.equal(won, 'Mend 7 · 2 of 4 swaps left\n■■');
  const lost = L.shareText(0, [...'bcda'], answer, [[0, 1]], 1, { won: false });
  assert.equal(lost, 'Mend practice · Out of swaps\n▣');
  assert.ok(L.shareText(7, start, answer, [], 4, { won: false, gaveUp: true }).startsWith('Mend 7 · Gave up'));
  assert.deepEqual(L.gains([...'bcda'], answer, [[0, 3], [1, 3]]), [1, 1]);
});

test('the page takes the day from the clock', () => {
  const page = readFileSync(path.join(__dirname, '../web/mend/index.html'), 'utf8');
  assert.ok(!/new Date\(\)/.test(page));
  assert.ok(page.includes('Clock.now()'));
  assert.ok(page.includes("addEventListener('clock', checkDay)"));
  assert.ok(page.includes('window.ladderBack'));
  assert.ok(!/<input|<textarea/.test(page), 'the system keyboard must never open');
});

test('no board pairs a word with its own relation', () => {
  for (let day = 1; day <= D.days; day++) {
    const p = L.daily(day, D);
    const words = p.shape.words.map(w => w.map(t => p.answer[t]).join(''));
    words.forEach((a, i) => words.forEach((b, j) => {
      if (i < j) assert.ok(!a.includes(b) && !b.includes(a), `day ${day}: ${a} ${b}`);
    }));
  }
});
