#!/usr/bin/env node
/**
 * extract-curated-overlay.mjs
 *
 * Pulls the hand-curated IPEDS_DB array out of src/pages/HEBrandEquity.jsx
 * and writes it to src/data/curatedOverlay.json keyed by unitid.
 *
 * The seed pipeline applies this overlay on top of raw IPEDS data so the
 * 48 institutions you've already enriched (US News rank, social, Niche,
 * Caldwell, etc.) keep their values when we expand to ~1,800 schools.
 *
 *   node scripts/extract-curated-overlay.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const src = await fs.readFile(path.join(ROOT, 'src/pages/HEBrandEquity.jsx'), 'utf8');

// Find the IPEDS_DB array literal
const start = src.indexOf('const IPEDS_DB = [');
if (start < 0) throw new Error('IPEDS_DB not found');
const arrStart = src.indexOf('[', start);

// Walk balanced brackets to find the matching ]
let depth = 0, end = -1;
for (let i = arrStart; i < src.length; i++) {
  const c = src[i];
  if (c === '[') depth++;
  else if (c === ']') {
    depth--;
    if (depth === 0) { end = i + 1; break; }
  }
}
if (end < 0) throw new Error('IPEDS_DB array end not found');

// Eval the array literal in a sandboxed function
const arrText = src.slice(arrStart, end);
const rows = (new Function(`return ${arrText};`))();

// Re-key by unitid, dropping name/unitid (those come from IPEDS HD)
const overlay = {};
for (const r of rows) {
  if (!r.unitid) continue;
  const { unitid, name, ...rest } = r;
  overlay[unitid] = rest;
}

const dest = path.join(ROOT, 'src/data/curatedOverlay.json');
await fs.writeFile(dest, JSON.stringify(overlay, null, 2) + '\n');
console.log(`✓ Wrote ${dest} (${Object.keys(overlay).length} institutions)`);
