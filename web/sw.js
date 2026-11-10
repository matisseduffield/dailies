// Lets the website open with no signal. Pages and files come from the network
// first, so a release shows straight away; the copies here are only for when that
// fails, answers with an error, or for a file that hasn't come in WAIT ms. /now and /app pass straight
// through. Registered by pwa.js, never in the Android app.
const CACHE = 'dailies';
const at = file => new URL(file, location).href;
const INDEX = at('index.html');
const WAIT = 3000;
// Pages that opened from their copies: the network has just failed them, so their
// own files use their copies without waiting. Never another tab, nor a new page.
const stale = new Set();
const SHELL = ['index.html', 'shared.css', 'clock.js', 'today.js', 'pwa.js', 'fonts/hanken-grotesk-latin.woff2'].map(at);

// A kept page mustn't keep its time: a reading from days ago would hold the games
// on that day (see clock.js), where no reading goes by the phone's clock.
const timeless = res => res.text().then(html => new Response(html.replace(/<script>var serverClock=.*?<\/script>/, ''), { headers: res.headers }));
const keep = (cache, key, res) => (/\.html$/.test(key) ? timeless(res) : Promise.resolve(res)).then(copy => cache.put(key, copy));

// Each file is fetched as the home page asks for it, ?v= and all, so its copy is
// known to go with the page (see the wait below).
const asked = (html, key) => {
  for (const [, file, v] of html.matchAll(/"([^"?]+)(\?v=\d+)"/g)) if (at(file) === key) return key + v;
  return key;
};

addEventListener('install', e => {
  e.waitUntil(Promise.all([caches.open(CACHE), fetch(INDEX)])
    .then(([cache, page]) => {
      if (!page.ok) throw new Error(INDEX);
      return page.clone().text().then(html => Promise.all([keep(cache, INDEX, page), ...SHELL.filter(key => key !== INDEX).map(key => fetch(asked(html, key)).then(res => {
        if (!res.ok) throw new Error(key);
        return keep(cache, key, res);
      }))]));
    })
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
  const navigate = request.mode === 'navigate';
  const kept = () => caches.match(key).then(hit => {
    if (hit && navigate) stale.add(e.resultingClientId);
    // A game that's never been opened here can't start offline: back to the home screen.
    return hit || (navigate ? Response.redirect(INDEX) : Response.error());
  });
  // A connection that takes requests and answers nothing would leave the page
  // blank: after WAIT the copy here is used instead, but only if it's the version
  // asked for (a kept file keeps its ?v=), so an old file never meets a new page.
  e.respondWith(new Promise(resolve => {
    let sent = false;
    const send = res => { if (!sent) { sent = true; resolve(res); } };
    const fromCopy = () => caches.match(key).then(hit => {
      if (!hit || sent || (url.search && new URL(hit.url || location).search !== url.search)) return;
      if (navigate) stale.add(e.resultingClientId);
      send(hit);
    });
    // An answer that isn't the file (the server in trouble) is no better than
    // none: the copy is used on the same terms, and the answer only without one.
    network.then(res => (res.ok ? send(res) : fromCopy().catch(() => {}).then(() => send(res))), () => kept().then(send));
    if (!navigate && stale.has(e.clientId)) fromCopy(); else setTimeout(fromCopy, WAIT);
  }));
});
