// The time the games go by. Moving the phone's clock or time zone mustn't bring
// tomorrow's puzzle early, so the day comes from our server: the app keeps a
// server reading (see TrustedClock.kt), and on the site the Worker writes one
// into each page. The phone's own clock is only used before any reading exists,
// such as a first open with no connection or a local preview.
(function (root) {
  const zoneAt = time => -new Date(time).getTimezoneOffset();

  // A Date whose local fields show the player's wall clock, so it goes anywhere
  // `new Date()` would. The server's zone comes from the connection and can be
  // off by a little, so the phone may hold the day back but never bring it on.
  function wall({ now, offset }) {
    const zone = zoneAt(now);
    const at = new Date(now + (offset == null ? zone : Math.min(offset, zone)) * 6e4);
    return new Date(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(),
      at.getUTCHours(), at.getUTCMinutes(), at.getUTCSeconds());
  }

  let site = null;   // the page's reading, and when it was taken
  const keep = reading => { site = { ...reading, mark: performance.now() }; };

  function reading() {
    if (root.ladderClock) {
      try { return JSON.parse(root.ladderClock.read()); } catch { return null; }
    }
    return site && { now: site.now + performance.now() - site.mark, offset: site.offset };
  }

  function now() {
    const known = reading();
    return known ? wall(known) : new Date();
  }

  // A page left open on the site can sleep through midnight.
  async function refresh() {
    try {
      const res = await fetch('/now', { cache: 'no-store' });
      keep(await res.json());
      root.dispatchEvent(new Event('clock'));
    } catch {}
  }

  if (root.serverClock) {
    keep(root.serverClock);
    root.document.addEventListener('visibilitychange', () => { if (!root.document.hidden) refresh(); });
    root.addEventListener('pageshow', e => { if (e.persisted) refresh(); });
  }

  // Someone mid-game at midnight finishes the day they're on before the new one
  // takes its place; coming back to it hours later, they get the new day.
  let touched = -Infinity;
  if (root.addEventListener) for (const type of ['pointerdown', 'keydown']) root.addEventListener(type, () => { touched = Date.now(); }, true);
  const playing = () => Date.now() - touched < 30 * 6e4;

  // Whether a page keeps the day it shows once the clock has moved on: a game
  // in hand stays to be finished, and one finished after midnight, or in the
  // last minutes before it, keeps its result up, so it isn't swapped for an
  // empty board while it's being read or shared. A game finished earlier isn't
  // held. Either lets go after a long break, or when the player moves on (a
  // reload, Practice).
  let held = null;
  function hold(day, started, done) {
    if (!started || !playing()) return false;
    if (!done) held = day;
    return held === day;
  }
  // A game has just ended on `day` with the clock on `current`: hold() keeps it
  // if that was after midnight, even with no check of the day in between.
  function keepDay(day, current) {
    const at = now();
    if (current !== day || (at.getHours() === 23 && at.getMinutes() >= 55)) held = day;
  }

  // The result's line about the next game: a countdown to midnight, or, while
  // a held day is still on screen, that the next one is out.
  function untilNext(noun, shown, today) {
    if (shown !== today) return `Next ${noun} is out`;
    const at = now();
    const mins = Math.max(1, Math.ceil((new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1) - at) / 6e4));
    return `Next ${noun} in ${mins >= 60 ? `${Math.floor(mins / 60)} h ` : ''}${mins % 60} min`;
  }

  const Clock = { now, wall, playing, hold, keep: keepDay, untilNext };
  root.Clock = Clock;
  if (typeof module === 'object' && module.exports) module.exports = Clock;
})(globalThis);
