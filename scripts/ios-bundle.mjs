#!/usr/bin/env node
// Makes the iPhone app's copy of the pages.
//
// web/ is one set of files for three things: the website, the Android app and the
// iPhone app. Some of it is only for the first two: the website's home-screen
// install (manifest, service worker, hint), its own clock reading and its other
// ways to share, and the Android app's updater. Those parts are marked in the sources:
//
//   /* ios:cut */ ... /* ios:end */        in scripts and styles
//   <!-- ios:cut --> ... <!-- ios:end -->  in markup
//
// The marks are comments, so the website and the Android app run the files exactly
// as before. This script copies web/ to ios/bundle/web without the marked parts and
// without the website-only files, then checks the copy: it must load, every file in
// it must be one a page leads to, and none of the words in FORBIDDEN may be left in
// it. The iPhone app bundles that folder (ios/project.yml), so what it ships has no
// code for features it doesn't have.
//
//   node scripts/ios-bundle.mjs               make ios/bundle/web and check it
//   node scripts/ios-bundle.mjs --out DIR     make it somewhere else
//   node scripts/ios-bundle.mjs --check DIR   only check a folder (the one in a built app)
//
// No dependencies: Node 18 or later.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WEB = path.join(ROOT, 'web');
export const OUT = path.join(ROOT, 'ios', 'bundle', 'web');

// The games on the home screen, in its order, and the files of puzzles each one has
// beside its index.html and lib.js. A folder in web/ that is not here stops the build.
export const GAMES = {
  slugle: ['words.js'],
  hunch: ['words.js'],
  sorted: ['puzzles.js'],
  reach: ['days.js'],
  cluey: ['puzzles.js'],
  mend: ['days.js'],
  dated: ['days.js'],
  overland: ['map.js', 'days.js'],
  splice: ['days.js'],
  shunt: ['days.js', 'practice.js'],
};
// Words, puzzles and maps: what the games are played with, not code that does anything.
// A clue may say "Android" or "website"; the code may not (see FORBIDDEN).
export const DATA = Object.entries(GAMES).flatMap(([game, files]) => files.map(f => `${game}/${f}`));

// Every file in web/ is on one of these two lists. A new file stops the build
// until someone says which it is.
export const KEEP = [
  'index.html',
  'shared.css',
  'clock.js',
  'today.js',
  'next.js',
  'fonts/OFL.txt',
  'fonts/hanken-grotesk-latin.woff2',
  'icons/icon-192.png',             // the picture on the About page
  ...Object.keys(GAMES).flatMap(game => [`${game}/index.html`, `${game}/lib.js`]),
  ...DATA,
];
export const LEAVE = [
  'manifest.json',                  // the website on a home screen
  'pwa.js',                         // registers the service worker, shows the install hint
  'sw.js',                          // the website's service worker
  'icons/apple-touch-icon.png',     // home-screen icons for the website
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
];
// In the copy but named by no page: the font's licence, which goes where the font goes.
const UNLINKED = ['fonts/OFL.txt'];

// What must not be in the iPhone app's copy, and why. Checked against every page,
// style sheet and script in it (not the files of puzzles), case as written unless marked i.
export const FORBIDDEN = [
  [/android/i, 'the Android app'],
  [/\bapk\b/i, 'the Android package'],
  [/latest\.json/, 'the updater\'s release file'],
  [/dailies-releases|githubusercontent|github\.com/i, 'the releases repository'],
  [/installUpdate|checkUpdate|updateStatus|selfUpdates|updateReady|showUpdate|updateVersion|updateSize|versionTimer/, 'the updater'],
  [/update(Card|Title|Sub|Notes|Msg|Progress|Bar|Pct|Actions|Later|Go)\b|update-(title|sub|msg|notes|progress|track|pct)|class="update"|\.update\b/, 'the update card'],
  [/Update available|Check for updates|Downloading update|Installing update|Up to date|Couldn't check|aboutCheck|aboutNote|allow installs|data-state|showLabel|showNote/i, 'the updater\'s words'],
  [/getApp|href="\/app"|Get the [A-Za-z]+ app/i, 'the link to another edition'],
  [/serviceWorker|service worker|\bsw\.js|pwa\.js/i, 'the website\'s service worker'],
  [/manifest|apple-touch-icon|apple-mobile-web-app|mobile-web-app-capable/i, 'the website\'s home-screen tags'],
  [/installHint|install-hint|Add to Home Screen/i, 'the website\'s install hint'],
  [/WEB_VERSION|__VERSION__/, 'the website\'s version stamp'],
  [/\?v=\d|Bump \?v/, 'the website\'s cache numbers'],
  [/theme-color|rel="icon"|name="description"/, 'tags only a browser reads'],
  [/serverClock|'\/now'|\brefresh\(/, 'the website\'s clock reading'],
  [/navigator\.(share|clipboard|userAgent|standalone|serviceWorker|vibrate)|Copied/, 'the website\'s ways to share'],
  [/\bios\b/i, 'a platform switch, or the platform named'],
  [/iPhone app|website|on the web\b|on the site\b|in a browser|browsers\b/i, 'a comment about another edition'],
  [/inApp|appassets|workers\.dev|location\.host|hostname|userAgent|standalone|display-mode/, 'a test of where the page is running'],
  [/if \(!?app\)|ladderApp (\|\||&&)|if \((window|root)\.ladder\w+\)|if \(root\.(document|addEventListener)\)|typeof markStarted|older copy/, 'a test for which edition this is'],
  [/Google Play|Play Store|App Store|TestFlight/i, 'store talk'],
  [/download|sideload|upgrade|new version/i, 'words for getting the app some other way'],
  [/sessionStorage|\bprompt\(|\bconfirm\(|\balert\(/, 'something the pages have no use for'],
];
// Checked against every text file, the files of puzzles too.
export const FORBIDDEN_CODE = [
  [/ios\s*:\s*(cut|end)/i, 'a cut mark left behind, or one mistyped'],
  [/typeof module|module\.exports|\brequire\(/, 'the export the tests use'],
  [/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource\(/, 'a way out to the network: the pages have none'],
  [/\beval\(|\bFunction\(|importScripts|document\.write|createElement\(\s*['"`]script|\bimport\(|set(Timeout|Interval)\(\s*['"`]|Worker\(|WebAssembly|<iframe|javascript:/i, 'code made or loaded at run time'],
];

// Every address the copy may name. The pages fetch nothing: these are the two links on
// the About page (the privacy policy and the terms). The check wants exactly these,
// no more and no fewer, so a new address is a decision.
export const HOSTS = [
  'teloone.au',
];
// Not addresses anything is fetched from: the SVG namespace in the pages' own drawings,
// and the credit for the word lists in a comment.
const PLAIN = ['www.w3.org', 'wordlist.aspell.net'];

const TEXT = new Set(['.html', '.js', '.css', '.json', '.txt', '.svg', '.mjs']);
const isText = file => TEXT.has(path.extname(file).toLowerCase());
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  }).sort();
}

// Takes the marked parts out of one file's text. A cut that has lines to itself
// goes with its lines; one inside a line leaves the rest of the line as it was.
// Throws on a mark with no partner, a cut inside a cut, or an end of the other kind.
export function strip(text, name = 'text') {
  const marks = /(\/\*|<!--) ios:(cut|end) (\*\/|-->)/g;
  const where = index => `${name}:${lineOf(text, index)}`;
  let out = '', from = 0, open = null, cuts = 0;
  for (const m of text.matchAll(marks)) {
    const [whole, opener, word, closer] = m;
    if ((opener === '/*') !== (closer === '*/')) throw new Error(`${where(m.index)}: a malformed mark, ${whole}`);
    if (word === 'cut') {
      if (open) throw new Error(`${where(m.index)}: a cut inside the cut that starts at line ${lineOf(text, open.index)}`);
      open = { index: m.index, opener };
      continue;
    }
    if (!open) throw new Error(`${where(m.index)}: an end with no cut before it`);
    if (open.opener !== opener) throw new Error(`${where(m.index)}: this end is not the kind of mark its cut is (line ${lineOf(text, open.index)})`);
    let start = open.index, end = m.index + whole.length;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const after = /^[ \t]*\r?\n/.exec(text.slice(end));
    if (/^[ \t]*$/.test(text.slice(lineStart, start)) && after) { start = lineStart; end += after[0].length; }
    out += text.slice(from, start);
    from = end;
    open = null;
    cuts++;
  }
  if (open) throw new Error(`${where(open.index)}: a cut with no end`);
  out += text.slice(from);
  const left = /ios\s*:\s*(cut|end)/i.exec(out);
  if (left) throw new Error(`${name}:${lineOf(out, left.index)} (after cutting): something that looks like a mark but isn't written as one`);
  return { text: out, cuts };
}

// Three things are changed by their shape, not by marks. Two because every file has them
// written the same way and the files of puzzles are made by other scripts: the ?v=
// numbers on a page's own files (for the website's caches; the app's files can't be
// stale), and the line that hands a script to the tests when Node loads it. The third
// is one attribute, which a comment can't mark: see REMINDER below.
const VERSIONED = /\b(src|href)="([^"?#:]+)\?v=\d+"/g;
const REMINDER = '<button class="menu-row" id="remindToggle" type="button" role="menuitemcheckbox" aria-checked="false" hidden>';
// Where an `else` follows it (else root.Name = lib), what the else does is kept.
const TEST_EXPORT = /^([ \t]*)if \(typeof module === 'object' && module\.exports\) module\.exports = \w+;[ \t]*\r?\n(?:[ \t]*else[ \t]+(?=\S))?/gm;
export function tidy(text, file) {
  if (file.endsWith('.html')) {
    if (!VERSIONED.test(text)) throw new Error(`web/${file}: expected its files to be named with ?v=N`);
    text = text.replace(VERSIONED, '$1="$2"');
    // The reminder is the iPhone app's own. In web/ its menu row starts hidden, because the
    // website and the Android app never show it; in the copy it is there from the start.
    if (file === 'index.html') {
      if (text.split(REMINDER).length !== 2) throw new Error('web/index.html: expected the reminder row once, starting hidden');
      text = text.replace(REMINDER, REMINDER.replace(' hidden>', '>'));
    }
    return text;
  }
  if (file.endsWith('.js')) {
    const found = (text.match(TEST_EXPORT) || []).length;
    if (found > 1) throw new Error(`web/${file}: ${found} lines that export to the tests, expected one`);
    return text.replace(TEST_EXPORT, (whole, indent) => (/else[ \t]+$/.test(whole) ? indent : ''));
  }
  return text;
}

// Copies web/ to `out` without the marked parts and the website-only files.
export function build(out = OUT, web = WEB) {
  const files = walk(web);
  const unknown = files.filter(f => !KEEP.includes(f) && !LEAVE.includes(f));
  if (unknown.length) throw new Error(`web/ has files this script has not been told about (add each to KEEP or LEAVE): ${unknown.join(', ')}`);
  const missing = [...KEEP, ...LEAVE].filter(f => !files.includes(f));
  if (missing.length) throw new Error(`Listed in this script but not in web/: ${missing.join(', ')}`);
  fs.rmSync(out, { recursive: true, force: true });
  let cuts = 0;
  for (const file of KEEP) {
    const to = path.join(out, file);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (!isText(file)) { fs.copyFileSync(path.join(web, file), to); continue; }
    const made = strip(fs.readFileSync(path.join(web, file), 'utf8'), `web/${file}`);
    cuts += made.cuts;
    fs.writeFileSync(to, tidy(made.text, file));
  }
  return { out, files: KEEP.length, cuts };
}

// The inline scripts of a page, and the scripts and files it names.
export function pageParts(html) {
  const bare = html.replace(/<!--[\s\S]*?-->/g, '');
  const scripts = [...bare.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const styles = [...bare.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]);
  const markup = bare.replace(/<script[^>]*>[\s\S]*?<\/script>/g, m => m.replace(/>[\s\S]*</, '><')).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '<style></style>');
  const refs = new Set();
  for (const m of markup.matchAll(/\b(?:src|href)="([^"]+)"/g)) refs.add(m[1]);
  for (const css of styles) for (const m of css.matchAll(/url\("([^"]+)"\)/g)) refs.add(m[1]);
  const local = [...refs].filter(r => !/^(https?:|data:|mailto:|#)/.test(r)).map(r => r.split(/[?#]/)[0]);
  return { scripts, styles, markup, local };
}

// Every tag that opens is closed, in order. Enough to say the page will load as written.
function tagProblems(markup) {
  const empty = new Set(['meta', 'link', 'input', 'img', 'br', 'hr', '!doctype']);
  const stack = [], problems = [];
  for (const m of markup.matchAll(/<(\/?)([A-Za-z!][\w-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g)) {
    const [, closing, raw, , selfClosed] = m;
    const tag = raw.toLowerCase();
    if (empty.has(tag) || selfClosed) continue;
    if (!closing) { stack.push(tag); continue; }
    const top = stack.pop();
    if (top !== tag) problems.push(`</${tag}> closes <${top || 'nothing'}>`);
  }
  if (stack.length) problems.push(`left open: ${stack.join(', ')}`);
  return problems;
}

// A file named from another, as a path from the top of the folder.
const from = (file, ref) => path.posix.normalize(path.posix.join(path.posix.dirname(file), ref));

// Checks a folder that is meant to be the iPhone app's copy. Returns the problems found.
export function check(dir = OUT) {
  const problems = [];
  if (!fs.existsSync(dir)) return [`${dir} does not exist`];
  const files = walk(dir);
  const read = file => fs.readFileSync(path.join(dir, file), 'utf8');
  for (const f of files) if (!KEEP.includes(f)) problems.push(`${f}: not a file the iPhone app should have`);
  for (const f of KEEP) if (!files.includes(f)) problems.push(`${f}: missing`);
  for (const file of files.filter(isText)) {
    // The font's licence is its authors' words and goes in as they wrote it.
    const lists = DATA.includes(file) || UNLINKED.includes(file) ? [FORBIDDEN_CODE] : [FORBIDDEN, FORBIDDEN_CODE];
    read(file).split('\n').forEach((line, i) => {
      for (const list of lists) for (const [pattern, why] of list) {
        const hit = pattern.exec(line);
        if (hit) problems.push(`${file}:${i + 1}: "${hit[0]}" (${why})`);
      }
    });
  }
  // The addresses in the pages, styles and scripts (not the font's licence text).
  const hosts = new Set(), plain = new Set();
  for (const file of files.filter(f => /\.(html|js|css)$/.test(f))) {
    for (const m of read(file).matchAll(/(https?):\/\/([^\/\s"'`<>)%]+)/g)) (m[1] === 'https' ? hosts : plain).add(m[2]);
  }
  for (const h of hosts) if (!HOSTS.includes(h)) problems.push(`an address the iPhone app should not name: https://${h}`);
  for (const h of HOSTS) if (!hosts.has(h)) problems.push(`an address on the list that the copy no longer names (take it off HOSTS): https://${h}`);
  for (const h of plain) if (!PLAIN.includes(h)) problems.push(`an address without https: http://${h}`);

  const parses = (code, name) => { try { new vm.Script(code, { filename: name }); } catch (e) { problems.push(`${name}: does not parse: ${e.message}`); } };
  for (const file of files.filter(f => f.endsWith('.js'))) parses(read(file), file);

  // Each page is whole, and what it names is there. `reached` gathers every file a
  // page leads to, starting from the home page.
  const reached = new Set(['index.html', ...UNLINKED]);
  for (const file of files.filter(f => f.endsWith('.html'))) {
    const html = read(file);
    const { scripts, markup, local } = pageParts(html);
    if (!/^<!doctype html>/i.test(html)) problems.push(`${file}: no doctype`);
    if (scripts.length !== 1) problems.push(`${file}: ${scripts.length} inline scripts, expected 1`);
    scripts.forEach((code, i) => parses(code, `${file} script ${i + 1}`));
    for (const p of tagProblems(markup)) problems.push(`${file}: ${p}`);
    for (const ref of local) {
      const target = from(file, ref);
      if (files.includes(target)) reached.add(target);
      else problems.push(`${file}: names ${ref}, which is not in the folder`);
    }
    // Each element the script asks for by name is on the page.
    const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
    for (const code of scripts) for (const m of code.matchAll(/\$\('([A-Za-z][\w-]*)'\)/g)) {
      if (!ids.has(m[1])) problems.push(`${file}: the script asks for #${m[1]}, which is not on the page`);
    }
  }
  for (const file of files.filter(f => f.endsWith('.css'))) {
    for (const m of read(file).matchAll(/url\("([^"]+)"\)/g)) {
      const target = from(file, m[1]);
      if (files.includes(target)) reached.add(target);
      else problems.push(`${file}: names ${m[1]}, which is not in the folder`);
    }
  }
  // The home page lists its games in its script. They must be the games in this folder,
  // no more and no fewer: a game the home page doesn't show is one nobody can open.
  if (files.includes('index.html')) {
    const { scripts } = pageParts(read('index.html'));
    const shown = [...(scripts[0] || '').matchAll(/\{ id: '([a-z]+)', name: /g)].map(m => m[1]);
    const here = Object.keys(GAMES);
    if (shown.join() !== here.join()) problems.push(`index.html: the home page shows ${shown.join(', ') || 'no games'}; the folder has ${here.join(', ')}`);
    for (const game of shown) if (files.includes(`${game}/index.html`)) reached.add(`${game}/index.html`);
  }
  for (const f of files) if (KEEP.includes(f) && !reached.has(f)) problems.push(`${f}: no page leads to it`);
  return [...new Set(problems)];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const only = value('--check');
  if ((args.includes('--check') && !only) || (args.includes('--out') && !value('--out'))) {
    console.error('Usage: node scripts/ios-bundle.mjs [--out DIR] | --check DIR');
    process.exit(2);
  }
  try {
    let dir = only && path.resolve(only);
    if (!dir) {
      const made = build(value('--out') ? path.resolve(value('--out')) : OUT);
      dir = made.out;
      console.log(`${path.relative(process.cwd(), dir) || dir}: ${made.files} files, ${made.cuts} marked parts left out`);
    }
    const problems = check(dir);
    if (problems.length) {
      console.error(`Not fit for the iPhone app (${problems.length}):`);
      for (const p of problems) console.error('  ' + p);
      process.exit(1);
    }
    console.log('Checked: it parses, every file is one a page leads to, and nothing the iPhone app does not have is in it.');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
