// Lets the website open with no signal. Pages and files come from the network
// first, so a release shows straight away; the copies here are only for when that
// fails, or for a file that hasn't come in WAIT ms. /now and /app pass straight
// through. Registered by pwa.js, never in the Android app.
const CACHE = 'dailies';
const at = file => new URL(file, location).href;
const INDEX = at('index.html');
const WAIT = 3000;
// When a file last had to wait: the page's other files right after it don't wait again.
let slow = -Infinity;
const SHELL = ['index.html', 'shared.css', 'clock.js', 'today.js', 'pwa.js', 'fonts/hanken-grotesk-latin.woff2'].map(at);

// A kept page mustn't keep its time: a reading from days ago would hold the games
// on that day (see clock.js), where no reading goes by the phone's clock.
const timeless = res => res.text().then(html => new Response(html.replace(/<script>var serverClock=.*?<\/script>/, ''), { headers: res.headers }));
const keep = (cache, key, res) => (/\.html$/.test(key) ? timeless(res) : Promise.resolve(res)).then(copy => cache.put(key, copy));

addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(cache => Promise.all(SHELL.map(key => fetch(key).then(res => {
      if (!res.ok) throw new Error(key);
      return keep(cache, key, res);
    }))))
    .then(() => skipWaiting()));
});

addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => clients.claim()));
});

addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  if (!/(\/|\.(html|css|js|woff2))$/.test(url.pathname)) return;
  // The one copy of a file, whatever its ?v=: a new version replaces the last.
  const key = url.origin + url.pathname.replace(/\/$/, '/index.html');
  const network = fetch(request).then(res => {
    if (res.ok) {
      const copy = res.clone();
      e.waitUntil(caches.open(CACHE).then(cache => keep(cache, key, copy)));
    }
    return res;
  });
  // A late answer still refreshes the copy after the page has been given it.
  e.waitUntil(network.catch(() => {}));
  const kept = () => caches.match(key).then(hit => hit
    // A game that's never been opened here can't start offline: back to the home screen.
    || (request.mode === 'navigate' ? Response.redirect(INDEX) : Response.error()));
  // A connection that takes requests and answers nothing would leave the page
  // blank: after WAIT the copy here is used instead, if there is one.
  e.respondWith(new Promise(resolve => {
    let sent = false;
    const send = res => { if (!sent) { sent = true; resolve(res); } };
    network.then(send, () => kept().then(send));
    const fromCopy = waited => caches.match(key).then(hit => {
      if (!hit || sent) return;
      if (waited) slow = Date.now();
      send(hit);
    });
    if (Date.now() - slow < 2 * WAIT) fromCopy(false); else setTimeout(() => fromCopy(true), WAIT);
  }));
});
