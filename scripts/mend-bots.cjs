// Simulated players, so "harder" and "sloppy players fail" are measured rather
// than assumed. Every player sees only what a person sees: the letters, the
// colours and what it's tried so far. None is told the answer.
//
//   sloppy  no vocabulary at all. Follows the colours: moves yellows along their
//           word and greys elsewhere, and remembers what it's already tried.
//   decent  knows common words, and each of the rarer ones with some chance,
//           and looks at one word at a time.
//   sharp   knows every answer word, and checks crossing words against each other
//
// A person is somewhere among these. Nobody is as good as the proof, which
// reads the whole board at once.
const L = require('../web/mend/lib.js');

// What a word could be, going on the colours. Tiles that are green fix a letter,
// a tile that isn't green rules its letter out of that place, and each place's
// past letters stay ruled out. Letters must come from what's loose on the board.
function candidates(shape, board, marks, wordIndex, vocab, ruled) {
  const word = shape.words[wordIndex];
  const loose = new Int8Array(26);
  board.forEach((ch, i) => { if (marks[i] !== 'hit') loose[ch.charCodeAt(0) - 97]++; });
  // A letter a word shows yellow in a tile of its own must be in the word; a
  // grey one can't be, past what's lit.
  const must = new Int8Array(26);
  const most = new Int8Array(26).fill(99);
  const lit = new Int8Array(26);
  const greyed = new Set();
  for (const t of word) {
    const c = board[t].charCodeAt(0) - 97;
    if (marks[t] === 'near') { lit[c]++; if (shape.wordsOf[t].length === 1) must[c]++; }
    if (marks[t] === 'miss') greyed.add(c);
  }
  for (const c of greyed) most[c] = lit[c];
  const out = [];
  next: for (const w of vocab[word.length] || []) {
    const seen = new Int8Array(26);
    for (let i = 0; i < word.length; i++) {
      const t = word[i], ch = w[i];
      if (marks[t] === 'hit') { if (ch !== board[t]) continue next; continue; }
      if (ch === board[t] || (ruled && ruled[t].has(ch))) continue next;
      const c = ch.charCodeAt(0) - 97;
      if (++seen[c] > loose[c] || seen[c] > most[c]) continue next;
    }
    for (let c = 0; c < 26; c++) if (seen[c] < must[c]) continue next;
    out.push(w);
  }
  return out;
}

// Keep only words whose crossing letters some word on the crossing agrees with.
function agree(shape, lists) {
  let changed = true;
  while (changed) {
    changed = false;
    lists.forEach((list, a) => {
      const word = shape.words[a];
      const kept = list.filter(w => word.every((t, i) => shape.wordsOf[t].every(b => {
        if (b === a) return true;
        const at = shape.words[b].indexOf(t);
        return lists[b].some(v => v[at] === w[i]);
      })));
      if (kept.length < list.length && kept.length) { lists[a] = kept; changed = true; }
    });
  }
  return lists;
}

function play(shape, start, answer, swaps, choose) {
  const board = [...start];
  const ruled = board.map(() => new Set());
  let used = 0;
  while (used < swaps) {
    const marks = L.marks(shape, board, answer);
    if (marks.every(m => m === 'hit')) return swaps - used;
    marks.forEach((m, i) => { if (m !== 'hit') ruled[i].add(board[i]); });
    const [a, b] = choose(board, marks, ruled);
    if (L.refusal(board, answer, a, b)) throw new Error('bot tried a refused swap');
    [board[a], board[b]] = [board[b], board[a]];
    used++;
  }
  return L.solved(board, answer) ? 0 : -1;
}

const pickFrom = (list, random) => list[Math.floor(random() * list.length)];

function sloppy(shape, random) {
  return (board, marks, ruled) => {
    const free = board.map((_, i) => i).filter(i => marks[i] !== 'hit');
    // Yellows first: they're the ones that look nearly right.
    const near = free.filter(i => marks[i] === 'near');
    for (let tries = 0; tries < 40; tries++) {
      const a = pickFrom(near.length ? near : free, random);
      const mates = marks[a] === 'near' ? shape.wordsOf[a].flatMap(w => shape.words[w]) : free;
      const options = mates.filter(b => b !== a && marks[b] !== 'hit' && board[a] !== board[b] && !ruled[b].has(board[a]));
      if (options.length) return [a, pickFrom(options, random)];
    }
    for (;;) {
      const a = pickFrom(free, random), b = pickFrom(free, random);
      if (a !== b && board[a] !== board[b]) return [a, b];
    }
  };
}

// Reads the board a word at a time: takes the word it's surest of and starts
// putting its letters in. Having more than one idea, it goes with the likeliest.
//
// `spot`, if given, is the chance of a word coming to mind on a look at the
// board; it has `looks` looks before it gives up and moves something anyway. A
// person doesn't run through two thousand words: a word comes to them, more
// easily if it's common and if much of it is already green.
function reader(shape, vocab, random, { crossCheck, spot, looks = 1 }) {
  const fallback = sloppy(shape, random);
  return (board, marks, ruled) => {
    const every = shape.words.map((_, w) => candidates(shape, board, marks, w, vocab, ruled));
    const open = shape.words.map((_, w) => w).filter(w => shape.words[w].some(t => marks[t] !== 'hit'));
    let lists, known = [];
    for (let look = 0; look < looks && !known.length; look++) {
      lists = spot ? every.map((list, w) => {
        const greens = shape.words[w].filter(t => marks[t] === 'hit').length / shape.words[w].length;
        return list.filter(word => random() < spot(word, greens));
      }) : every;
      if (crossCheck) lists = agree(shape, lists);
      known = open.filter(w => lists[w].length).sort((a, b) => lists[a].length - lists[b].length);
    }
    if (!known.length) return fallback(board, marks, ruled);
    // Places every candidate of a word agrees on are safe to fill first.
    const w = known[0];
    const word = shape.words[w];
    const guess = pickFrom(lists[w], random);
    const firm = word.map((t, i) => (lists[w].every(c => c[i] === guess[i]) ? i : -1)).filter(i => i >= 0 && marks[word[i]] !== 'hit');
    const order = [...firm, ...word.map((t, i) => i).filter(i => marks[word[i]] !== 'hit' && !firm.includes(i))];
    for (const i of order) {
      const place = word[i];
      if (board[place] === guess[i]) continue;
      // A tile with the wanted letter, not already sat where a word needs it.
      const sources = board.map((ch, s) => s).filter(s => s !== place && board[s] === guess[i] && marks[s] !== 'hit' && !word.includes(s));
      const inWord = word.filter((s, j) => s !== place && board[s] === guess[i] && marks[s] !== 'hit' && guess[j] !== board[s]);
      const options = [...sources, ...inWord];
      if (!options.length) continue;
      // Best of all if the tile sent away is wanted where it lands.
      const fair = options.filter(s => board[place] !== board[s]);
      if (!fair.length) continue;
      const twoForOne = fair.filter(s => shape.wordsOf[s].some(v => {
        const at = shape.words[v].indexOf(s);
        return lists[v].length === 1 && lists[v][0][at] === board[place];
      }));
      return [place, pickFrom(twoForOne.length ? twoForOne : fair, random)];
    }
    return fallback(board, marks, ruled);
  };
}

// A vocabulary with each word of the rarest size known by chance.
function vocabulary(tiers, knowRare, random) {
  const out = {};
  for (const size of [10, 20, 35]) {
    for (const w of tiers[size]) {
      if (size === 35 && random() > knowRare) continue;
      (out[w.length] ??= []).push(w);
    }
  }
  return out;
}

module.exports = { candidates, agree, play, sloppy, reader, vocabulary };
