#!/usr/bin/env node
/**
 * fetch-ipeds-finance.mjs
 *
 * Snapshot fetcher: pulls IPEDS Finance (F1A public + F2 private) and Derived
 * Enrollment (DRVEF) directly from the NCES IPEDS Data Center as ZIP CSVs,
 * then writes src/data/financeSnapshot.json keyed by unitid.
 *
 * No auth, no API key, no third-party gateway. The Urban Institute API was
 * unreliable (520s); going to the source instead.
 *
 *   node scripts/fetch-ipeds-finance.mjs
 *
 * Bump FY_LABEL / FILE_F1A / FILE_F2 / FILE_DRVEF when new releases land.
 *
 * Field references (IPEDS data dictionary):
 *   F1A (public):     F1B25 = total all revenues & other additions ($)
 *                     F1H02 = endowment value, end of year ($)
 *   F2  (private):    F2D18 = total revenues & investment return ($)
 *                     F2H02 = endowment value, end of year ($)
 *   DRVEF (derived):  FTE   = 12-month FTE enrollment
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TMP = await fs.mkdtemp(path.join(os.tmpdir(), 'ipeds-'));

const FY_LABEL    = 'FY2022-23';
const FILE_F1A    = 'F2223_F1A.zip';   // public-side finance
const FILE_F2     = 'F2223_F2.zip';    // private nonprofit finance
const FILE_DRVEF  = 'DRVEF2022.zip';   // derived enrollment (FTE)
const BASE        = 'https://nces.ed.gov/ipeds/datacenter/data';

// ── Pull unitids from src/pages/HEBrandEquity.jsx ────────────────────────
async function loadUnitIds() {
  const src = await fs.readFile(path.join(ROOT, 'src/pages/HEBrandEquity.jsx'), 'utf8');
  const ids = new Set();
  const re = /unitid:\s*"(\d+)"/g;
  let m;
  while ((m = re.exec(src))) ids.add(m[1]);
  return ids;
}

// ── Download + unzip a single CSV ────────────────────────────────────────
async function downloadCsv(zipName) {
  const zipPath = path.join(TMP, zipName);
  console.log(`  downloading ${zipName}...`);
  const res = await fetch(`${BASE}/${zipName}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${zipName}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(zipPath, buf);
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', TMP]);
  // Pick the non-_rv csv
  const files = await fs.readdir(TMP);
  const csv = files.find(f => f.toLowerCase().startsWith(zipName.toLowerCase().replace('.zip', '').toLowerCase().split('_').slice(0,2).join('_')) && f.endsWith('.csv') && !f.includes('_rv'));
  // Fallback: first .csv that matches the bare name
  const stem = zipName.replace('.zip', '').toLowerCase();
  const target = files.find(f => f.toLowerCase().startsWith(stem) && f.endsWith('.csv') && !f.includes('_rv')) || csv;
  if (!target) throw new Error(`No CSV extracted from ${zipName} (got: ${files.join(',')})`);
  return path.join(TMP, target);
}

// ── Minimal CSV parser (IPEDS files are well-formed, comma-separated) ────
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.length);
  const headers = splitCsvLine(lines[0]).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = cells[j];
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

function num(v) {
  if (v == null || v === '' || v === '.') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const wantedIds = await loadUnitIds();
  console.log(`Snapshot for ${wantedIds.size} institutions  (${FY_LABEL})`);

  const [f1aPath, f2Path, drvefPath] = await Promise.all([
    downloadCsv(FILE_F1A),
    downloadCsv(FILE_F2),
    downloadCsv(FILE_DRVEF),
  ]);

  console.log('  parsing CSVs...');
  const [f1aText, f2Text, drvefText] = await Promise.all([
    fs.readFile(f1aPath, 'utf8'),
    fs.readFile(f2Path,  'utf8'),
    fs.readFile(drvefPath, 'utf8'),
  ]);

  const f1a   = new Map(parseCsv(f1aText).map(r => [r.UNITID, r]));
  const f2    = new Map(parseCsv(f2Text).map(r => [r.UNITID, r]));
  const drvef = new Map(parseCsv(drvefText).map(r => [r.UNITID, r]));

  const out = {
    _meta: {
      source: 'IPEDS Data Center (https://nces.ed.gov/ipeds/datacenter/)',
      files: [FILE_F1A, FILE_F2, FILE_DRVEF],
      license: 'Public domain (U.S. Department of Education)',
      fetchedAt: new Date().toISOString(),
      fiscalYear: FY_LABEL,
      fields: {
        F1B25: 'Total all revenues and other additions (public)',
        F1H02: 'Endowment value, end of year (public)',
        F2D18: 'Total revenues and investment return (private)',
        F2H02: 'Endowment value, end of year (private)',
        FTE:   '12-month FTE enrollment (DRVEF)',
      },
      note: 'US Title-IV institutions only — international rows stay manual.',
    },
  };

  let ok = 0, miss = 0;
  for (const id of wantedIds) {
    const pub  = f1a.get(id);
    const priv = f2.get(id);
    const enr  = drvef.get(id);

    const totalRevenueUsd = pub  ? num(pub.F1B25)
                          : priv ? num(priv.F2D18)
                          : null;
    const endowmentUsd    = pub  ? num(pub.F1H02)
                          : priv ? num(priv.F2H02)
                          : null;
    const fte = enr ? num(enr.FTE) : null;

    if (totalRevenueUsd == null && endowmentUsd == null) {
      miss++;
      console.log(`  ${id}  no IPEDS finance row`);
      continue;
    }

    out[id] = {
      sector: pub ? 'public' : priv ? 'private' : 'unknown',
      totalRevenue: totalRevenueUsd != null ? Math.round(totalRevenueUsd / 1_000_000) : null, // $M
      endowmentTotal: endowmentUsd != null ? Math.round(endowmentUsd / 1_000_000) : null,     // $M
      endowmentPerStudent: (endowmentUsd != null && fte) ? Math.round((endowmentUsd / fte) / 1000) : null, // $K per FTE
      fte,
      fiscalYear: FY_LABEL,
    };
    ok++;
    console.log(`  ${id}  rev=$${out[id].totalRevenue}M  endow=$${out[id].endowmentTotal}M  fte=${fte}  → $${out[id].endowmentPerStudent}K/FTE`);
  }

  const dest = path.join(ROOT, 'src/data/financeSnapshot.json');
  await fs.writeFile(dest, JSON.stringify(out, null, 2) + '\n');
  console.log(`\n✓ Wrote ${dest}  (${ok} hits, ${miss} misses)`);
}

main().catch(e => { console.error(e); process.exit(1); });
