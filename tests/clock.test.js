const test = require('node:test');
const assert = require('node:assert');

process.env.TZ = 'Australia/Sydney';   // UTC+11 on these dates
const Clock = require('../web/clock.js');

const NOON_UTC = Date.UTC(2026, 10, 5, 12, 0, 0);   // 11 pm in Sydney, the 5th

const fields = d => [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()];

test('the time comes from the reading, not the phone', () => {
  assert.deepStrictEqual(fields(Clock.wall({ now: NOON_UTC, offset: 660 })), [2026, 11, 5, 23]);
});

test('a phone zone ahead of the connection brings nothing early', () => {
  // The player is in Perth, UTC+8, with the phone set to Sydney.
  assert.deepStrictEqual(fields(Clock.wall({ now: NOON_UTC, offset: 480 })), [2026, 11, 5, 20]);
  // Past midnight on the phone, still the 5th where the connection is.
  const later = NOON_UTC + 2 * 36e5;
  assert.strictEqual(fields(Clock.wall({ now: later, offset: 480 }))[2], 5);
});

test('a phone zone behind the connection only holds the day back', () => {
  // The connection is in Kiritimati, UTC+14, the phone in Sydney.
  assert.strictEqual(fields(Clock.wall({ now: NOON_UTC, offset: 840 }))[2], 5);
});

test('with no zone from the server the phone zone is used', () => {
  assert.deepStrictEqual(fields(Clock.wall({ now: NOON_UTC, offset: null })), [2026, 11, 5, 23]);
});

test('midnight falls where the reading says', () => {
  const justBefore = Date.UTC(2026, 10, 5, 12, 59, 59);
  assert.strictEqual(fields(Clock.wall({ now: justBefore, offset: 660 }))[2], 5);
  assert.strictEqual(fields(Clock.wall({ now: justBefore + 1000, offset: 660 }))[2], 6);
});

test('before any reading the phone clock is all there is', () => {
  const before = Date.now();
  const now = Clock.now().getTime();
  assert.ok(now >= before && now <= Date.now());
});

test('the app reading wins over the phone clock', () => {
  globalThis.ladderClock = { read: () => JSON.stringify({ now: NOON_UTC, offset: 660 }) };
  assert.deepStrictEqual(fields(Clock.now()), [2026, 11, 5, 23]);
  globalThis.ladderClock = { read: () => '' };
  assert.ok(Math.abs(Clock.now() - Date.now()) < 5000);
  delete globalThis.ladderClock;
});
