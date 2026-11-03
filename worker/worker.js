// Slugle on the web: Cloudflare Workers named `slugle` and `ladder` (the old
// address, so old links still work) run this same script, no bindings.
//
//   GET  /, /index.html, ...   the game, served from the public ladder-releases
//                              repo, where every release publishes web/
//   GET  /app                  the latest Android app (a redirect to the APK)
//
// The game is a static page that runs entirely in the browser, so this only
// passes files through with the right types. Deployed by hand (see README).

const WEB = 'https://raw.githubusercontent.com/matisseduffield/ladder-releases/main/web/';
const APK = 'https://raw.githubusercontent.com/matisseduffield/ladder-releases/main/Slugle.apk';
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', woff2: 'font/woff2', txt: 'text/plain; charset=utf-8' };
const HEADERS = { 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };

export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: HEADERS });
    const url = new URL(request.url);
    if (url.pathname === '/app') return new Response(null, { status: 302, headers: { Location: APK, 'Cache-Control': 'no-store', ...HEADERS } });
    let file = url.pathname.replace(/^\/+/, '') || 'index.html';
    if (!/^[a-z0-9-]+(\/[a-zA-Z0-9.-]+)*\.(html|js|woff2|txt)$/.test(file)) return new Response('Not found', { status: 404, headers: HEADERS });
    const res = await fetch(WEB + file, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!res.ok) return new Response('Not found', { status: 404, headers: HEADERS });
    const cache = file.endsWith('.woff2') ? 'public, max-age=604800' : 'public, max-age=60';
    return new Response(res.body, { headers: { 'Content-Type': TYPES[file.split('.').pop()], 'Cache-Control': cache, ...HEADERS } });
  },
};
