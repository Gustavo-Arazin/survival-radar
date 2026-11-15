#!/usr/bin/env node
/* Converte a extração GeoJSONSeq do OSM (osmium export) em blocos estáticos de 0,5° para o app.
 * Uso: node pipeline/build-tiles.js filtered.geojsonseq dist/data
 */
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const SR = require('../rules.js');

const [, , input, outDir] = process.argv;
if (!input || !outDir) { console.error('uso: build-tiles.js <in.geojsonseq> <outDir>'); process.exit(1); }

const CATS = Object.keys(SR.CATEGORIES);
const TILE = 0.5;
const tileKey = (lat, lon) => `${Math.floor((lat + 90) / TILE)}_${Math.floor((lon + 180) / TILE)}`;
const r5 = (x) => Math.round(x * 1e5) / 1e5;

function centroid(geom) {
  let pts = [];
  const g = geom.type;
  if (g === 'Point') return { lat: geom.coordinates[1], lon: geom.coordinates[0] };
  if (g === 'LineString') pts = geom.coordinates;
  else if (g === 'Polygon') pts = geom.coordinates[0];
  else if (g === 'MultiPolygon') pts = geom.coordinates.map((p) => p[0]).flat();
  else if (g === 'MultiLineString') pts = geom.coordinates.flat();
  if (!pts.length) return null;
  let la = 0, lo = 0;
  for (const [x, y] of pts) { lo += x; la += y; }
  return { lat: la / pts.length, lon: lo / pts.length };
}

function lineCoords(geom) {
  const lines = geom.type === 'LineString' ? [geom.coordinates] : geom.type === 'MultiLineString' ? geom.coordinates : [];
  return lines.map((l) => {
    const step = Math.max(1, Math.ceil(l.length / 300));
    const out = l.filter((_, i) => i % step === 0 || i === l.length - 1);
    return out.map(([x, y]) => [r5(y), r5(x)]);
  });
}

(async () => {
  const tiles = new Map();
  const counts = Object.fromEntries(CATS.map((c) => [c, 0]));
  const push = (k, row) => { if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(row); };
  const rl = readline.createInterface({ input: fs.createReadStream(input), crlfDelay: Infinity });
  let n = 0, kept = 0;
  for await (let line of rl) {
    line = line.replace(/^\x1e/, '').trim();
    if (!line) continue;
    n++;
    let f;
    try { f = JSON.parse(line); } catch { continue; }
    const t = f.properties || {};
    const cat = SR.classify(t);
    if (!cat || !f.geometry) continue;
    const ci = CATS.indexOf(cat);
    const name = t.name || t.operator || '';
    const addr = [t['addr:street'], t['addr:housenumber'], t['addr:suburb'] || t['addr:city']].filter(Boolean).join(', ');
    const phone = t.phone || t['contact:phone'] || '';
    const id = `${t['@type'] || ''}/${t['@id'] || ''}`;
    if (cat === 'pipeline') {
      const lines = lineCoords(f.geometry);
      const keys = new Set();
      for (const l of lines) for (const [la, lo] of l) keys.add(tileKey(la, lo));
      for (const k of keys) push(k, [ci, null, null, name, '', '', 0, id, lines]);
      counts[cat]++; kept++;
      continue;
    }
    const c = centroid(f.geometry);
    if (!c || !Number.isFinite(c.lat)) continue;
    push(tileKey(c.lat, c.lon), [ci, r5(c.lat), r5(c.lon), name, phone, addr, t.emergency === 'yes' ? 1 : 0, id]);
    counts[cat]++; kept++;
  }

  const tdir = path.join(outDir, 't');
  fs.mkdirSync(tdir, { recursive: true });
  for (const [k, rows] of tiles) fs.writeFileSync(path.join(tdir, `${k}.json`), JSON.stringify(rows));
  const index = { built: new Date().toISOString(), tile: TILE, cats: CATS, tiles: [...tiles.keys()].sort(), counts, source: 'OpenStreetMap (Geofabrik Brazil extract), ODbL' };
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index));
  console.log(`lidos ${n}, mantidos ${kept}, blocos ${tiles.size}`);
  console.log(JSON.stringify(counts));
})();
