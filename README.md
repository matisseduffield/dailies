# Ladder

A daily word ladder. Get from one four-letter word to another by changing one
letter at a time, and every step has to be a word. Free, offline, no ads.

- One ladder a day, the same for everyone, numbered from 3 November 2026.
  Par is the fewest steps possible using everyday words, and it rises through
  the week: 3 on Monday, 7 on Sunday.
- Tap a letter in the word, then the new letter. Tap an earlier rung (or ⌫)
  to go back. On a computer, type: arrows pick the letter, Backspace goes back.
- Letters already in place show green. Hint shows which letter to change;
  asked again on the same rung, it gives the word. Hints count in the result.
- The result: steps against par, a day streak and totals, a shortest way if
  you went over, and a spoiler-free picture to share (which letter changed on
  each step).
- Practice: random ladders (par 4 to 6) once today's is done.
- Android app: self-updating from the public `ladder-releases` repo.

## Words

From SCOWL (http://wordlist.aspell.net; copyright notice in `web/words.js`),
in every English spelling. Puzzles start and end on very common words (SCOWL
size 20, no plurals); par and solutions only use common ones (size 35, less a
few odd ones); anything up to size 70 is accepted as a step, Australian-only
words included. A short block list keeps slurs and the like out entirely.

The daily puzzles for ten years are fixed in `web/words.js`, so changing the
lists later never changes a day's puzzle. Rebuild with
`node scripts/build-words.mjs <unpacked scowl-2020.12.07>`.

## Layout

- `web/index.html`: the whole game (HTML/CSS/JS, no build step).
- `web/lib.js`: pure logic (word graph, par, hints, days, streaks, share
  text), tested by `node --test "tests/*.test.js"`.
- `web/words.js`: generated word lists and daily puzzles.
- `app/`: Kotlin WebView wrapper (`com.matisseduffield.ladder`) that bundles
  `web/` as assets, with the self-updater from Tally and Bureau.

## Releasing

Commit, then push an annotated `v*` tag. Actions builds a signed APK and
publishes it with `latest.json` to `ladder-releases`; the tag message's `- `
lines become the "What's new" notes in the app.
