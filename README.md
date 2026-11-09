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
says One away. Once three are found the last four go in by themselves. A group's colour says how hard it was: yellow, green, blue, then purple. One
puzzle a day and no Practice, because every puzzle is hand-written and a spare
one is a day used up.

The puzzles are plain text in `web/sorted/puzzles.js`, a line for each group,
easiest first. Add new ones at the end; a puzzle's place in the list is its
day, so moving one changes what's on that day. The list goes round when it runs
out, with a different deal: it holds 791 days, so that's 4 January 2029.
`node scripts/sorted-rules.cjs more.txt` checks new puzzles against the list before
they're added, and keep to whole weeks when adding.

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
list a grid can need `--pool --nodes 30000 --total 40000000`. The list goes round on
4 January 2029. `node scripts/cluey-check.cjs 211 245` lists every fault in a range of
days while clues are being written, and `--show 211 245` prints what there is to write.
## Mend

A board of crossing words has been mixed up. Tap two tiles to swap them, or drag
one onto the other, and get every word back before the swaps run out. There's
no undo, and swaps left are the score. Green is in place and can't be moved,
yellow is wanted elsewhere in a word through that tile, and grey is neither.
Two green tiles or two of the same letter can't be swapped, so a slip costs
nothing. Out of swaps, or Give up, slides the tiles to the answer. Plus unlimited
Practice from puzzles kept apart from the days.

Every puzzle is fixed in `web/mend/days.js`: its letters, and a seed that mixes
them, so the page never searches. There are 791 days, and the list goes round on
4 January 2029. `scripts/build-mend.mjs` (about 10 min) only
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

To add days, in whole weeks, use `node scripts/build-mend.mjs --more 63`. It keeps
every day and every Practice board, and the new boards are ones nobody has met in
Practice.

To take a word out of Mend before its day arrives, use `node scripts/mend-swap-days.cjs word word`, which trades boards with Practice. A rebuild would reassign every day.

## Dated

Place events in order without seeing the years, with three lives. The events
live in `scripts/dated/*.txt`, and `node scripts/build-dated.mjs` deals the days
into `web/dated/days.js`. A plain build reassigns every day, so after launch fix
wording in both the source and `days.js` by hand. To add days or events, raise `DAYS`
in `scripts/dated-rules.cjs`, add to the source files and run
`node scripts/build-dated.mjs --keep`, which leaves the days there are and deals on
from them. There are 791 days, and the list goes round on 4 January 2029.

## Overland

Get from one country to another by land, naming the countries between in any
order, with a few guesses more than the shortest route needs. The map shows land
with no borders, and only the countries named so far. `web/overland/map.js` holds
the shapes (Natural Earth, public domain) and borders, written by
`scripts/build-overland-map.mjs`: borders come off the shapes, are compared with a
separate list, and the build stops on any disagreement not settled by hand in its
`FIXES`. `node scripts/build-overland.mjs` deals four years of days into
`web/overland/days.js` under `scripts/overland-rules.cjs`; a test pins them, so
don't rebuild over days already played.

## Splice

Words sit in a tree, and every word followed by the word under it makes a joined
word or a familiar phrase (fire + work, fire + alarm). The words start out of place;
tap two to swap them, then check. A check turns right links into green branches,
which lock, and breaks wrong ones into dots. Four checks Monday to Thursday, three
from Friday; trees grow from six words on Monday to a full pyramid of ten at the
weekend, and every word with nothing under it sits on the bottom row. Words hanging
from the same word can be in either order, so a check reads the answer the way that
best fits the board. Tapping a branch marks the pair on it amber; marked words
move together, keeping their shape, and a move that doesn't fit is refused
(`swap()` in `web/splice/lib.js`).

Answers only come from `scripts/splice-answers.txt`: links two separate strict
reviewers both kept (familiar at once to an Australian adult, no false splits, no
US or UK usage, nothing crude), with how each is written. Every link the earlier
lists held (`scripts/splice-words.txt`, `scripts/splice-phrases.txt`), the phrases
players were found to know (`scripts/splice-known.txt`) and the proof words in
`scripts/mend-words.txt` count when proving a tree has one answer.
`node scripts/build-splice.mjs` keeps every day in `web/splice/days.js` that still
passes and builds only the ones that fail, listing them, so they're the only days
that need reading again. A link rests 45 days, a word 7, a word with the same two
under it 180, and a tree holds at most one little linking word (off, out, back...).
Every one of the 840 days has been read through as a player after its last change.
A test checks each day uses only reviewed answers, written their way, and has
exactly one answer. The list goes round in February 2029.

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
  asked again on the same rung, it types the word in. Hints count: a hinted
  ladder is never on or under par, in the result or the stats.
- Past ladders: tap the date to play any day you missed. Late solves count
  in stats but not the streak.
- The result: steps against par, the day streak, a button to swap your ladder
  for the best one if you went over, and a spoiler-free picture to share (which letter changed on each
  step). Stats (top bar): solved, streak, best streak, and how often you're
  on, under or over par.
- Today / Practice tabs: practice ladders are random, short (par 4 to 5),
  medium (6 to 7) or long (8 to 9); New ladder picks the length.
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

## On an iPhone

The website installs from Safari with Share, then Add to Home Screen: `web/manifest.json`
(`.json` because the Worker's file list has no `.webmanifest`), `web/icons/` (rendered from the
launcher icon), the Apple tags, and `web/pwa.js`, which registers `web/sw.js` and shows a one-time
hint in Safari on an iPhone. `pwa.js` does nothing on `appassets.androidplatform.net`, so neither
runs in the Android app. `sw.js` is network-first with a cached copy for offline opening, and only
touches the files it names. It strips the `serverClock` reading from pages it keeps, since an old
reading would hold the games on an old day; `/now` and `/app` pass through.

## Layout

- `web/index.html`: the hub's home screen, and its update card. `GAMES` at the
  top of its script lists the games.
- `web/clock.js`: the time every game goes by, from our server rather than the
  phone, so `Clock.now()` replaces `new Date()` for anything to do with the day.
  `Clock.hold()` keeps a game in hand at midnight on its own day until it's
  finished and its result has been seen, and `Clock.untilNext()` is the
  result's countdown.
- `web/shared.css`: the palette, keyboard, sheets and so on that every page uses.
- `web/slugle/`, `web/hunch/`, `web/sorted/`, `web/reach/`, `web/cluey/`, `web/mend/`, `web/dated/`, `web/overland/`, `web/splice/`: a game each. `index.html` is the whole game (no
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
