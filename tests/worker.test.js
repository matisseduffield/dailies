const test = require('node:test');
const assert = require('node:assert');

const load = () => import('../worker/worker.js').then(m => m.default);
const get = (path, cf) => ({ method: 'GET', url: 'https://dailies.example' + path, cf });

test('/now gives the time and the zone of the connection', async () => {
  const worker = await load();
  const res = await worker.fetch(get('/now', { timezone: 'Asia/Kolkata' }));
  assert.strictEqual(res.headers.get('Cache-Control'), 'no-store');
  const body = await res.json();
  assert.ok(Math.abs(body.now - Date.now()) < 5000);
  assert.strictEqual(body.offset, 330);
});

test('/now copes with no zone or a bad one', async () => {
  const worker = await load();
  assert.strictEqual((await (await worker.fetch(get('/now'))).json()).offset, null);
  assert.strictEqual((await (await worker.fetch(get('/now', { timezone: 'Nowhere/Land' }))).json()).offset, null);
});

test('pages carry a reading and are not kept', async t => {
  const worker = await load();
  t.mock.method(globalThis, 'fetch', async () => new Response('<html><head><title>x</title></head><body></body></html>'));
  const res = await worker.fetch(get('/reach/', { timezone: 'UTC' }));
  const html = await res.text();
  assert.match(html, /<script>var serverClock=\{"now":\d+,"offset":0\}<\/script><\/head>/);
  assert.strictEqual(res.headers.get('Cache-Control'), 'no-cache');
});

test('a game without its slash, the short link a share carries, goes on to the page', async () => {
  const worker = await load();
  const res = await worker.fetch(get('/slugle'));
  assert.strictEqual(res.status, 301);
  assert.strictEqual(res.headers.get('Location'), '/slugle/');
  assert.strictEqual((await worker.fetch(get('/app'))).status, 302);
  assert.strictEqual((await worker.fetch(get('/hunch?from=share'))).headers.get('Location'), '/hunch/?from=share');
});

test('a game with its slash is served, not sent round again', async t => {
  const worker = await load();
  t.mock.method(globalThis, 'fetch', async () => new Response('<html><head></head></html>'));
  const res = await worker.fetch(get('/slugle/', { timezone: 'UTC' }));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('Location'), null);
});

test('a file that is not there is a 404, and trouble upstream a 503 nobody keeps', async t => {
  const worker = await load();
  let status = 404;
  t.mock.method(globalThis, 'fetch', async () => new Response('x', { status }));
  assert.strictEqual((await worker.fetch(get('/reach/nothing.js'))).status, 404);
  for (status of [429, 500, 503]) {
    const res = await worker.fetch(get('/reach/'));
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.headers.get('Cache-Control'), 'no-store');
    assert.strictEqual(res.headers.get('X-Content-Type-Options'), 'nosniff');
  }
});

test('other files pass through untouched', async t => {
  const worker = await load();
  t.mock.method(globalThis, 'fetch', async () => new Response('let a;'));
  const res = await worker.fetch(get('/reach/lib.js?v=2'));
  assert.strictEqual(await res.text(), 'let a;');
  assert.strictEqual(res.headers.get('Cache-Control'), 'public, max-age=604800');
});
