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

test('other files pass through untouched', async t => {
  const worker = await load();
  t.mock.method(globalThis, 'fetch', async () => new Response('let a;'));
  const res = await worker.fetch(get('/reach/lib.js?v=2'));
  assert.strictEqual(await res.text(), 'let a;');
  assert.strictEqual(res.headers.get('Cache-Control'), 'public, max-age=604800');
});
