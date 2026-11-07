// Checks clues as they're written, a range of days at a time, by the same rules as
// the build and the tests, without needing puzzles.js to exist yet.
//
//   node scripts/cluey-check.cjs 211 245          every fault in those days
//   node scripts/cluey-check.cjs --show 211 245   each day to write: its grid, each
//                                                 answer and level, and clues used
//                                                 for that answer before
//   node scripts/cluey-check.cjs --names          names that can't be used again
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const R = require('./cluey-rules.cjs');
const L = require('../web/cluey/lib.js');

const DIR = path.join(__dirname, 'cluey');
const EPOCH = '2026-11-05';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function readBank() {
  const bank = new Map(), faults = [];
  for (const f of readdirSync(DIR).filter(n => /^clues-.*\.txt$/.test(n)).sort()) {
    let day = 0;
    readFileSync(path.join(DIR, f), 'utf8').split('\n').forEach((line, i) => {
      if (!line.trim() || line.startsWith('#')) return;
      const head = line.match(/^day (\d+)$/);
      if (head) { day = Number(head[1]); bank.set(day, new Map()); return; }
      const m = line.match(/^([a-z]+) ([123]) ([dbxcpwn]) (\S.*\S)$/);
      if (!m || !day) { faults.push({ day, text: `${f}:${i + 1} can't read: ${line}` }); return; }
      if (/—|–/.test(line)) faults.push({ day, text: `${f}:${i + 1} has a long dash` });
      bank.get(day).set(m[1], { word: m[1], level: Number(m[2]), tag: m[3], clue: m[4] });
    });
  }
  return { bank, faults };
}

const grids = readFileSync(path.join(DIR, 'grids.txt'), 'utf8').split('\n').filter(Boolean).map(l => {
  const [grid, levels] = l.split(' ');
  return { grid, levels: [...levels].map(Number) };
});

function readVerified() {
  const lines = readFileSync(path.join(DIR, 'verified.txt'), 'utf8').split('\n');
  for (const f of readdirSync(DIR).filter(n => /^verified-.*\.txt$/.test(n))) lines.push(...readFileSync(path.join(DIR, f), 'utf8').split('\n'));
  return lines.filter(Boolean);
}

function faultsIn(from, to) {
  const { bank, faults } = readBank();
  const out = faults.filter(f => f.day >= from && f.day <= to).map(f => f.text);
  const verified = readVerified();
  const inRange = d => d >= from && d <= to;
  const seen = new Map();   // clue -> day, over the whole bank
  for (const [day, clues] of bank) for (const c of clues.values()) {
    const k = c.clue.toLowerCase();
    if (seen.has(k) && (inRange(day) || inRange(seen.get(k)))) out.push(`clue used twice, days ${seen.get(k)} and ${day}: ${c.clue}`);
    seen.set(k, day);
  }
  for (let day = from; day <= to; day++) {
    const d = grids[day - 1];
    const clues = bank.get(day);
    if (!clues) { out.push(`day ${day}: no clues`); continue; }
    const list = R.entries(d.grid);
    const words = list.map(e => e.word);
    for (const w of clues.keys()) if (!words.includes(w)) out.push(`day ${day}: ${w} isn't in the grid`);
    const have = [];
    list.forEach((e, k) => {
      const c = clues.get(e.word);
      if (!c) { out.push(`day ${day}: ${e.word} has no clue`); return; }
      have.push(c);
      if (c.level !== d.levels[k]) out.push(`day ${day} ${e.word}: level ${c.level}, grid says ${d.levels[k]}`);
      const fault = R.clueFault(c.clue, e.word, words);
      if (fault) out.push(`day ${day} ${e.word}: ${fault}: ${c.clue}`);
      if (c.tag === 'n') {
        const line = verified.find(l => l.startsWith(`${day} ${e.word} | ${c.clue} |`));
        if (!line) out.push(`day ${day} ${e.word}: no verified line for: ${c.clue}`);
        else if (!/https?:|common knowledge/.test(line)) out.push(`day ${day} ${e.word}: no source on its verified line`);
      }
    });
    if (have.length === list.length) {
      const fault = R.mixFault(have);
      if (fault) out.push(`day ${day}: ${fault}`);
      const blanks = have.filter(c => c.level === 3 && c.clue.includes('___'));
      if (blanks.length > 1) out.push(`day ${day}: two level 3 blanks`);
    }
  }
  const every = [...bank].flatMap(([day, clues]) => [...clues.values()].map(c => ({ day, word: c.word, clue: c.clue })));
  for (const f of R.recycled(every)) {
    const days = [...f.matchAll(/\b(\d+) (?:[a-z]+|")/g)].map(m => Number(m[1]));
    if (days.some(inRange)) out.push(`recycled: ${f}`);
  }
  return out;
}

function show(from, to) {
  const { bank } = readBank();
  const earlier = new Map();
  for (const [day, clues] of bank) for (const c of clues.values()) (earlier.get(c.word) || earlier.set(c.word, []).get(c.word)).push(`${day}: ${c.clue}`);
  for (let day = from; day <= to; day++) {
    const d = grids[day - 1];
    const date = new Date(Date.UTC(2026, 10, 4 + day)).toISOString().slice(0, 10);
    console.log(`\nday ${day}  ${DAYS[L.weekdayOf(day, EPOCH)]} ${date}  levels 1/2/3: ${R.WEEK[L.weekdayOf(day, EPOCH)].mix.join('/')}`);
    console.log(d.grid.split('/').map(r => '  ' + [...r].join(' ').toUpperCase()).join('\n'));
    const p = L.parse([d.grid, ...d.levels.map(l => `${l}dx`)]);
    p.entries.forEach(e => {
      const old = (earlier.get(e.word) || []).filter(c => !c.startsWith(`${day}:`));
      console.log(`${L.label(e).padEnd(4)}${e.word} ${e.level}${old.length ? '   already: ' + old.join(' / ') : ''}`);
    });
  }
}

function names() {
  const { bank } = readBank();
  const every = [...bank].flatMap(([day, clues]) => [...clues.values()].map(c => ({ day, clue: c.clue })));
  const count = new Map();
  for (const c of every) for (const r of R.references(c.clue)) count.set(r, (count.get(r) || 0) + 1);
  console.log([...count].filter(([, n]) => n >= 2).map(([k]) => k).sort().join(' '));
}

const args = process.argv.slice(2);
if (args[0] === '--names') names();
else if (args[0] === '--show') show(Number(args[1]), Number(args[2]));
else {
  const from = Number(args[0]) || 1, to = Number(args[1]) || grids.length;
  const list = faultsIn(from, to);
  console.log(list.join('\n') || 'clean');
  console.log(`${list.length} faults, days ${from} to ${to}`);
  process.exit(list.length ? 1 : 0);
}
