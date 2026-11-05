// What makes a Reach puzzle fair, shared by the builder and the tests.
const { reachable, ways } = require('./reach-search.cjs');

// Sunday to Saturday: how many ways may match par. Few ways is what makes a
// day hard, so early in the week needs plenty and the weekend very few.
const WAYS_BY_WEEKDAY = [[1, 4], [5, Infinity], [5, Infinity], [8, Infinity], [8, Infinity], [8, Infinity], [1, 4]];
// The way shown after a game stays in numbers a person would try.
const PEAK = 1500;
// However hard par is, a slower way home must be there to find.
const SLOWER_WAYS = 20;

const peak = p => Math.max(...p.way.map(s => s.value));

function fair(p, weekday) {
  if (peak(p) > PEAK) return false;
  if (reachable(p.numbers, p.target, p.par - 1)) return false;
  const [least, most] = WAYS_BY_WEEKDAY[weekday];
  const n = ways(p.numbers, p.target, p.par);
  if (n < least || n > most) return false;
  return ways(p.numbers, p.target, p.par + 1) >= SLOWER_WAYS;
}

module.exports = { WAYS_BY_WEEKDAY, PEAK, SLOWER_WAYS, peak, fair };
