const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const L = require('../web/splice/lib.js');
const D = require('../web/splice/days.js');

// The links the builder allows, read the same way it reads them.
const words = fs.readFileSync(`${__dirname}/../scripts/splice-words.txt`, 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split(' '));
const phrases = fs.existsSync(`${__dirname}/../scripts/splice-phrases.txt`)
  ? fs.readFileSync(`${__dirname}/../scripts/splice-phrases.txt`, 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split(' '))
  : [];
const allowed = new Set([...words.map(([, a, b]) => `${a} ${b}`), ...phrases.map(([a, b]) => `${a} ${b}`)]);

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

test('every day uses the right shape and only allowed links', () => {
  for (let day = 1; day <= D.days.length; day++) {
    const p = L.daily(day, D);
    const [name, checks] = L.shapeForDay(day, D.epoch);
    assert.equal(p.parent.length, L.tree(name).parent.length, `day ${day}`);
    assert.equal(p.checks, checks);
    assert.equal(new Set(p.answer).size, p.answer.length, `day ${day} repeats a word`);
    for (const [a, b] of L.linksOf(p.parent)) assert.ok(allowed.has(`${p.answer[a]} ${p.answer[b]}`), `day ${day}: ${p.answer[a]} ${p.answer[b]}`);
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

test('every day has exactly one answer, counting any word in the proof list', () => {
  const proofLine = fs.readFileSync(`${__dirname}/../scripts/mend-words.txt`, 'utf8').split('\n').find(l => l.startsWith('proof '));
  const proof = new Set(proofLine.split(' ').slice(1));
  for (const [w] of words) proof.add(w);
  const joins = (a, b) => proof.has(a + b) || allowed.has(`${a} ${b}`);
  for (let day = 1; day <= D.days.length; day++) {
    const p = L.daily(day, D);
    assert.equal(L.solutions(p.parent, p.answer, joins, 2).count, 1, `day ${day}`);
  }
});

test('phrases read as two words, joined words as one', () => {
  assert.equal(L.reads('fire', 'work', { spaced: [] }), 'firework');
  assert.equal(L.reads('fire', 'alarm', { spaced: ['fire alarm'] }), 'fire alarm');
});
