# Slugle

A daily word ladder. Get from one four-letter word to another by changing one
letter at a time, and every step has to be a word. Free, offline, no ads.

- One ladder a day, the same for everyone, numbered from 3 November 2026.
  All week the ladders climb to the same silly word (FART, BURP, TOOT...),
  with a new one each Monday. Par is the fewest steps possible using everyday
  words, and it rises through the week: 3 on Monday, 7 on Sunday.
- Hard mode (in How to play) hides par and the empty rows until it's solved.
- Tiles stay one size: past par, older words slide off the top under a fade
  and the word to reach stays put. Scroll up to see them.
- Type the next word and press Enter, as in Wordle (the game's own keyboard
  or a real one). Letters that differ from the word above show blue as you
  type. Tap an earlier rung, Undo or Restart to go back.
- Letters already in place show green. Hint marks which letter to change;
  asked again on the same rung, it types the word in. Hints count.
- Past ladders: tap the date to play any day you missed. Late solves count
  in stats but not the streak.
- The result: steps against par, the day streak, a shortest way if you went
  over, and a spoiler-free picture to share (which letter changed on each
  step). Stats (top bar): solved, streak, best streak, and how often you're
  on, under or over par.
- Today / Practice tabs: practice ladders are random, short (par 3 to 4),
  medium (5 to 6) or long (7 to 8); New ladder picks the length.
- How to play (top bar) opens by itself on the first visit.
- Android app: self-updating from the public `ladder-releases` repo.
- In a browser: https://slugle.matisseduffield.workers.dev (shared results
  link here, so friends can play without the app; `/app` gets the APK).

## Words

From SCOWL (http://wordlist.aspell.net; copyright notice in `web/words.js`),
in every English spelling. Puzzles start and end on very common words (SCOWL
size 20, no plurals), except the week's word, which is always in the common
list; par and solutions only use common ones (size 35, less a few odd ones);
anything up to size 70 is accepted as a step, Australian-only words included. A short block list keeps slurs and the like out entirely.

The daily puzzles for ten years are fixed in `web/words.js`, so changing the
lists later never changes a day's puzzle. Rebuild with
`node scripts/build-words.mjs <unpacked scowl-2020.12.07>`.

## Layout

- `web/index.html`: the whole game (HTML/CSS/JS, no build step).
- `web/lib.js`: pure logic (word graph, par, hints, days, streaks, share
  text), tested by `node --test "tests/*.test.js"`.
- `web/words.js`: generated word lists and daily puzzles.
- `worker/worker.js`: the Cloudflare Workers `slugle` and `ladder` (old address) that serve the page
  from `ladder-releases/web/` (every release publishes it there). No
  bindings; deployed by hand when it changes, not on every release.
- `app/`: Kotlin WebView wrapper (`com.matisseduffield.ladder`) that bundles
  `web/` as assets, with the self-updater from Tally and Bureau.

## Releasing

Commit, then push an annotated `v*` tag. Actions builds a signed APK and
publishes it with `latest.json` to `ladder-releases`; the tag message's `- `
lines become the "What's new" notes in the app. When `lib.js` or `words.js`
changes, bump its `?v=` in `index.html` so browsers don't mix old and new.
