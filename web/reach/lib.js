// Reach's pure logic: dealing a puzzle, playing moves, proving par, streaks and
// the shareable result. No DOM and no app state, so the same file runs in the
// page, in scripts/build-reach.mjs and under `node --test`.
//
// There are six numbers and a target. A move joins two numbers with + - x /,
// and the answer takes their place. Every number along the way stays a whole
// number above zero. Par is the fewest moves it can be done in.
(function (root) {
  const OPS = ['+', '-', '×', '÷'];
  const BIG = [15, 20, 25, 30, 40, 50, 60, 75, 80, 100];
  const SMALL = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  // Sunday to Saturday: it builds through the week, as Slugle does.
  const PAR_BY_WEEKDAY = [5, 3, 3, 4, 4, 4, 5];

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(list, random) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // The answer to a move, or why it can't be made.
  function apply(a, op, b) {
    if (op === '+') return { value: a + b };
    if (op === '×') return { value: a * b };
    if (op === '-') return a > b ? { value: a - b } : { refused: 'It has to stay above zero' };
    return a % b === 0 ? { value: a / b } : { refused: 'It has to divide evenly' };
  }

  // Where a game stands. A move is [from, op, to], two places on the board:
  // the answer lands in `to` and `from` empties.
  function replay(numbers, moves) {
    const slots = [...numbers];
    const steps = moves.map(([from, op, to]) => {
      const a = slots[from], b = slots[to];
      const { value } = apply(a, op, b);
      slots[from] = null;
      slots[to] = value;
      return { a, op, b, value };
    });
    return { slots, steps };
  }

  // Can `target` be made from `numbers` in `depth` moves or fewer? Every pair
  // in both orders is tried, so a false here proves par can't be beaten.
  function reachable(numbers, target, depth) {
    if (numbers.includes(target)) return true;
    if (depth === 0) return false;
    const seen = new Set();
    function search(list, left) {
      const key = list.join() + '|' + left;
      if (seen.has(key)) return false;
      seen.add(key);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = Math.max(list[i], list[j]), b = Math.min(list[i], list[j]);
          const rest = list.filter((_, k) => k !== i && k !== j);
          const made = [a + b, a * b];
          if (a > b) made.push(a - b);
          if (a % b === 0) made.push(a / b);
          for (const v of made) {
            if (v === target) return true;
            if (left > 1 && search([...rest, v].sort((x, y) => x - y), left - 1)) return true;
          }
        }
      }
      return false;
    }
    return search([...numbers].sort((x, y) => x - y), depth);
  }

  // A puzzle from a seed: six numbers, then `par` moves made at random, each
  // building on the last. The last answer is the target. Null if it fell flat;
  // the builder only keeps seeds whose par is proven (see scripts/build-reach.mjs).
  function deal(seed, par) {
    const random = rng(seed);
    const numbers = [...shuffled(BIG, random).slice(0, 2), ...shuffled(SMALL, random).slice(0, 4)].sort((a, b) => a - b);
    const pick = list => list.splice(Math.floor(random() * list.length), 1)[0];
    const left = [...numbers];
    const way = [];
    let last = pick(left);
    for (let n = 0; n < par; n++) {
      const other = pick(left);
      const a = Math.max(last, other), b = Math.min(last, other);
      const options = [['+', a + b], ['×', a * b]];
      if (a > b) options.push(['-', a - b]);
      if (a % b === 0 && b > 1) options.push(['÷', a / b]);
      const [op, value] = options[Math.floor(random() * options.length)];
      way.push({ a, op, b, value });
      last = value;
    }
    if (last < 100 || last > 999 || numbers.includes(last)) return null;
    return { numbers, target: last, par, way };
  }

  // Days count in the player's own calendar, so a new puzzle arrives at their
  // midnight. Day 1 is the epoch.
  function dayNumber(date, epoch) {
    const [y, m, d] = epoch.split('-').map(Number);
    return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(y, m - 1, d)) / 864e5) + 1;
  }
  function parForDay(day, epoch) {
    const [y, m, d] = epoch.split('-').map(Number);
    return PAR_BY_WEEKDAY[new Date(Date.UTC(y, m - 1, d + day - 1)).getUTCDay()];
  }
  const seedFor = (day, offset) => day * 4096 + offset;

  // Each day's offset is the first seed the builder could prove. The list goes
  // round at its end; the seed is the same, but the weekday's par may not be,
  // so a repeat uses the day it was built for.
  function daily(day, data) {
    const n = data.offsets.length;
    const at = ((day - 1) % n) + 1;
    return deal(seedFor(at, data.offsets[at - 1]), parForDay(at, data.epoch));
  }

  // Days solved in a row, up to today (or yesterday, if today isn't done yet).
  function streak(solvedDays, today) {
    const solved = new Set(solvedDays);
    let day = solved.has(today) ? today : today - 1;
    let n = 0;
    while (solved.has(day)) { n++; day--; }
    return n;
  }

  function bestStreak(solvedDays) {
    const days = [...new Set(solvedDays)].sort((a, b) => a - b);
    let best = 0, run = 0;
    days.forEach((d, i) => { run = i && d === days[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); });
    return best;
  }

  // Shows the operators used and hides the numbers.
  function shareText(day, steps, par, gaveUp = false) {
    const head = day ? `Reach ${day}` : 'Reach practice';
    if (gaveUp) return `${head} · Gave up, par ${par}`;
    return `${head} · ${steps.length} ${steps.length === 1 ? 'move' : 'moves'}, par ${par}\n${steps.map(s => s.op).join(' ')}`;
  }

  const lib = { OPS, PAR_BY_WEEKDAY, rng, apply, replay, reachable, deal, dayNumber, parForDay, seedFor, daily, streak, bestStreak, shareText };
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.ReachLib = lib;
})(this);
