const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const L = require('../web/splice/lib.js');
const D = require('../web/splice/days.js');

// The answers the builder may use, and every link it knows of when proving a
// tree has one answer, read the same way it reads them.
const read = f => fs.readFileSync(`${__dirname}/../scripts/${f}`, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
const answers = new Map(read('splice-answers.txt').map(l => { const [pair, written] = l.split(' | '); return [pair, written]; }));
const known = new Set([...read('splice-words.txt').map(l => l.split(' ').slice(1).join(' ')), ...read('splice-phrases.txt'), ...read('splice-known.txt'), ...answers.keys()]);

test('shapes have the rows and links they say', () => {
  assert.deepEqual(L.tree('seven').parent, [-1, 0, 0, 1, 1, 2, 2]);
  assert.deepEqual(L.tree('six').rows, [[0], [1, 2], [3, 4, 5]]);
  for (const name of Object.keys(L.SHAPES)) {
    const { parent, rows } = L.tree(name);
    assert.equal(rows.flat().length, parent.length);
    assert.ok(rows.every(r => r.length <= 4), `${name} is too wide for a phone`);
  }
});

test('alike siblings can swap, and a check reads the answer the way it best fits', () => {
  const { parent } = L.tree('seven');
  const answer = ['fire', 'work', 'place', 'shop', 'out', 'mat', 'holder'];
  assert.equal(L.variants(parent, answer).length, 8);
  assert.ok(L.check(parent, ['fire', 'place', 'work', 'holder', 'mat', 'out', 'shop'], answer).every(Boolean));
  const one = L.check(parent, ['fire', 'work', 'place', 'shop', 'out', 'holder', 'mat'], answer);
  assert.ok(one.every(Boolean));
  const off = L.check(parent, ['work', 'fire', 'place', 'shop', 'out', 'mat', 'holder'], answer);
  assert.equal(off.filter(Boolean).length, 2);   // only PLACE's two links stand
});

test('counting answers ignores swaps of alike siblings, and finds real alternatives', () => {
  const { parent } = L.tree('six');
  const joins = (a, b) => new Set(['ab', 'ac', 'bd', 'be', 'cf']).has(a + b);
  assert.equal(L.solutions(parent, ['a', 'b', 'c', 'd', 'e', 'f'], joins).count, 1);
  const loose = (a, b) => new Set(['ab', 'ac', 'bd', 'be', 'cf', 'cd', 'bf']).has(a + b);
  assert.equal(L.solutions(parent, ['a', 'b', 'c', 'd', 'e', 'f'], loose).count, 2);
});

test('every day uses the right shape and only reviewed answers, written their way', () => {
  for (let day = 1; day <= D.days.length; day++) {
    const p = L.daily(day, D);
    const [name, checks] = L.shapeForDay(day, D.epoch);
    assert.equal(p.parent.length, L.tree(name).parent.length, `day ${day}`);
    assert.equal(p.checks, checks);
    assert.equal(new Set(p.answer).size, p.answer.length, `day ${day} repeats a word`);
    for (const [a, b] of L.linksOf(p.parent)) {
      const pair = `${p.answer[a]} ${p.answer[b]}`;
      assert.ok(answers.has(pair), `day ${day}: ${pair} isn't a reviewed answer`);
      assert.equal(L.reads(p.answer[a], p.answer[b], D), answers.get(pair), `day ${day}: ${pair} is written wrongly`);
    }
  }
});

test('every day starts with work to do', () => {
  for (let day = 1; day <= D.days.length; day++) {
    const p = L.daily(day, D);
    assert.notEqual(p.start[0], p.answer[0], `day ${day}`);
    assert.equal(L.check(p.parent, p.start, p.answer).filter(Boolean).length, 0, `day ${day}`);
    assert.deepEqual([...p.start].sort(), [...p.answer].sort());
  }
});

test('the week grows, and the weekend has the fewest checks', () => {
  const sizes = L.WEEK.map(([name]) => L.tree(name).parent.length);
  assert.ok(sizes[1] < sizes[6] && sizes[0] >= sizes[6]);
  assert.ok(L.WEEK[0][1] <= L.WEEK[1][1]);
});

test('the shared result hides the words', () => {
  assert.equal(L.shareText(3, [[true, false], [true, true]], true), 'Splice 3 · 2 checks\n●○\n●●');
  assert.equal(L.shareText(0, [[false]], false), 'Splice practice · Not this time\n○');
});

test('every day has exactly one answer, counting every link we know and the proof words', () => {
  const proof = new Set(read('mend-words.txt').find(l => l.startsWith('proof ')).split(' ').slice(1));
  const joins = (a, b) => proof.has(a + b) || known.has(`${a} ${b}`);
  for (let day = 1; day <= D.days.length; day++) {
    const p = L.daily(day, D);
    assert.equal(L.solutions(p.parent, p.answer, joins, 2).count, 1, `day ${day}`);
  }
});

test('links are written the usual way', () => {
  assert.equal(L.reads('fire', 'work', { written: {} }), 'firework');
  assert.equal(L.reads('fire', 'alarm', { written: { 'fire alarm': 'fire alarm' } }), 'fire alarm');
  assert.equal(L.reads('ice', 'cold', { written: { 'ice cold': 'ice-cold' } }), 'ice-cold');
});
