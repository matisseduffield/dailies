// Searches Reach puzzles, for scripts/build-reach.mjs and the tests. The page
// never searches: it only re-deals from a seed.

// Can `target` be made from `numbers` in `depth` moves or fewer? Every pair is
// tried, so a false here proves par can't be beaten.
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

// How many different ways make `target` in exactly `depth` moves. Two ways are
// the same if they're the same moves in another order.
function ways(numbers, target, depth) {
  const found = new Set();
  function search(list, left, steps) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = Math.max(list[i], list[j]), b = Math.min(list[i], list[j]);
        const rest = list.filter((_, k) => k !== i && k !== j);
        const made = [['+', a + b], ['×', a * b]];
        if (a > b) made.push(['-', a - b]);
        if (a % b === 0) made.push(['÷', a / b]);
        for (const [op, v] of made) {
          const step = `${a}${op}${b}`;
          if (left > 1) search([...rest, v], left - 1, [...steps, step]);
          else if (v === target) found.add([...steps, step].sort().join());
        }
      }
    }
  }
  search(numbers, depth, []);
  return found.size;
}

module.exports = { reachable, ways };
