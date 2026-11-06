// Builds web/overland/map.js: every country's shape, name and land borders.
//
// Run from a folder holding these packages, none of which ship with the game:
//   npm i --ignore-scripts world-atlas@2 world-countries@5 topojson-client@3 topojson-simplify@3 d3-geo@3 d3-geo-projection@4
//   node <this repo>/scripts/build-overland-map.mjs <that folder> <this repo>
//
// Shapes come from Natural Earth (public domain) by way of world-atlas. Borders
// are read off those shapes, where two countries share an edge, and compared with
// the separate list in world-countries. The few places they differ were settled
// by hand in FIXES below, and the build stops if a new difference turns up.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const [from, repo] = process.argv.slice(2);
const need = createRequire(path.join(path.resolve(from), 'x.js'));
const topo = need('topojson-client');
const simp = need('topojson-simplify');
const { geoMiller, geoProject } = need('d3-geo-projection');
const world = need('world-atlas/countries-50m.json');
const list = need('world-countries/countries.json');

// Who you can name. Everything else is still land on the map.
const PLAYABLE_EXTRA = new Set(['VAT', 'PSE', 'TWN', 'ESH', 'UNK']);
// The everyday name where the list's isn't it.
const NAMES = {
  COD: 'DR Congo', COG: 'Republic of the Congo', USA: 'United States', GBR: 'United Kingdom', CIV: 'Ivory Coast',
  VAT: 'Vatican City', TLS: 'Timor-Leste', TUR: 'Turkey', STP: 'São Tomé and Príncipe', BIH: 'Bosnia and Herzegovina',
  MMR: 'Myanmar', CZE: 'Czechia', SWZ: 'Eswatini', MKD: 'North Macedonia', CPV: 'Cape Verde', UNK: 'Kosovo',
  FSM: 'Micronesia', ARE: 'United Arab Emirates', CAF: 'Central African Republic', DOM: 'Dominican Republic',
  PNG: 'Papua New Guinea', KNA: 'Saint Kitts and Nevis', VCT: 'Saint Vincent and the Grenadines', LCA: 'Saint Lucia',
  ATG: 'Antigua and Barbuda', TTO: 'Trinidad and Tobago', GNQ: 'Equatorial Guinea', GNB: 'Guinea-Bissau', BHS: 'Bahamas', GMB: 'Gambia',
};
// Other ways people type a name. Only ones a player would really try.
const ALSO = {
  USA: ['USA', 'US', 'America', 'United States of America'], GBR: ['UK', 'Britain', 'Great Britain', 'England', 'Scotland', 'Wales'],
  ARE: ['UAE', 'Emirates'], COD: ['DRC', 'Democratic Republic of the Congo', 'Congo Kinshasa', 'Zaire'], COG: ['Congo', 'Congo Brazzaville'],
  CIV: ["Cote d'Ivoire"], TUR: ['Turkiye'], MMR: ['Burma'], SWZ: ['Swaziland'], CZE: ['Czech Republic'], TLS: ['East Timor'],
  NLD: ['Holland'], MKD: ['Macedonia'], CPV: ['Cabo Verde'], VAT: ['Holy See', 'Vatican'], CAF: ['CAR'], KOR: ['Korea'], PRK: ['DPRK'],
  NZL: ['NZ'], ZAF: ['RSA'], SAU: ['KSA'], BIH: ['Bosnia'], GMB: ['The Gambia'], BHS: ['The Bahamas'], ESH: ['Sahara'],
};
// The map and the list disagree on these, settled by hand.
const FIXES = {
  add: [
    ['BWA', 'ZMB'],   // the short border at Kazungula, too small for the shapes to touch
    ['ESP', 'MAR'],   // Ceuta and Melilla
    ['DJI', 'SOM'],   // the shapes have Somaliland between them; see MERGE
  ],
  drop: [
    ['BRA', 'FRA'], ['FRA', 'SUR'],   // French Guiana, cut from France below
  ],
};
const MERGE = { Somaliland: 'SOM', 'N. Cyprus': 'CYP' };

const byNumber = new Map(list.map(c => [c.ccn3, c]));
const geoms = world.objects.countries.geometries;
const codeOf = g => (g.properties.name === 'Kosovo' ? 'UNK' : byNumber.get(g.id)?.cca3 || null);

// Join what's drawn apart, and keep France to Europe.
const parts = new Map();
const rest = [];
for (const g of geoms) {
  if (g.properties.name === 'Antarctica') continue;
  const into = MERGE[g.properties.name];
  const code = into || codeOf(g);
  if (code) (parts.get(code) || parts.set(code, []).get(code)).push(g);
  else rest.push(g);
}
const merged = [];
for (const [code, gs] of parts) {
  const obj = gs.length > 1 ? topo.mergeArcs(world, gs) : { ...gs[0] };
  obj.properties = { code };
  merged.push(obj);
}
const others = [];   // land nobody can name: French Guiana and the like
const france = merged.find(g => g.properties.code === 'FRA');
{
  const inEurope = polygon => {
    const f = topo.feature(world, { type: 'Polygon', arcs: polygon });
    const [x, y] = f.geometry.coordinates[0][0];
    return x > -6 && x < 10 && y > 41 && y < 52;
  };
  others.push({ type: 'MultiPolygon', arcs: france.arcs.filter(p => !inEurope(p)), properties: {} });
  france.arcs = france.arcs.filter(inEurope);
}
const object = { type: 'GeometryCollection', geometries: [...merged, ...rest, ...others] };
const whole = { ...world, objects: { countries: object } };

// Borders off the shapes, before anything is simplified.
const nearby = topo.neighbors(object.geometries);
const borders = new Map();
const link = (a, b) => { (borders.get(a) || borders.set(a, new Set()).get(a)).add(b); (borders.get(b) || borders.set(b, new Set()).get(b)).add(a); };
object.geometries.forEach((g, i) => nearby[i].forEach(j => {
  const a = g.properties?.code, b = object.geometries[j].properties?.code;
  if (a && b) link(a, b);
}));
for (const [a, b] of FIXES.add) link(a, b);
for (const [a, b] of FIXES.drop) { borders.get(a).delete(b); borders.get(b).delete(a); }

const playable = c => c.unMember || PLAYABLE_EXTRA.has(c.cca3);
const kept = new Map(list.filter(playable).map(c => [c.cca3, c]));
kept.set('UNK', list.find(c => c.cca3 === 'UNK') || { cca3: 'UNK', name: { common: 'Kosovo' }, altSpellings: [], region: 'Europe', area: 10908, borders: ['ALB', 'MNE', 'MKD', 'SRB'] });
const shaped = new Set(merged.map(g => g.properties.code));
for (const code of [...kept.keys()]) if (!shaped.has(code)) { console.log('no shape, left out:', code); kept.delete(code); }

// The second opinion: any disagreement not settled above stops the build.
const ignored = new Set(['GIB', 'GUF', 'HKG', 'MAC', 'SXM', 'MAF', 'ATA']);
const bad = [];
for (const [code, c] of kept) {
  const mine = new Set([...(borders.get(code) || [])].filter(b => kept.has(b)));
  const theirs = new Set((c.borders || []).filter(b => kept.has(b) && !ignored.has(b)));
  for (const b of mine) if (!theirs.has(b) && code < b) bad.push(`shapes only: ${code}-${b}`);
  for (const b of theirs) if (!mine.has(b) && code < b) bad.push(`list only: ${code}-${b}`);
}
const settled = new Set(FIXES.add.map(p => [...p].sort().join('-')));
const open = bad.filter(line => !settled.has(line.split(': ')[1]));
if (open.length) throw new Error('borders disagree:\n' + open.join('\n'));

// Lighter shapes that still fit together.
let light = simp.presimplify(whole, simp.sphericalTriangleArea);
const keep = Number(process.env.KEEP || 0.3);
light = simp.simplify(light, simp.quantile(light, keep));
light = simp.filter(light, simp.filterAttachedWeight(light, 2e-6, simp.sphericalRingArea));

const land = topo.merge(light, light.objects.countries.geometries);
const projection = geoMiller().rotate([-11, 0]).precision(0.1).fitWidth(10000, land);
const flat = feature => geoProject(feature, projection);

// A ring to path text: whole numbers, each point relative to the last.
function ringsOf(geometry) {
  if (!geometry) return [];
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polys.flat().map(r => {
    const out = [];
    for (const [x, y] of r) {
      const p = [Math.round(x), Math.round(y)];
      const last = out[out.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
    }
    return out;
  }).filter(r => r.length > 3);
}
const num = (n, first) => (first || n < 0 ? String(n) : ' ' + n);
function pathOf(rings) {
  let d = '';
  for (const ring of rings) {
    d += `M${ring[0][0]} ${ring[0][1]}l`;
    let [x, y] = ring[0], first = true;
    for (const [px, py] of ring.slice(1, -1)) {
      d += num(px - x, first) + num(py - y);
      x = px; y = py; first = false;
    }
    d += 'z';
  }
  return d;
}
const area = r => Math.abs(r.reduce((s, [x, y], i) => { const [u, v] = r[(i + 1) % r.length]; return s + x * v - u * y; }, 0) / 2);
const inside = (r, x, y) => {
  let hit = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [a, b] = r[i], [c, d] = r[j];
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) hit = !hit;
  }
  return hit;
};
const edge = (r, x, y) => {
  let best = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [a, b] = r[j], [c, d] = r[i];
    const t = Math.max(0, Math.min(1, ((x - a) * (c - a) + (y - b) * (d - b)) / ((c - a) ** 2 + (d - b) ** 2 || 1)));
    best = Math.min(best, Math.hypot(x - a - t * (c - a), y - b - t * (d - b)));
  }
  return best;
};
// The roomiest point of the biggest piece, for the name.
function labelSpot(r) {
  const xs = r.map(p => p[0]), ys = r.map(p => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best = [(x0 + x1) / 2, (y0 + y1) / 2], room = -1;
  for (let i = 1; i < 24; i++) for (let j = 1; j < 24; j++) {
    const x = x0 + (x1 - x0) * i / 24, y = y0 + (y1 - y0) * j / 24;
    if (!inside(r, x, y)) continue;
    const e = edge(r, x, y);
    if (e > room) { room = e; best = [x, y]; }
  }
  return best.map(Math.round);
}

const countries = {};
for (const g of light.objects.countries.geometries) {
  const code = g.properties?.code;
  if (!kept.has(code)) continue;
  const c = kept.get(code);
  let rings = ringsOf(flat(topo.feature(light, g)).geometry);
  // Too small to survive: a speck where it was, which the page draws with a stroke.
  if (!rings.length) {
    const first = whole.objects.countries.geometries.find(o => o.properties?.code === code);
    const raw = flat(topo.feature(whole, first)).geometry;
    const points = (raw.type === 'Polygon' ? raw.coordinates : raw.coordinates.flat()).flat();
    const x = Math.round(points.reduce((t, p) => t + p[0], 0) / points.length), y = Math.round(points.reduce((t, p) => t + p[1], 0) / points.length);
    rings = [[[x - 1, y], [x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]];
  }
  const main = rings.reduce((a, b) => (area(b) > area(a) ? b : a));
  const xs = main.map(p => p[0]), ys = main.map(p => p[1]);
  const name = NAMES[code] || c.name.common;
  countries[code] = {
    name,
    also: ALSO[code] || [],
    region: c.region,
    area: Math.round(c.area),
    borders: [...(borders.get(code) || [])].filter(b => kept.has(b)).sort(),
    box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    at: labelSpot(main),
    d: pathOf(rings),
  };
}

const landPath = pathOf(ringsOf(flat({ type: 'Feature', geometry: land.type ? land : land.geometry, properties: {} }).geometry));
const height = Math.ceil(Math.max(...Object.values(countries).map(c => c.box[3])) + 400);
const sorted = Object.fromEntries(Object.entries(countries).sort(([, a], [, b]) => a.name.localeCompare(b.name)));
const text = `// Written by scripts/build-overland-map.mjs. Don't edit by hand.
// Shapes: Natural Earth (public domain). Each country: its name, other names, land
// borders, the box round its biggest piece, where its name goes, and its outline.
(function (root) {
  const map = ${JSON.stringify({ width: 10000, height, land: landPath, countries: sorted })};
  if (typeof module === 'object' && module.exports) module.exports = map;
  else root.OverlandMap = map;
})(this);
`;
fs.mkdirSync(path.join(repo, 'web/overland'), { recursive: true });
fs.writeFileSync(path.join(repo, 'web/overland/map.js'), text);
const sum = Object.values(sorted);
console.log('countries', sum.length, 'borders', sum.reduce((s, c) => s + c.borders.length, 0) / 2, 'size', (text.length / 1024).toFixed(0) + ' KB', 'land', (landPath.length / 1024).toFixed(0) + ' KB', 'height', height);
