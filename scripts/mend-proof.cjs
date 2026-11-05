// The two things Mend proves about every board, by exhaustive search. They run
// in the builder and the tests, never on a phone.
//
//   solutions()   every way to arrange a board's letters so all its words are real
//   fewestSwaps() the exact fewest swaps from a mixed-up board to the answer

function wordIndex(words) {
  const byLength = {};
  for (const w of words) (byLength[w.length] ??= []).push(w);
  return byLength;
}

// How many letters of each kind a board has.
function tally(letters) {
  const counts = new Int8Array(26);
  for (const ch of letters) counts[ch.charCodeAt(0) - 97]++;
  return counts;
}

function fits(word, counts) {
  const need = new Int8Array(26);
  for (let i = 0; i < word.length; i++) {
    const c = word.charCodeAt(i) - 97;
    if (++need[c] > counts[c]) return false;
  }
  return true;
}

// Every arrangement of `letters` on the shape where each word is in `byLength`,
// stopping at `limit`. It goes through the words one at a time, trying every word
// the unused letters can spell that agrees with the crossings so far, so nothing
// is skipped: if it finds one, that really is the only one.
function solutions(shape, letters, byLength, limit = 2) {
  const counts = tally(letters);
  const grid = new Array(shape.cells.length).fill(null);
  const found = [];
  // What this board's letters can spell, indexed by letter and place.
  const lists = {};
  for (const len of new Set(shape.words.map(w => w.length))) {
    const all = (byLength[len] || []).filter(w => fits(w, counts));
    const index = Array.from({ length: len }, () => new Map());
    for (const w of all) {
      for (let i = 0; i < len; i++) {
        const m = index[i];
        if (!m.has(w[i])) m.set(w[i], []);
        m.get(w[i]).push(w);
      }
    }
    lists[len] = { all, index };
  }
  const open = shape.words.map(() => true);
  // Always the word with the fewest options left: most is ruled out soonest.
  function pick() {
    let best = -1, size = Infinity;
    shape.words.forEach((word, w) => {
      if (!open[w]) return;
      const { all, index } = lists[word.length];
      let n = all.length;
      word.forEach((tile, i) => {
        if (grid[tile] === null) return;
        const list = index[i].get(grid[tile]);
        n = Math.min(n, list ? list.length : 0);
      });
      if (n < size) { size = n; best = w; }
    });
    return best;
  }
  function fill(left) {
    if (found.length >= limit) return;
    if (left === 0) { found.push(grid.join('')); return; }
    const at = pick();
    const word = shape.words[at];
    const { all, index } = lists[word.length];
    // Start from the shortest list a crossing allows.
    let pool = all;
    const fixed = [];
    for (let i = 0; i < word.length; i++) {
      const ch = grid[word[i]];
      if (ch === null) continue;
      fixed.push(i);
      const list = index[i].get(ch);
      if (!list) return;
      if (list.length < pool.length) pool = list;
    }
    open[at] = false;
    next: for (const w of pool) {
      for (const i of fixed) if (w[i] !== grid[word[i]]) continue next;
      const placed = [];
      let ok = true;
      for (let i = 0; i < word.length; i++) {
        if (grid[word[i]] !== null) continue;
        const c = w.charCodeAt(i) - 97;
        if (counts[c] === 0) { ok = false; break; }
        counts[c]--;
        grid[word[i]] = w[i];
        placed.push(i);
      }
      if (ok) fill(left - 1);
      for (const i of placed) { counts[w.charCodeAt(i) - 97]++; grid[word[i]] = null; }
      if (found.length >= limit) break;
    }
    open[at] = true;
  }
  fill(shape.words.length);
  return found;
}

// The fewest swaps from `board` to `answer`, both lists of letters.
//
// Draw an arrow for every tile out of place, from the letter it shows to the
// letter its place wants. Each letter has as many arrows in as out, so the
// arrows split into closed loops, and a loop of k arrows takes k - 1 swaps. A
// swap can add at most one loop to a split, so the fewest swaps is the misplaced
// tiles less the most loops any split can have. With no repeated letters there's
// only one split; repeated letters give a choice, so this tries every split that
// matters, remembering arrow sets it has seen.
function fewestSwaps(board, answer) {
  const arrows = new Map();   // "from to" -> how many
  let misplaced = 0;
  board.forEach((letter, i) => {
    if (letter === answer[i]) return;
    misplaced++;
    const key = letter + answer[i];
    arrows.set(key, (arrows.get(key) || 0) + 1);
  });
  const keys = [...arrows.keys()].sort();
  const seen = new Map();
  const out = new Map();
  for (const k of keys) { if (!out.has(k[0])) out.set(k[0], []); out.get(k[0]).push(k); }

  function most(left) {
    const id = keys.map(k => left.get(k)).join();
    if (seen.has(id)) return seen.get(id);
    const first = keys.find(k => left.get(k) > 0);
    if (!first) return 0;
    let best = 0;
    // Every arrow is in some loop, so it's enough to try each simple loop
    // through the first one left.
    const start = first[0];
    const used = new Set([start]);
    function walk(from) {
      for (const k of out.get(from) || []) {
        if (!left.get(k)) continue;
        const to = k[1];
        if (to === start) {
          left.set(k, left.get(k) - 1);
          best = Math.max(best, 1 + most(left));
          left.set(k, left.get(k) + 1);
        } else if (!used.has(to)) {
          used.add(to);
          left.set(k, left.get(k) - 1);
          walk(to);
          left.set(k, left.get(k) + 1);
          used.delete(to);
        }
      }
    }
    left.set(first, left.get(first) - 1);
    if (first[1] === start) best = 1 + most(left);
    else { used.add(first[1]); walk(first[1]); }
    left.set(first, left.get(first) + 1);
    seen.set(id, best);
    return best;
  }
  return misplaced - most(arrows);
}

module.exports = { wordIndex, tally, fits, solutions, fewestSwaps };
