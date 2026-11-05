// Dailies on the web: Cloudflare Workers named `dailies`, `slugle` and `ladder`
// (the old addresses, so old links still work) run this same script, no bindings.
//
//   GET  /, /slugle/, ...      the pages, served from the public ladder-releases
//                              repo, where every release publishes web/
//   GET  /app                  the latest Android app (a redirect to the APK)
//   GET  /now                  the time, and the time zone of the connection
//
// The games are static pages that run entirely in the browser, so this mostly
// passes files through with the right types. It also tells the time, so a phone's
// clock can't bring tomorrow's puzzle early (see web/clock.js): each page carries
// a reading. Deployed by hand (see README).

const WEB = 'https://raw.githubusercontent.com/matisseduffield/ladder-releases/main/web/';
const APK = 'https://raw.githubusercontent.com/matisseduffield/ladder-releases/main/Dailies.apk';
const TYPES = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', woff2: 'font/woff2', txt: 'text/plain; charset=utf-8' };
const HEADERS = { 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };

// Minutes ahead of UTC in a time zone, or null if there's no telling.
function offsetIn(zone, now) {
  if (!zone) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
    }).formatToParts(now);
    const part = type => Number(parts.find(p => p.type === type).value);
    return (Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute')) - (now - now % 6e4)) / 6e4;
  } catch { return null; }
}

const reading = request => {
  const now = Date.now();
  return JSON.stringify({ now, offset: offsetIn(request.cf?.timezone, now) });
};

export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: HEADERS });
    const url = new URL(request.url);
    if (url.pathname === '/app') return new Response(null, { status: 302, headers: { Location: APK, 'Cache-Control': 'no-store', ...HEADERS } });
    if (url.pathname === '/now') return new Response(reading(request), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...HEADERS } });
    const file = url.pathname.replace(/^\/+/, '').replace(/(^|\/)$/, '$1index.html');
    if (!/^[a-z0-9-]+(\/[a-zA-Z0-9.-]+)*\.(html|css|js|woff2|txt)$/.test(file)) return new Response('Not found', { status: 404, headers: HEADERS });
    // A ?v= file never changes, so it can sit in the browser for a week. The
    // version goes upstream too, or an old edge copy could be kept under it.
    const version = /^\?v=\d+$/.test(url.search) ? url.search : '';
    const res = await fetch(WEB + file + version, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!res.ok) return new Response('Not found', { status: 404, headers: HEADERS });
    if (file.endsWith('.html')) {
      const html = (await res.text()).replace('</head>', `<script>var serverClock=${reading(request)}</script></head>`);
      return new Response(html, { headers: { 'Content-Type': TYPES.html, 'Cache-Control': 'no-cache', ...HEADERS } });
    }
    const cache = version || file.endsWith('.woff2') ? 'public, max-age=604800' : 'public, max-age=60';
    return new Response(res.body, { headers: { 'Content-Type': TYPES[file.split('.').pop()], 'Cache-Control': cache, ...HEADERS } });
  },
};
