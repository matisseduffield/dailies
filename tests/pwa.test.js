// The website as a home screen app: the manifest, icons, service worker and hint.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WEB = path.join(__dirname, '../web');
const read = file => fs.readFileSync(path.join(WEB, file));
const NAME = 'Dailies';
const PASS_THROUGH = ['https://dailies.teloone.au/now', 'https://dailies.teloone.au/app', 'https://dailies.teloone.au/manifest.json', 'https://dailies.teloone.au/icons/icon-192.png'];
const KEPT = ['shared.css', 'clock.js?v=1', 'pwa.js', 'slugle/lib.js?v=10', 'fonts/hanken-grotesk-latin.woff2'];

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1';
const FIREFOX_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15';
const IN_APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/500.0]';
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36';
const WEBVIEW = 'Mozilla/5.0 (Linux; Android 15; SM-S938B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36';

function pngInfo(file) {
  const b = read(file);
  assert.equal(b.toString('latin1', 1, 4), 'PNG', file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] };
}

// pwa.js as a page would run it, with what it touches faked.
function runPwa({ hostname = 'dailies.teloone.au', ua = SAFARI, standalone = false, seen = false }) {
  const calls = { register: [] };
  const hint = { hidden: true, querySelector: () => ({ addEventListener() {} }) };
  const values = seen ? { 'ladder.installHint': '1' } : {};
  const root = {
    URL,
    location: { hostname },
    navigator: { userAgent: ua, standalone, serviceWorker: { register: url => { calls.register.push(url); return Promise.resolve(); } } },
    document: { currentScript: { src: `https://${hostname}/pwa.js` }, getElementById: () => hint },
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: k => values[k] || null, setItem: (k, v) => { values[k] = v; } },
  };
  vm.runInNewContext(read('pwa.js').toString(), root);
  return { calls, hint };
}

// sw.js with its events caught, to see what it would answer.
function loadSw() {
  const on = {};
  const scope = { addEventListener: (type, fn) => { on[type] = fn; }, location: new URL('https://dailies.teloone.au/sw.js'), URL, Response, console, fetch: async () => new Response(''), caches: { open: async () => ({ put: async () => {} }), match: async () => undefined } };
  vm.runInNewContext(read('sw.js').toString(), scope);
  return request => {
    let answered = false;
    on.fetch({ request: { method: 'GET', mode: 'cors', ...request }, respondWith() { answered = true; }, waitUntil() {} });
    return answered;
  };
}

test('the manifest is complete and has no host in it', () => {
  const m = JSON.parse(read('manifest.json'));
  assert.equal(m.name, NAME);
  assert.equal(m.short_name, NAME);
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.equal(m.display, 'standalone');
  assert.match(m.theme_color, /^#[0-9A-F]{6}$/);
  assert.match(m.background_color, /^#[0-9A-F]{6}$/);
  assert.doesNotMatch(read('manifest.json').toString(), /https?:/);
  for (const size of [192, 512]) for (const purpose of ['any', 'maskable']) {
    const icon = m.icons.find(i => i.sizes === `${size}x${size}` && i.purpose === purpose);
    assert.ok(icon, `${size} ${purpose}`);
    const png = pngInfo(icon.src);
    assert.deepEqual([png.width, png.height], [size, size]);
  }
});

test('the iPhone icon is 180px with no transparency', () => {
  assert.deepEqual(pngInfo('icons/apple-touch-icon.png'), { width: 180, height: 180, colorType: 2 });
});

test('only Safari on an iPhone counts as Safari on an iPhone', () => {
  const { iphoneSafari } = require('../web/pwa.js');
  assert.equal(iphoneSafari(SAFARI), true);
  for (const ua of [CHROME_IOS, FIREFOX_IOS, IN_APP, CHROME_ANDROID, WEBVIEW]) assert.equal(iphoneSafari(ua), false, ua);
});

test('the hint shows once, in Safari on an iPhone', () => {
  assert.equal(runPwa({}).hint.hidden, false);
  assert.equal(runPwa({ seen: true }).hint.hidden, true);
  assert.equal(runPwa({ standalone: true }).hint.hidden, true);
  assert.equal(runPwa({ ua: CHROME_ANDROID }).hint.hidden, true);
  assert.equal(runPwa({ ua: CHROME_IOS }).hint.hidden, true);
});

test('nothing runs in the Android app', () => {
  const { calls, hint } = runPwa({ hostname: 'appassets.androidplatform.net', ua: WEBVIEW });
  assert.equal(calls.register.length, 0);
  assert.equal(hint.hidden, true);
});

test('the website registers its service worker from the top', () => {
  assert.deepEqual(runPwa({ ua: CHROME_ANDROID }).calls.register, ['https://dailies.teloone.au/sw.js']);
});

test('the service worker leaves data alone', () => {
  const answers = loadSw();
  for (const url of PASS_THROUGH) assert.equal(answers({ url }), false, url);
  for (const url of PASS_THROUGH) assert.equal(answers({ url, mode: 'navigate' }), false, url);
  assert.equal(answers({ url: 'https://dailies.teloone.au/index.html', method: 'POST' }), false);
});

test('the service worker answers for the app itself', () => {
  const answers = loadSw();
  assert.equal(answers({ url: 'https://dailies.teloone.au/', mode: 'navigate' }), true);
  for (const url of KEPT) assert.equal(answers({ url: `https://dailies.teloone.au/${url}` }), true, url);
});

test('every file the service worker keeps exists', () => {
  const listed = read('sw.js').toString().match(/^const (?:FILES|SHELL) = \[(.*)\]/m)[1].match(/'[^']+'/g).map(s => s.slice(1, -1));
  assert.ok(listed.includes('index.html'));
  for (const file of listed) assert.ok(fs.existsSync(path.join(WEB, file)), file);
  const page = read('index.html').toString();
  for (const [, font] of page.matchAll(/url\("(fonts\/[^"]+)"\)/g)) assert.ok(listed.includes(font), font);
});

test('the page has the home screen tags', () => {
  const page = read('index.html').toString();
  assert.match(page, /<link rel="manifest" href="manifest\.json">/);
  assert.match(page, /<link rel="apple-touch-icon" sizes="180x180" href="icons\/apple-touch-icon\.png">/);
  assert.match(page, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(page, /name="apple-mobile-web-app-status-bar-style" content="default"/);
  assert.match(page, new RegExp(`name="apple-mobile-web-app-title" content="${NAME}"`));
  assert.match(page, /theme-color[^>]*prefers-color-scheme: light/);
  assert.match(page, /theme-color[^>]*prefers-color-scheme: dark/);
  assert.match(page, /viewport-fit=cover/);
  assert.match(page, /<script src="pwa\.js"><\/script>/);
});

const loadWorker = () => import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, '../worker/worker.js')).toString('base64')).then(m => m.default);

test('the Worker serves the manifest, icons, service worker and scripts', async t => {
  const worker = await loadWorker();
  t.mock.method(globalThis, 'fetch', async url => {
    const file = path.join(WEB, new URL(url).pathname.split('/web/')[1]);
    return fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response('', { status: 404 });
  });
  const types = {
    'manifest.json': 'application/json', 'sw.js': 'text/javascript; charset=utf-8', 'pwa.js': 'text/javascript; charset=utf-8',
    'icons/icon-192.png': 'image/png', 'icons/icon-512.png': 'image/png', 'icons/maskable-192.png': 'image/png', 'icons/maskable-512.png': 'image/png',
    'icons/apple-touch-icon.png': 'image/png',
  };
  for (const [file, type] of Object.entries(types)) {
    const res = await worker.fetch(new Request(`https://dailies.teloone.au/${file}`), {});
    assert.equal(res.status, 200, file);
    assert.equal(res.headers.get('Content-Type'), type, file);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), read(file), file);
  }
});

const GAMES = ['slugle', 'hunch', 'sorted', 'reach', 'cluey', 'mend', 'dated', 'overland'];

test('a game can be added to the home screen from its own page', () => {
  for (const game of GAMES) {
    const page = read(`${game}/index.html`).toString();
    assert.match(page, /<link rel="manifest" href="\.\.\/manifest\.json">/, game);
    assert.match(page, /<link rel="apple-touch-icon" sizes="180x180" href="\.\.\/icons\/apple-touch-icon\.png">/, game);
    assert.match(page, /name="apple-mobile-web-app-title" content="Dailies"/, game);
    assert.match(page, /<script src="\.\.\/pwa\.js"><\/script>/, game);
  }
});

test('shared results link to the site they came from, and the app keeps its address', () => {
  for (const file of ['index.html', ...GAMES.map(g => `${g}/index.html`)]) {
    const site = read(file).toString().match(/const SITE = .*/)[0];
    assert.match(site, /location\.origin/, file);
  }
  for (const game of GAMES) assert.match(read(`${game}/index.html`).toString(), /appassets\.androidplatform\.net' \? 'https:\/\/dailies\.matisseduffield\.workers\.dev'/, game);
});

test('a kept page loses its clock reading', async () => {
  const worker = await loadWorker();
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(read('index.html'));
  const served = await (await worker.fetch({ method: 'GET', url: 'https://dailies.teloone.au/', cf: { timezone: 'UTC' } })).text();
  globalThis.fetch = real;
  assert.match(served, /var serverClock=/);
  const rule = read('sw.js').toString().match(/html\.replace\((\/.*\/), ''\)/)[1];
  const stripped = served.replace(vm.runInNewContext(rule), '');
  assert.doesNotMatch(stripped, /serverClock/);
  assert.equal(stripped.length, read('index.html').toString().length);
});
