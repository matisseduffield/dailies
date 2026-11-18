// The iPhone app's copy of the pages (scripts/ios-bundle.mjs): it loads, it has
// nothing in it for features the iPhone app doesn't have, the puzzles in it are
// the website's, and the website and the Android app still have all of theirs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const SCRIPT = path.join(ROOT, 'scripts/ios-bundle.mjs');
const load = () => import('file://' + SCRIPT.replace(/\\/g, '/'));
const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');
const list = dir => fs.readdirSync(dir, { withFileTypes: true, recursive: true }).filter(e => e.isFile())
  .map(e => path.relative(dir, path.join(e.parentPath || e.path, e.name)).split(path.sep).join('/')).sort();

// Made once, by running the script as the build does.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dailies-ios-'));
const OUT = path.join(TMP, 'web');
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const made = () => {
  if (!fs.existsSync(OUT)) execFileSync(process.execPath, [SCRIPT, '--out', OUT], { stdio: 'pipe' });
  return OUT;
};
const PAGES = ['index.html', ...['slugle', 'hunch', 'sorted', 'reach', 'cluey', 'mend', 'dated', 'overland', 'splice', 'shunt'].map(g => `${g}/index.html`)];

test('the script makes the iPhone copy and passes its own checks', async () => {
  const { check, KEEP } = await load();
  assert.deepEqual(check(made()), []);
  for (const file of KEEP) assert.ok(fs.existsSync(path.join(made(), file)), file);
});

test('only the files the iPhone app uses are in it', async () => {
  const { KEEP, LEAVE } = await load();
  assert.deepEqual(list(made()), [...KEEP].sort());
  // Every file of the website is accounted for, kept or left out.
  assert.deepEqual(list(WEB), [...KEEP, ...LEAVE].sort());
  for (const file of ['pwa.js', 'sw.js', 'manifest.json', 'icons/apple-touch-icon.png']) assert.ok(LEAVE.includes(file), file);
});

test('each script in it parses', async () => {
  const { pageParts } = await load();
  const out = made();
  for (const file of list(out).filter(f => f.endsWith('.js'))) new vm.Script(read(out, file), { filename: file });
  for (const page of PAGES) {
    const { scripts } = pageParts(read(out, page));
    assert.equal(scripts.length, 1, page);
    new vm.Script(scripts[0], { filename: page });
  }
});

test('the puzzles and the rules in it are the website\'s, less the line the tests load them by', async () => {
  const { DATA, GAMES } = await load();
  const exported = /^[ \t]*if \(typeof module === 'object' && module\.exports\) module\.exports = \w+;\r?\n([ \t]*)else /m;
  const alone = /^[ \t]*if \(typeof module === 'object' && module\.exports\) module\.exports = \w+;\r?\n/m;
  for (const file of [...DATA, ...Object.keys(GAMES).map(g => `${g}/lib.js`), 'today.js', 'shared.css']) {
    const ours = read(WEB, file);
    assert.ok(!/ios:(cut|end)/.test(ours), `${file} has no marked parts`);
    const want = file.endsWith('.css') ? ours : exported.test(ours) ? ours.replace(exported, '$1') : ours.replace(alone, '');
    if (!file.endsWith('.css')) assert.ok(want !== ours, `${file} has the line`);
    assert.ok(read(made(), file) === want, file);
  }
  // And they still give the tests what they always did.
  assert.equal(typeof require('../web/hunch/lib.js').daily, 'function');
});

// Named in the sources of the website and the Android app; never in the iPhone copy.
const ELSEWHERE = [
  'installUpdate', 'checkUpdate', 'updateCard', 'Update available', 'Check for updates', 'selfUpdates',
  'Get the Android app', 'pwa.js', 'manifest.json', 'installHint', 'Add to Home Screen', 'apple-touch-icon',
  '__VERSION__', 'Android', 'appassets.androidplatform.net', 'workers\\.dev', 'location.host', "m.platform === 'ios'",
  'navigator.share', 'navigator.clipboard', 'serverClock', "fetch('/now'", 'sessionStorage', 'theme-color',
  'module.exports', 'shared.css?v=', 'if (!app) return;',
];

test('nothing of the other editions is in it, and they still have it all', async () => {
  const { DATA } = await load();
  const code = dir => list(dir).filter(f => /\.(html|js|css)$/.test(f) && !DATA.includes(f)).map(f => read(dir, f)).join('\n');
  const copy = code(made()), source = code(WEB);
  for (const word of ELSEWHERE) {
    assert.ok(!copy.includes(word), `in the iPhone copy: ${word}`);
    assert.ok(source.includes(word), `gone from web/: ${word}`);
  }
  for (const file of list(made())) assert.ok(!/ios:(cut|end)/.test(fs.readFileSync(path.join(made(), file), 'latin1')), file);
});

test('the copy is constant where the sources ask where they are', () => {
  const out = made();
  assert.match(read(out, 'index.html'), /const SITE =\s+'dailies\.teloone\.au'\s*;/);
  assert.match(read(out, 'hunch/index.html'), /const SITE = `\$\{\s*'dailies\.teloone\.au'\s*\}\/hunch`;/);
  assert.match(read(out, 'index.html'), /if \(m\.type === 'info'\) \{/);
  assert.match(read(out, 'index.html'), /const app = window\.ladderApp;/);
  assert.match(read(out, 'index.html'), /<link rel="stylesheet" href="shared\.css">/);
  assert.match(read(out, 'clock.js'), /root\.ladderClock\.read\(\)/);
  // The reminder row is on the page from the start, not waiting on the app to show it.
  assert.match(read(out, 'index.html'), /id="remindToggle" type="button" role="menuitemcheckbox" aria-checked="false"></);
  assert.match(read(WEB, 'index.html'), /id="remindToggle" type="button" role="menuitemcheckbox" aria-checked="false" hidden></);
  // The sources keep the originals.
  assert.match(read(WEB, 'index.html'), /const inApp = location\.hostname === 'appassets\.androidplatform\.net';/);
  assert.match(read(WEB, 'clock.js'), /if \(root\.serverClock\) \{/);
});

test('the pages and the app say the same things to each other', () => {
  const out = made();
  const shell = read(ROOT, 'ios/Shell/Shell.swift'), app = read(ROOT, 'ios/App/App.swift');
  const sent = new Set(PAGES.flatMap(p => [...read(out, p).matchAll(/toApp\(\{ type: (?:remindBlocked \? )?'(\w+)'(?: : '(\w+)')?/g)].flatMap(m => m.slice(1).filter(Boolean))));
  // What App.swift's own script sends for the page.
  for (const m of app.matchAll(/postMessage\(JSON\.stringify\(\{ type: '(\w+)'/g)) sent.add(m[1]);
  const handled = new Set([...shell.matchAll(/^\s+case "(\w+)":/gm)].map(m => m[1]));
  // A swipe back is dealt with in the page, by App.swift's script, and never reaches the shell.
  assert.match(app, /m\.type !== 'back'/);
  handled.add('back');
  assert.deepEqual([...sent].sort(), [...handled].sort());
  assert.deepEqual([...handled].sort(), ['askNotifications', 'back', 'haptic', 'hello', 'notify', 'openSettings', 'share']);
  // What the shell tells a page, the copy listens for.
  const told = new Set([...shell.matchAll(/"type": "(\w+)"/g)].map(m => m[1]));
  assert.deepEqual([...told].sort(), ['info', 'notifications']);
  for (const type of told) assert.ok(read(out, 'index.html').includes(`m.type === '${type}'`), type);
  for (const gone of ['updates', 'platform', 'androidplatform', 'appassets', 'openURLContexts', 'isAppPath', 'onMessage', 'webmanifest', 'wasm', 'UniformTypeIdentifiers']) {
    assert.ok(!shell.includes(gone) && !app.includes(gone), gone);
  }
});

test('the iPhone build takes the copy, and the Android app still takes web/', () => {
  const project = read(ROOT, 'ios/project.yml');
  assert.match(project, /- path: bundle\/web\r?\n\s+type: folder/);
  assert.ok(!project.includes('../web'));
  for (const file of ['ios.yml', 'ios-release.yml']) {
    const flow = read(ROOT, '.github/workflows', file);
    assert.ok(flow.indexOf('node scripts/ios-bundle.mjs') > 0 && flow.indexOf('node scripts/ios-bundle.mjs') < flow.indexOf('xcodegen generate'), file);
    assert.match(flow, /ios-bundle\.mjs --check /, file);
  }
  assert.match(read(ROOT, 'app/build.gradle.kts'), /assets\.srcDirs\("\.\.\/web"\)/);
  assert.match(read(ROOT, '.gitignore'), /^ios\/bundle\/\r?$/m);
});

test('a cut takes its lines with it, or only itself inside a line', async () => {
  const { strip } = await load();
  assert.equal(strip('a\n  /* ios:cut */\n  b\n  /* ios:end */\nc\n').text, 'a\nc\n');
  assert.equal(strip('a\r\n<!-- ios:cut -->\r\nb\r\n<!-- ios:end -->\r\nc\r\n').text, 'a\r\nc\r\n');
  assert.equal(strip('x = a/* ios:cut */ || b/* ios:end */;').text, 'x = a;');
  assert.equal(strip('  /* ios:cut */ if (a) /* ios:end */ go();\n').text, '   go();\n');
  assert.equal(strip('a /* ios:cut */ b\nc /* ios:end */ d').cuts, 1);
});

test('a mark with no partner, or one mistyped, stops the build', async () => {
  const { strip } = await load();
  assert.throws(() => strip('/* ios:cut */ a'), /no end/);
  assert.throws(() => strip('a /* ios:end */'), /no cut/);
  assert.throws(() => strip('/* ios:cut */ a /* ios:cut */ b /* ios:end */'), /inside/);
  assert.throws(() => strip('/* ios:cut */ a <!-- ios:end -->'), /not the kind/);
  assert.throws(() => strip('/* iOS: cut */ a /* ios:end */'), /no cut|looks like/);
  assert.throws(() => strip('a /*ios:cut*/ b'), /looks like/);
});

test('the check turns away web/ itself and a copy that has been added to', async () => {
  const { check } = await load();
  assert.ok(check(WEB).length > 50);
  const bad = path.join(TMP, 'bad');
  const again = () => { fs.rmSync(bad, { recursive: true, force: true }); fs.cpSync(made(), bad, { recursive: true }); };
  const add = (file, text) => fs.appendFileSync(path.join(bad, file), text);
  for (const [file, text, why] of [
    ['clock.js', "\nfetch('https://teloone.au/x');\n", /way out to the network/],
    ['hunch/lib.js', "\nconst u = 'https://example.com/a';\n", /should not name: https:\/\/example\.com/],
    ['sorted/puzzles.js', '\neval("1");\n', /made or loaded at run time/],
    ['next.js', '\n// Android\n', /the Android app/],
    ['index.html', '<!-- ios:cut -->', /cut mark/],
    ['shared.css', '\n.update { color: red; }\n', /the update card/],
    ['reach/index.html', '<script src="../pwa.js"></script>', /service worker/],
  ]) {
    again();
    add(file, text);
    assert.ok(check(bad).some(p => why.test(p)), `${file}: ${why}`);
  }
  again();
  fs.writeFileSync(path.join(bad, 'sw.js'), '');
  assert.ok(check(bad).some(p => /sw\.js: not a file the iPhone app should have/.test(p)));
  // A game folder the home page doesn't show.
  again();
  fs.writeFileSync(path.join(bad, 'index.html'), read(bad, 'index.html').replace(/\{ id: 'shunt', name: [^\n]*\n/, ''));
  const problems = check(bad);
  assert.ok(problems.some(p => /the home page shows/.test(p)) && problems.some(p => /shunt\/index\.html: no page leads to it/.test(p)));
});
