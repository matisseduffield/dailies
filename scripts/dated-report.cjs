// Prints how the week measures up: what the generator holds each weekday to, and how
// simulated players get on. `node scripts/dated-report.cjs`
const L = require('../web/dated/lib.js');
const D = require('../web/dated/days.js');
const R = require('./dated-rules.cjs');

const bank = R.readBank();
const levelOf = new Map(bank.map(e => [e.text, e]));
const round = (n, d = 1) => Number(n.toFixed(d));
const mean = list => list.reduce((a, b) => a + b, 0) / list.length;

// A player with a hunch about every year: the truth plus some error, which grows the
// less known the event is, and for older events. They place each card where the hunch
// falls among the true years already showing.
function play(cards, random, skill) {
  const hunch = c => {
    const known = levelOf.get(c.text);
    const age = c.year < 1950 ? 1.6 : 1;
    const spread = [0, 3, 7, 13][known.level] * age * skill;
    const noise = (random() + random() + random() - 1.5) * 2 * spread;
    return c.year + noise;
  };
  const moves = [];
  for (;;) {
    const now = L.replay(cards, moves);
    if (now.over) return now;
    const guess = hunch(now.next);
    moves.push(now.line.filter(c => c.year < guess).length);
  }
}

const random = L.rng(7);
const rows = R.WEEK.map(() => []);
D.days.forEach((_, at) => {
  const day = at + 1;
  const { cards } = L.daily(day, D);
  rows[L.weekdayOf(day, D.epoch)].push(cards);
});

console.log('Day  Cards  Gap rule  Min gap  Close  Mean gap  Span  Lvl1  Lvl3  | Good player: finish, lives | Keen player: finish, lives');
for (const w of [1, 2, 3, 4, 5, 6, 0]) {
  const list = rows[w];
  const ms = list.map(c => R.measure(c.map(x => x.year)));
  const lv = n => mean(list.map(c => c.filter(x => levelOf.get(x.text).level === n).length));
  const sim = skill => {
    const runs = [];
    for (const cards of list) for (let i = 0; i < 40; i++) runs.push(play(cards, random, skill));
    return `${Math.round(mean(runs.map(r => (r.won ? 1 : 0))) * 100)}%, ${round(mean(runs.map(r => r.lives)))}`;
  };
  console.log([R.WEEK[w].name, list[0].length, R.WEEK[w].gap, Math.min(...ms.map(m => m.gap)), `${Math.round(mean(ms.map(m => m.close)) * 100)}%`,
    round(mean(ms.map(m => m.meanGap))), Math.round(mean(ms.map(m => m.span))), round(lv(1)), round(lv(3)), '|', sim(1), '|', sim(1.6)].join('  '));
}

const uses = new Map();
const seenDays = D.days.map(d => L.unpack(d));
seenDays.forEach(ids => ids.forEach(id => uses.set(id, (uses.get(id) || 0) + 1)));
const count = {};
for (const e of bank) count[e.subject] = (count[e.subject] || 0) + 1;
console.log('\nEvents by subject:', JSON.stringify(count), 'total', bank.length);
console.log('Levels:', [1, 2, 3].map(n => `${n}: ${bank.filter(e => e.level === n).length}`).join(', '));
console.log(`Used: ${uses.size} of ${D.years.length}; ${Math.min(...uses.values())} to ${Math.max(...uses.values())} times each`);
const dates = new Date(Date.UTC(2026, 10, 5 + D.days.length));
console.log(`Days: ${D.days.length}; the list goes round on ${dates.toISOString().slice(0, 10)}`);
