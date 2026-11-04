# Dailies

A few small word games, new every day, on one home screen. Free, offline, no
ads. The home screen shows today's date and which games are done.

## Hunch

A hidden five-letter word and six tries. Green letters are in place, yellow
ones are elsewhere in the word and grey ones aren't in it. Something that
isn't a word clears itself. One word a day from a fixed shuffled list, plus
unlimited Practice. Hard mode (in How to play) makes every clue found count:
letters in place stay there and letters found have to be used. It can only be
turned on before a first guess.

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
- Android app: self-updating from the public `ladder-releases` repo.
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
it to `GAMES` in `web/index.html`, and when today's game ends save
`{ date: new Date().toDateString(), text }` to localStorage as `hub.<folder>`.

## Layout

- `web/index.html`: the hub's home screen, and its update card. `GAMES` at the
  top of its script lists the games.
- `web/shared.css`: the palette, keyboard, sheets and so on that every page uses.
- `web/slugle/`, `web/hunch/`: a game each. `index.html` is the whole game (no
  build step), `lib.js` its pure logic, tested by `node --test "tests/*.test.js"`,
  and `words.js` its generated word lists.
- `worker/worker.js`: the Cloudflare Workers `dailies`, `slugle` and `ladder`
  (old addresses) that serve the pages from `ladder-releases/web/` (every
  release publishes it there). No bindings; deployed by hand when it changes,
  not on every release.
- `app/`: Kotlin WebView wrapper (`com.matisseduffield.ladder`) that bundles
  `web/` as assets, with the self-updater from Tally and Bureau.

## Releasing

Commit, then push an annotated `v*` tag. Actions builds a signed APK and
publishes it with `latest.json` to `ladder-releases`; the tag message's `- `
lines become the "What's new" notes in the app. When `lib.js` or `words.js`
changes, bump its `?v=` in `index.html` so browsers don't mix old and new.
