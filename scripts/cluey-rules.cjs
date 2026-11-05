// What makes a fair Cluey, shared by scripts/build-cluey.mjs and the tests.
//
// A grid is rows joined with "/", letters for cells and # for blocks. Every
// grid turns the same way up when spun half a turn, and every letter sits in an
// across and a down answer of three letters or more.
//
// Clue levels: 1 plain, 2 takes a moment, 3 misdirects. The week builds through
// how many cells there are and how many clues are level 3, and Monday and
// Tuesday keep to common answers. SCOWL size is how common a word is (10 is the
// most common; 35 is still everyday).
const WEEK = {
  // weekday (0 Sunday): grid size, blocks allowed, clues at levels 1/2/3, and
  // how many answers may be less common than SCOWL size 20
  1: { size: 5, blocks: [4, 6], mix: [10, 0, 0], rare: 4 },
  2: { size: 5, blocks: [4, 6], mix: [6, 4, 0], rare: 6 },
  3: { size: 5, blocks: [2, 4, 6], mix: [2, 8, 0], rare: 10 },
  4: { size: 5, blocks: [0, 2, 4], mix: [0, 6, 4], rare: 10 },
  5: { size: 6, blocks: [6, 8, 10], mix: [0, 5, 7], rare: 12 },
  6: { size: 7, blocks: [13, 15], mix: [0, 2, 14], rare: 16 },
  0: { size: 7, blocks: [13, 15], mix: [0, 2, 14], rare: 16 },
};

const REPEAT_GAP = 60;      // an answer waits at least this many days to come back
const MAX_SHARED = 1 / 3;   // of the smaller grid's answers, between any two days in the list
const MAX_CLUE = 58;        // characters, so a clue fits two lines at 320 px wide

// One number for a day: every clue scores its level, and every cell a little
// because each is one more letter to find.
function difficulty(grid, levels) {
  const cells = grid.replace(/[#/]/g, '').length;
  return levels.reduce((n, l) => n + l, 0) + cells / 4;
}

function rows(grid) { return grid.split('/'); }

// Every answer in a grid, across first. Each has its cells as [row, column].
function entries(grid) {
  const g = rows(grid), n = g.length, out = [];
  for (const [dr, dc] of [[0, 1], [1, 0]]) {
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (g[r][c] === '#') continue;
      const pr = r - dr, pc = c - dc;
      if (pr >= 0 && pc >= 0 && g[pr][pc] !== '#') continue;
      const cells = [];
      for (let a = r, b = c; a < n && b < n && g[a][b] !== '#'; a += dr, b += dc) cells.push([a, b]);
      out.push({ across: dc === 1, cells, word: cells.map(([a, b]) => g[a][b]).join('') });
    }
  }
  return out;
}

// Why a grid isn't allowed, or null.
function gridFault(grid) {
  const g = rows(grid), n = g.length;
  if (g.some(r => r.length !== n)) return 'not square';
  if (!/^[a-z#/]+$/.test(grid)) return 'odd characters';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if ((g[r][c] === '#') !== (g[n - 1 - r][n - 1 - c] === '#')) return 'not symmetric';
  }
  const list = entries(grid);
  if (list.some(e => e.word.length < 3)) return 'an answer under three letters';
  const seen = new Set();
  for (const e of list) {
    if (seen.has(e.word)) return `${e.word} twice`;
    seen.add(e.word);
  }
  const white = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (g[r][c] !== '#') white.push(r * n + c);
  const cover = new Map(white.map(w => [w, 0]));
  for (const e of list) for (const [r, c] of e.cells) cover.set(r * n + c, cover.get(r * n + c) + 1);
  if ([...cover.values()].some(v => v !== 2)) return 'a letter not in two answers';
  // In one piece.
  const seenCell = new Set([white[0]]), stack = [white[0]];
  while (stack.length) {
    const p = stack.pop(), r = Math.floor(p / n), c = p % n;
    for (const [a, b] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
      if (a < 0 || b < 0 || a >= n || b >= n || g[a][b] === '#' || seenCell.has(a * n + b)) continue;
      seenCell.add(a * n + b); stack.push(a * n + b);
    }
  }
  return seenCell.size === white.length ? null : 'in two pieces';
}

// Two answers that give each other away, like TIME and TIMER.
const related = (a, b) => a !== b && (a.startsWith(b) || b.startsWith(a)
  || (a.length >= 5 && b.length >= 5 && a.slice(0, 4) === b.slice(0, 4)));

// How much of the smaller grid two grids have in common. The 60-day gap alone
// lets a whole grid come back, so this holds across the whole list.
function shared(a, b) {
  const one = new Set(entries(a).map(e => e.word)), two = entries(b).map(e => e.word);
  return two.filter(w => one.has(w)).length / Math.min(one.size, two.length);
}

// Why a clue isn't fair for its answer in its grid, or null.
function clueFault(clue, word, others = []) {
  if (!clue || clue !== clue.trim()) return 'empty or padded';
  if (clue.length > MAX_CLUE) return `over ${MAX_CLUE} characters`;
  const said = clue.toLowerCase().match(/[a-z]+/g) || [];
  if (said.includes(word)) return 'names its own answer';
  if (word.length >= 4 && said.some(s => s.length >= 4 && (s.startsWith(word) || word.startsWith(s)))) return 'shares a stem with its answer';
  for (const o of others) {
    if (o === word) continue;
    if (said.includes(o) && o.length >= 4) return `names ${o}, also in the grid`;
  }
  return null;
}

// What each clue is doing, so a puzzle can be checked for variety:
//   d plain definition    b fill in the blank    x double meaning
//   c known culture       n recent culture       p ? pun     w other wordplay
const TAGS = 'dbxcnpw';
const SKIP = new Set('that this with from your have what when been were they them than then some into over more most very only just like such much many their there which about after could would should where while being does made make each also'.split(' '));

// Why a puzzle's clues aren't a good mix, or null. Every puzzle has a blank, a
// double meaning or pun, and something to smile at from culture, one or two of
// them recent, and no clue leans on a device or a word another has used.
function mixFault(list) {
  const count = tag => list.filter(c => c.tag === tag).length;
  const big = list.length > 12;
  if (!list.some(c => c.clue.includes('___'))) return 'no blank';
  if (count('b') > (big ? 3 : 2)) return 'too many blanks';
  if (!count('x') && !count('p') && !count('w')) return 'no wordplay at all';
  if (count('c') + count('n') < 2) return 'too little culture';
  if (count('n') < 1 || count('n') > 2) return `${count('n')} recent clues`;
  if (count('d') > Math.ceil(list.length * .6)) return 'too many plain definitions';
  if (count('x') > (big ? 3 : 2)) return 'too many double meanings';
  if (count('p') > 3) return 'too many puns';
  const sounds = list.filter(c => /by ear|sound(s| of)|said aloud|sounds like/i.test(c.clue));
  if (sounds.length > 1) return 'two homophones';
  const ors = list.filter(c => /, or /.test(c.clue));
  if (ors.length > 2) return 'three "X, or Y" clues';
  const seen = new Map();
  for (const c of list) {
    for (const w of new Set((c.clue.toLowerCase().match(/[a-z']+/g) || []).filter(w => w.length >= 4 && !SKIP.has(w)))) {
      if (seen.has(w)) return `"${w}" in two clues`;
      seen.set(w, c.word);
    }
  }
  return null;
}

// ---- recycled jokes ----
// The same answer can come back; the same joke can't. Nor can one reference be
// leaned on all year: a name or a stock phrase turns up twice at most, and never
// within 30 days of itself.
const MAX_REFERENCE = 2, REFERENCE_GAP = 30;
const LITTLE = new Set(`the and for not but you are was had has his her its one two out off who why how all any can may per via his she him
  some into with from your have what when been were they them than then that this over more most very only just like such much many
  their there which about after could would should where while being does made make each also get got say says said way big old new
  good bad use used say see one ten for say`.split(/\s+/));
const stem = w => w.replace(/'s?$/, '').replace(/(?<=[a-z]{3})(ies|es|s)$/, '');
const contentWords = clue => [...new Set((clue.toLowerCase().match(/[a-z']+/g) || []).map(stem).filter(w => w.length >= 3 && !LITTLE.has(w)))];

// Two clues for one answer that say much the same thing.
function nearCopy(a, b) {
  const one = contentWords(a), two = new Set(contentWords(b));
  const same = one.filter(w => two.has(w)).length;
  const smaller = Math.min(one.length, two.size);
  if (!smaller) return false;
  return smaller === 1 ? same === 1 && Math.max(one.length, two.size) <= 2 : same / smaller > .5;
}

// Places and peoples a clue can name freely, and words that are only capitals
// because of where they fall. Everything else capitalised counts as a reference.
const COMMON_NAMES = new Set(`aussie aussies australia australian australians britain british english england france french german germany
  italian italy greek greece roman rome latin spanish spain dutch scottish scotland irish ireland welsh wales american america european
  europe asian asia africa african kiwi kiwis sydney melbourne brisbane perth adelaide hobart darwin canberra tasmania tassie queensland
  victoria nsw kiwi christmas easter monday tuesday wednesday thursday friday saturday sunday january february march april june july
  august september october november december gen tv uk us usa eu nz ai mr mrs ms dr sir lady lord saint st the a an of in on at by it is
  i you we he she they my our your his her to for from with or and not no yes as be do so if but what who how why when where
  test olympic olympics olympian film movie world time down under day man new good big end game dog king street like war
  christma best little white london centre horse cros hole afl open`.split(/\s+/));
function references(clue) {
  const words = clue.replace(/___/g, ' ').match(/[A-Za-z][A-Za-z']*/g) || [];
  const out = [];
  words.forEach((w, i) => {
    if (!/^[A-Z]/.test(w)) return;
    const name = stem(w.toLowerCase());
    if (COMMON_NAMES.has(name) || name.length < 3) return;
    if (i === 0 && !/^[A-Z][a-z]+'s /.test(clue)) return;
    out.push(name);
  });
  return [...new Set(out)];
}

// Every stock two-word phrase in lower case, such as group chat.
const phrases = clue => {
  const ws = (clue.toLowerCase().match(/[a-z']+/g) || []).map(stem);
  const out = [];
  for (let i = 0; i + 1 < ws.length; i++) if (!LITTLE.has(ws[i]) && !LITTLE.has(ws[i + 1]) && ws[i].length > 3 && ws[i + 1].length > 3) out.push(`${ws[i]} ${ws[i + 1]}`);
  return out;
};

// Everything recycled across a list of { day, word, clue }.
function recycled(list) {
  const faults = [];
  const byWord = new Map();
  for (const c of list) (byWord.get(c.word) || byWord.set(c.word, []).get(c.word)).push(c);
  for (const [word, clues] of byWord) {
    clues.forEach((a, i) => clues.slice(i + 1).forEach(b => {
      if (nearCopy(a.clue, b.clue)) faults.push(`${word}: day ${a.day} "${a.clue}" and day ${b.day} "${b.clue}"`);
    }));
  }
  const seen = new Map();
  const note = (key, c) => (seen.get(key) || seen.set(key, []).get(key)).push(c);
  for (const c of list) {
    for (const r of references(c.clue)) note(r, c);
    for (const p of phrases(c.clue)) note(p, c);
  }
  for (const [key, uses] of seen) {
    const days = uses.map(c => c.day).sort((a, b) => a - b);
    const close = days.some((d, i) => i && d - days[i - 1] < REFERENCE_GAP);
    if (uses.length > MAX_REFERENCE || close) faults.push(`${key}: ${uses.map(c => `${c.day} ${c.word}`).join(', ')}`);
  }
  return faults;
}

module.exports = { TAGS, mixFault, MAX_SHARED, shared, recycled, references, nearCopy, WEEK, REPEAT_GAP, MAX_CLUE, difficulty, entries, gridFault, related, clueFault };
