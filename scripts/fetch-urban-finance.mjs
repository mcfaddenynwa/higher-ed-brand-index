#!/usr/bin/env node
/**
 * fetch-urban-finance.mjs
 *
 * Annual snapshot fetcher: pulls IPEDS Finance + NACUBO Endowments from the
 * Urban Institute Education Data Portal for every US `unitid` in IPEDS_DB,
 * computes endowment-per-FTE-student, and writes src/data/financeSnapshot.json.
 *
 * No auth, no API key. Free. ODC-By license.
 *
 * Run from repo root:
 *   node scripts/fetch-urban-finance.mjs
 *
 * Tweak FINANCE_YEAR / NACUBO_YEAR / FTE_YEAR as new releases land.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Latest stable years per Urban version history (0.25.0)
const FINANCE_YEAR = 2022;
const NACUBO_YEAR  = 2021;
const FTE_YEAR     = 2022; // for IPEDS 12-month FTE enrollment

const BASE = 'https://educationdata.urban.org/api/v1/college-university';

// ── Extract the unitids from src/pages/HEBrandEquity.jsx ─────────────────
async function loadUnitIds() {
  const src = await fs.readFile(path.join(ROOT, 'src/pages/HEBrandEquity.jsx'), 'utf8');
  const ids = new Set();
  // Match unitid: "214777"
  const re = /unitid:\s*"(\d+)"/g;
  let m;
  while ((m = re.exec(src))) ids.add(m[1]);
  return [...ids];
}

// ── Polite fetcher with retry ────────────────────────────────────────────
async function fetchJson(url, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'mcfaddenco-hebi-snapshot/1.0' } });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
      console.warn(`  ${res.status} on ${url} (attempt ${i + 1})`);
    } catch (e) {
      console.warn(`  ${e.message} (attempt ${i + 1})`);
    }
    await new Promise(r => setTimeout(r, 800 * (i + 1)));
  }
  return null;
}

// ── Pull one institution ──────────────────────────────────────────────────
async function fetchOne(unitid) {
  const [fin, fte, nac] = await Promise.all([
    fetchJson(`${BASE}/ipeds/finance/${FINANCE_YEAR}/?unitid=${unitid}`),
    fetchJson(`${BASE}/ipeds/fall-enrollment/${FTE_YEAR}/?unitid=${unitid}&level_of_study=99&sex=99&race=99&age=999`),
    fetchJson(`${BASE}/nacubo/endowments/${NACUBO_YEAR}/?unitid=${unitid}`),
  ]);

  // Field names per Urban docs (IPEDS Finance F1A / F2 / F3):
  //   total_revenues_and_investment_return  → totalRevenue (USD)
  //   endowment_assets_eoy or endowment_assets_fasb_eoy → endowment (USD)
  // NACUBO endowment market value: market_value_endowment_assets_eoy
  const finRow = fin?.results?.[0] || {};
  const nacRow = nac?.results?.[0] || {};

  const totalRevenueUsd =
    finRow.total_revenues_and_investment_return ??
    finRow.total_revenues ??
    null;

  const endowmentUsd =
    nacRow.market_value_endowment_assets_eoy ??
    finRow.endowment_assets_eoy ??
    finRow.endowment_assets_fasb_eoy ??
    null;

  // FTE: IPEDS 12-month FTE enrollment (fallbacks vary by endpoint)
  const fteRow = fte?.results?.find(r => r.fte_count != null) || fte?.results?.[0] || {};
  const fte12 = fteRow.fte_count ?? fteRow.enrollment_fall ?? null;

  return {
    endowmentPerStudent:
      endowmentUsd != null && fte12 ? Math.round((endowmentUsd / fte12) / 1000) : null, // $K per FTE
    totalRevenue: totalRevenueUsd != null ? Math.round(totalRevenueUsd / 1_000_000) : null, // $M
    fte: fte12 ?? null,
    financeYear: FINANCE_YEAR,
    nacuboYear: NACUBO_YEAR,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const unitids = await loadUnitIds();
  console.log(`Fetching finance for ${unitids.length} institutions...`);
  const out = {
    _meta: {
      source: 'Urban Institute Education Data Portal (https://educationdata.urban.org/)',
      endpoints: [
        `/college-university/ipeds/finance/${FINANCE_YEAR}/`,
        `/college-university/nacubo/endowments/${NACUBO_YEAR}/`,
      ],
      license: 'ODC Attribution License (ODC-By) v1.0',
      fetchedAt: new Date().toISOString(),
      financeYear: FINANCE_YEAR,
      nacuboYear: NACUBO_YEAR,
      note: 'US institutions only — international rows stay manual.',
    },
  };

  let ok = 0, miss = 0;
  for (const id of unitids) {
    process.stdout.write(`  ${id} ... `);
    const row = await fetchOne(id);
    if (row && (row.endowmentPerStudent != null || row.totalRevenue != null)) {
      out[id] = row;
      ok++;
      console.log(`endow=$${row.endowmentPerStudent}K/FTE  rev=$${row.totalRevenue}M`);
    } else {
      miss++;
      console.log('no data');
    }
    // Rate-limit politely
    await new Promise(r => setTimeout(r, 250));
  }

  const dest = path.join(ROOT, 'src/data/financeSnapshot.json');
  await fs.writeFile(dest, JSON.stringify(out, null, 2) + '\n');
  console.log(`\n✓ Wrote ${dest}  (${ok} hits, ${miss} misses)`);
}

main().catch(e => { console.error(e); process.exit(1); });
