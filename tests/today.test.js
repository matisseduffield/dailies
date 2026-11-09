const test = require('node:test');
const assert = require('node:assert');
const { todayText } = require('../web/today.js');

const DAY = 'Mon Nov 09 2026';
const opts = (extra = {}) => ({ day: DAY, date: 'Mon 9 Nov', total: 9, dark: false, site: 'dailies.teloone.au', ...extra });

test('Share today has a line for each game played today, in order', () => {
  const entries = [
    ['Slugle', { date: DAY, text: 'Solved in 5, par 5', card: 'Slugle 5 · par 5 🟩🟩🟩🟩🟩' }],
    ['Hunch', null],
    ['Sorted', { date: 'Sun Nov 08 2026', text: '1 mistake', card: 'Sorted 1 mistake 🟨🟥🟩🟦🟪' }],
    ['Splice', { date: DAY, text: 'Solved with 2 checks', card: 'Splice 2 checks ⬜🟩' }],
  ];
  assert.equal(todayText(entries, opts()), 'Dailies · Mon 9 Nov · 2 of 9\nSlugle 5 · par 5 🟩🟩🟩🟩🟩\nSplice 2 checks ⬜🟩\ndailies.teloone.au');
});

test('Share today turns the blank square black in dark mode', () => {
  const entries = [['Hunch', { date: DAY, text: 'Got it in 3', card: 'Hunch 3/6 ⬜⬜🟩' }]];
  assert.equal(todayText(entries, opts({ dark: true })).split('\n')[1], 'Hunch 3/6 ⬛⬛🟩');
});

test('a result from before cards gives its words in the same shape', () => {
  const entries = [
    ['Cluey', { date: DAY, text: '2:31, clean' }],
    ['Reach', { date: DAY, text: 'Gave up', card: '' }],
  ];
  assert.deepEqual(todayText(entries, opts()).split('\n').slice(1, 3), ['Cluey 2:31 · clean', 'Reach gave up']);
});

test('nothing played today, nothing to share', () => {
  assert.equal(todayText([['Slugle', { date: 'Sun Nov 08 2026', text: 'x', card: 'y' }], ['Hunch', null]], opts()), '');
});
