// What's fair in Dated. The generator and the tests share these, so a stored day
// can only exist if it meets them.
const fs = require('node:fs');
const path = require('node:path');
const L = require('../web/dated/lib.js');

const EPOCH = '2026-11-05';   // a Thursday
const DAYS = 364;             // whole weeks, so a day stays on its weekday when the list goes round
const COOL = 60;              // no card back within this many days, round the end of the list too
const SHARED = 2;             // the most cards any two days may have in common
const CLOSE = 3;              // neighbours this many years apart or fewer are a close call
const MAX_TEXT = 60;          // two lines of a timeline row at 320 px

// Sunday first, like Date.getUTCDay(). `cards` counts the one that starts on the
// timeline. `gap` is the fewest years between any two cards; `close` the share of
// neighbouring cards that must be close calls; `span` the most years from first to
// last; `level` the hardest card allowed; `known` the share that must be level 1;
// `hard` how many must be level 3.
const WEEK = [
  { name: 'Sun', cards: 12, gap: 1, close: 0.6, span: 60, level: 3, known: 0.15, hard: 3 },
  { name: 'Mon', cards: 7, gap: 10, close: 0, span: 999, level: 2, known: 0.7, hard: 0 },
  { name: 'Tue', cards: 8, gap: 7, close: 0, span: 999, level: 2, known: 0.5, hard: 0 },
  { name: 'Wed', cards: 9, gap: 5, close: 0, span: 999, level: 2, known: 0.3, hard: 0 },
  { name: 'Thu', cards: 9, gap: 3, close: 0.1, span: 999, level: 3, known: 0.2, hard: 1 },
  { name: 'Fri', cards: 10, gap: 2, close: 0.25, span: 130, level: 3, known: 0.2, hard: 2 },
  { name: 'Sat', cards: 11, gap: 1, close: 0.45, span: 80, level: 3, known: 0.15, hard: 3 },
];

const SUBJECTS = ['tech', 'games', 'music', 'film', 'tv', 'sport', 'science', 'food', 'brands', 'internet', 'world', 'books', 'australia'];

// Every event, read from scripts/dated/<subject>.txt as year|level|text|source.
function readBank(dir = path.join(__dirname, 'dated')) {
  const bank = [];
  for (const subject of SUBJECTS) {
    fs.readFileSync(path.join(dir, subject + '.txt'), 'utf8').split('\n').forEach((line, i) => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const [year, level, text, source] = line.split('|');
      bank.push({ year: Number(year), level: Number(level), text, source, subject, keys: L.names(text), line: i + 1 });
    });
  }
  return bank;
}

// What makes an event fit to use, whatever day it lands on.
function eventProblems(e) {
  const out = [];
  if (!Number.isInteger(e.year) || e.year < 1500 || e.year > 2026) out.push('year');
  if (![1, 2, 3].includes(e.level)) out.push('level');
  if (!e.text || e.text.length > MAX_TEXT) out.push(`text ${e.text ? e.text.length : 0} long`);
  if (/\b(1[5-9]|20)\d\d\b/.test(e.text)) out.push('text gives a year away');
  if (!e.source) out.push('no source');
  return out;
}

// The numbers a day is measured by.
function measure(years) {
  const sorted = [...years].sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((y, i) => y - sorted[i]);
  return {
    cards: years.length,
    gap: Math.min(...gaps),
    close: gaps.filter(g => g <= CLOSE).length / gaps.length,
    span: sorted[sorted.length - 1] - sorted[0],
    meanGap: gaps.reduce((a, b) => a + b, 0) / gaps.length,
  };
}

// Why a day breaks its weekday's rule, if it does. `day` counts from 1.
function dayProblems(day, events) {
  const rule = WEEK[L.weekdayOf(day, EPOCH)];
  const m = measure(events.map(e => e.year));
  const out = [];
  if (m.cards !== rule.cards) out.push(`${m.cards} cards`);
  if (m.gap < rule.gap) out.push(`gap ${m.gap}`);
  if (m.close < rule.close - 1e-9) out.push(`close ${m.close.toFixed(2)}`);
  if (m.span > rule.span) out.push(`span ${m.span}`);
  if (events.some(e => e.level > rule.level)) out.push('too hard a card');
  if (events.filter(e => e.level === 1).length / m.cards < rule.known - 1e-9) out.push('too few known');
  if (events.filter(e => e.level === 3).length < rule.hard) out.push('too few surprising');
  events.forEach((a, i) => events.slice(i + 1).forEach(b => { if (L.clash(a.keys, b.keys)) out.push(`same subject: ${a.text} / ${b.text}`); }));
  const bySubject = {};
  for (const e of events) bySubject[e.subject] = (bySubject[e.subject] || 0) + 1;
  const counts = Object.values(bySubject);
  if (counts.length < 4) out.push('too few subjects');
  if (Math.max(...counts) > Math.ceil(m.cards * 0.4)) out.push('one subject too many');
  if (!bySubject.australia) out.push('nothing Australian');
  return out;
}

module.exports = { EPOCH, DAYS, COOL, SHARED, CLOSE, MAX_TEXT, WEEK, SUBJECTS, readBank, eventProblems, measure, dayProblems };
