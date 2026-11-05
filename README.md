# Dailies

A few small daily games, new every day, on one home screen. Free, offline, no
ads. The home screen shows today's date and which games are done.

## Hunch

A hidden five-letter word and six tries. Green letters are in place, yellow
ones are elsewhere in the word and grey ones aren't in it. Something that
isn't a word clears itself. One word a day from a fixed shuffled list, plus
unlimited Practice. Hard mode (in How to play) makes every clue found count:
letters in place stay there and letters found have to be used. It can only be
turned on before a first guess.

## Sorted

Sixteen words hide four groups of four. Tap four and press Check: a right group
is set aside, a wrong one costs one of four mistakes, and three out of four
says One away. A group's colour says how hard it was: yellow, green, blue, then purple. One
puzzle a day and no Practice, because every puzzle is hand-written and a spare
one is a day used up.

The puzzles are plain text in `web/sorted/puzzles.js`, a line for each group,
easiest first. Add new ones at the end; a puzzle's place in the list is its
day, so moving one changes what's on that day. The list goes round when it runs
out, with a different deal.

## Reach

Six numbers and a target. Tap a number, an operator and a second number, in
either order, and the answer takes their place. Numbers stay whole and above
zero. Par is the fewest moves possible, proven by searching every shorter way,
so it can be matched but never beaten: 3 on Monday and Tuesday, 4 otherwise.
Six numbers allow five moves, so every day leaves room to finish over par.
Over par, a button swaps your moves for the best way. Give up shows it too,
and doesn't count towards the streak. Plus unlimited Practice.

`web/reach/days.js` holds ten years of seeds, one small number a day, so the
page only re-deals a puzzle and never has to search. `scripts/reach-rules.cjs`
says what's fair: how many ways may match par by weekday (few at the weekend,
which is what makes it hard), a best way that stays under 1,500, and at least
20 ways one move over par. Rebuild with `node scripts/build-reach.mjs` (8 min),
which gives the same days.

## Cluey

A small crossword every day, in the shape of a mini: every letter is in an
across and a down answer, and the grid looks the same spun half a turn. Monday
to Thursday are 5×5, Friday 6×6, and the weekend 7×7. 7×7 is the biggest that
keeps the whole grid in view above the keyboard at 320×568, with 37 px squares.
Clues have three levels, and the week builds through them and through how many
squares there are, with the commonest answers kept for Monday and Tuesday. Monday is all plain
clues, the weekend nearly all misdirection.

The clock stops while the game is hidden. Check marks the word you're on and
Reveal fills in the square you're on, three of each. A clean solve uses neither
and is right the first time the grid is full, because being told it's wrong is
a check of the whole grid. Give up shows the answers and doesn't count towards
the streak. No Practice, because a spare puzzle is a day used up.

`scripts/cluey/grids.txt` is the days in order and `clues-*.txt` their clues,
written by hand with the puzzle in view, as `word level tag clue`. Tags say what
a clue is doing (plain, blank, double meaning, culture, recent culture, ? pun,
wordplay). `scripts/cluey-rules.cjs` checks each puzzle has a good mix, no answer
returns within 60 days, and no two puzzles anywhere in the list share more than a
third of their answers, which also catches a grid turned on its side. It catches
recycled jokes too: two near-identical clues for one answer, or a name or stock
phrase used more than twice or within 30 days of itself. `verified.txt` gives a
source for every recent-culture clue. `node scripts/build-cluey.mjs` makes
`web/cluey/puzzles.js`. To add days, always whole weeks so a puzzle stays on its
weekday when the list goes round: `--more 7 --pool` adds grids at the end and
lists the clues to write in `scripts/cluey/missing.txt`. Words picked for a grid
come from `good.txt` and `lively.txt`, then `words.txt` and, two to a grid at
most, `inflected.txt` (both from SCOWL), never from `reject.txt`. Late in the
list a grid can need `--pool --nodes 30000 --total 40000000`.
## Mend

A board of crossing words has been mixed up. Tap two tiles to swap them, or drag
one onto the other, and get every word back before the swaps run out. There's
no undo, and swaps left are the score. Green is in place and can't be moved,
yellow is wanted elsewhere in a word through that tile, and grey is neither.
Two green tiles or two of the same letter can't be swapped, so a slip costs
nothing. Out of swaps, or Give up, slides the tiles to the answer. Plus unlimited
Practice from puzzles kept apart from the days.

Every puzzle is fixed in `web/mend/days.js`: its letters, and a seed that mixes
them, so the page never searches. There are two years of days for now, and the
list goes round after that. `scripts/build-mend.mjs` (about 10 min) only
keeps a puzzle once it has proven that no other arrangement of its letters works
with any word in SCOWL up to size 80, and that it needs exactly its day's fewest
swaps. The boards and swaps for each weekday are in `web/mend/lib.js`; word
commonness and how misleading the opening is are in `scripts/mend-rules.cjs`. Words
are in `scripts/mend-words.txt`, built by `scripts/build-mend-words.mjs`, with
`scripts/mend-not-answers.txt` for words read and left out by hand. Answers are
words most adults know and are happy to see, in British and Australian spelling;
a puzzle's place is its day, so the list isn't for changing lightly.
`scripts/mend-bots.cjs` holds the simulated players that measure the week:
`node scripts/mend-report.cjs` prints the table.

## Slugle

A daily word ladder. Turn a new four-letter word into SLUG by changing one
letter at a time, and every step has to be a word.

- One ladder a day, the same for everyone, numbered from 3 November 2026.
  Every ladder, Practice included, ends on SLUG, which isn't shown until it's
  solved. Par is the fewest steps possible using everyday words, and it rises
  through the week: 5 on Monday, 8 on Sunday.
- Hard mode (in How to play) hides par until it's solved.
- Tiles stay one size: past par, older words slide off the top under a fade
  and the newest stay in view. Scroll up to see them.
- Type the next word and press Enter (the game's own keyboard
  or a real one). Something that isn't a word clears itself. Tap an earlier
  rung, Undo or Restart to go back.
- Letters already in place show green, on every row, and nothing else is
  highlighted. Hint marks which letter to change;
  asked again on the same rung, it types the word in. Hints count.
- Past ladders: tap the date to play any day you missed. Late solves count
  in stats but not the streak.
- The result: steps against par, the day streak, a button to swap your ladder
  for the best one if you went over, and a spoiler-free picture to share (which letter changed on each
  step). Stats (top bar): solved, streak, best streak, and how often you're
  on, under or over par.
- Today / Practice tabs: practice ladders are random, short (par 3 to 4),
  medium (5 to 6) or long (7 to 8); New ladder picks the length.
- How to play (top bar) opens by itself on the first visit.
- Android app: self-updating from the public `dailies-releases` repo.
- In a browser: https://dailies.matisseduffield.workers.dev (shared results
  link here, so friends can play without the app; `/app` gets the APK).

## Words

From SCOWL (http://wordlist.aspell.net; copyright notice in `web/slugle/words.js`),
in every English spelling. Puzzles start on common words (size 35, no plurals,
no letter already where it is in SLUG), and a start word comes back about once
a year at most;
par and solutions only use common ones (size 35, less a few odd ones);
anything up to size 70 is accepted as a step, Australian-only words included. A short block list keeps slurs and the like out entirely.

The daily puzzles for ten years are fixed in `web/slugle/words.js`, so changing the
lists later never changes a day's puzzle. Rebuild with
`node scripts/build-words.mjs <unpacked scowl-2020.12.07>`.

## Adding a game

Give it a folder in `web/` with an `index.html` that links `../shared.css`, add
it to `GAMES` in `web/index.html` and `web/next.js`, and when today's game ends
save `{ date: new Date().toDateString(), text }` to localStorage as
`hub.<folder>`. Call `showNext()` from its result for the link to the next game.

## Layout

- `web/index.html`: the hub's home screen, and its update card. `GAMES` at the
  top of its script lists the games.
- `web/clock.js`: the time every game goes by, from our server rather than the
  phone, so `Clock.now()` replaces `new Date()` for anything to do with the day.
- `web/shared.css`: the palette, keyboard, sheets and so on that every page uses.
- `web/slugle/`, `web/hunch/`, `web/sorted/`, `web/reach/`, `web/cluey/`, `web/mend/`: a game each. `index.html` is the whole game (no
  build step), `lib.js` its pure logic, tested by `node --test "tests/*.test.js"`,
  and `words.js`, `puzzles.js` or `days.js` its data.
- `worker/worker.js`: the Cloudflare Workers `dailies`, `slugle` and `ladder`
  (old addresses) that serve the pages from `dailies-releases/web/` (every
  release publishes it there) and tell the time at `/now`. No bindings; deployed by hand when it changes,
  not on every release.
- `app/`: Kotlin WebView wrapper (`com.matisseduffield.ladder`) that bundles
  `web/` as assets, with the self-updater from Tally and Bureau.

## Releasing

Commit, then push an annotated `v*` tag. Actions builds a signed APK and
publishes it with `latest.json` to `dailies-releases`; the tag message's `- `
lines become the "What's new" notes in the app. When `lib.js` or a game's data
changes, bump its `?v=` in `index.html` so browsers don't mix old and new.
