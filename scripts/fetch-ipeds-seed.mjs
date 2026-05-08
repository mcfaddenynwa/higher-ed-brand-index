#!/usr/bin/env node
/**
 * fetch-ipeds-seed.mjs
 *
 * Pulls the IPEDS files needed to seed the institutions table:
 *   HD2022.zip      - Directory: name, city, state, sector, Carnegie 2021
 *   DRVEF2022.zip   - Derived enrollment (12-month FTE, total enrollment)
 *   DRVGR2022.zip   - Derived grad rates (4-yr, 6-yr) + retention
 *   ADM2022.zip     - Admissions: applicants, admits, enrolled  (yield, accept)
 *   SFA2122.zip     - Student financial aid: % receiving Pell
 *   F2223_F1A.zip   - Public finance (already used)
 *   F2223_F2.zip    - Private finance (already used)
 *
 * Filters to US 4-year degree-granting institutions in Carnegie buckets that
 * map to the WEIGHTS table in HEBrandEquity.jsx, then merges in the curated
 * overlay (US News rank, social, Niche, Caldwell, etc.) where available.
 *
 * Outputs:
 *   src/data/institutionsSeed.json   - one row per institution
 *   /tmp/institutions.copy.tsv       - tab-separated file for psql COPY
 *
 * Run:
 *   node scripts/fetch-ipeds-seed.mjs
 *   psql -c "TRUNCATE public.institutions" \
 *     && psql -c "\\copy public.institutions(unitid,name,city,state,sector,carnegie_id,us_news_list,flags,enrollment,fte,metrics,finance,rankings,fiscal_year) FROM '/tmp/institutions.copy.tsv'"
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TMP = await fs.mkdtemp(path.join(os.tmpdir(), 'ipeds-seed-'));

const FY_LABEL = 'FY2022-23';
const BASE = 'https://nces.ed.gov/ipeds/datacenter/data';

const FILES = {
  hd:    'HD2022.zip',
  drvef: 'DRVEF2022.zip',
  drvgr: 'DRVGR2022.zip',
  adm:   'ADM2022.zip',
  sfa:   'SFA2122.zip',
  f1a:   'F2223_F1A.zip',
  f2:    'F2223_F2.zip',
};

// ── helpers ──────────────────────────────────────────────────────────────
async function downloadCsv(zipName) {
  const zipPath = path.join(TMP, zipName);
  console.log(`  ↓ ${zipName}`);
  const res = await fetch(`${BASE}/${zipName}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${zipName}`);
  await fs.writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', TMP]);
  const files = await fs.readdir(TMP);
  const stem = zipName.replace('.zip', '').toLowerCase();
  const csv = files.find(f => f.toLowerCase().startsWith(stem) && f.toLowerCase().endsWith('.csv') && !f.includes('_rv'));
  if (!csv) throw new Error(`No CSV from ${zipName} (got: ${files.join(',')})`);
  return path.join(TMP, csv);
}

function splitCsvLine(line) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

async function parseCsv(filePath) {
  // Try utf8 first; IPEDS sometimes ships latin1
  let text;
  try { text = await fs.readFile(filePath, 'utf8'); }
  catch { text = (await fs.readFile(filePath)).toString('latin1'); }
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = cells[j];
    rows.push(row);
  }
  return rows;
}

function num(v) {
  if (v == null || v === '' || v === '.') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── Carnegie 2021 BASIC code → WEIGHTS key in HEBrandEquity.jsx ─────────
// Source: IPEDS HD data dictionary, C21BASIC field
function mapCarnegie(c21) {
  const n = num(c21);
  if (n == null) return null;
  if (n === 15) return 'r1';
  if (n === 16) return 'r2';
  if (n === 17) return 'rcu';                 // Doctoral/Professional
  if (n === 18 || n === 19 || n === 20) return 'mixed_masters'; // M1/M2/M3
  if (n === 21) return 'bac_arts';
  if (n === 22) return 'mixed_bac';           // Diverse fields
  if (n === 23) return 'prof_bac';            // Bac/Associate's mixed
  if (n >= 1 && n <= 14) return 'associates';
  if (n === 24) return 'associates';
  if (n >= 25 && n <= 32) return 'special';
  if (n === 33) return 'tribal';
  return null;
}

function mapSector(control) {
  const n = num(control);
  if (n === 1) return 'public';
  if (n === 2) return 'private_nonprofit';
  if (n === 3) return 'private_for_profit';
  return null;
}

// ── main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Seeding US institutions  (IPEDS ${FY_LABEL})\n`);

  const paths = {};
  for (const [k, zip] of Object.entries(FILES)) {
    paths[k] = await downloadCsv(zip);
  }

  console.log('\n  parsing CSVs...');
  const [hd, drvef, drvgr, adm, sfa, f1a, f2] = await Promise.all([
    parseCsv(paths.hd),
    parseCsv(paths.drvef),
    parseCsv(paths.drvgr),
    parseCsv(paths.adm),
    parseCsv(paths.sfa),
    parseCsv(paths.f1a),
    parseCsv(paths.f2),
  ]);

  const idx = (rows) => new Map(rows.map(r => [r.UNITID, r]));
  const HD = idx(hd), EF = idx(drvef), GR = idx(drvgr), AD = idx(adm),
        SF = idx(sfa), PUB = idx(f1a), PRIV = idx(f2);

  // Curated overlay
  const overlayPath = path.join(ROOT, 'src/data/curatedOverlay.json');
  const overlay = JSON.parse(await fs.readFile(overlayPath, 'utf8'));

  const KEEP_CARNEGIE = new Set(['r1','r2','rcu','mixed_doc','prof_doc',
    'mixed_masters','prof_masters','mixed_bac','prof_bac','bac_arts']);

  const out = {};
  let total = 0, kept = 0, withFinance = 0, overlaid = 0;

  for (const row of hd) {
    total++;
    const unitid = row.UNITID;
    const sector = mapSector(row.CONTROL);
    const carnegie = mapCarnegie(row.C21BASIC);

    // Phase 1 scope: 4-year degree-granting in our weighted cohorts
    if (!sector || !carnegie || !KEEP_CARNEGIE.has(carnegie)) continue;
    if (num(row.ICLEVEL) !== 1) continue; // 1 = 4-year
    if (num(row.DEGGRANT) !== 1) continue; // degree-granting
    if (num(row.PSEFLAG) !== 1) continue; // postsecondary, Title-IV active

    kept++;
    const ef = EF.get(unitid);
    const gr = GR.get(unitid);
    const ad = AD.get(unitid);
    const sf = SF.get(unitid);
    const pub = PUB.get(unitid);
    const priv = PRIV.get(unitid);

    const fte = ef ? num(ef.FTE) : null;
    const enrollment = ef ? num(ef.EFTOTLT) : null;

    const applicants = ad ? num(ad.APPLCN) : null;
    const admits     = ad ? num(ad.ADMSSN) : null;
    const enrolled   = ad ? num(ad.ENRLT) : null;
    const acceptRate = (admits != null && applicants) ? Math.round((admits / applicants) * 100) : null;
    const yieldRate  = (enrolled != null && admits) ? Math.round((enrolled / admits) * 100) : null;

    const retentionRate = gr ? num(gr.RET_PCF) : null;
    // DRVGR: GBA4RTT (4-yr grad, all), GBA6RTT (6-yr grad, all)
    const gradRate4yr = gr ? num(gr.GBA4RTT) : null;
    const gradRate6yr = gr ? num(gr.GBA6RTT) : null;

    const pellPct = sf ? num(sf.UPGRNTP) : null; // % undergrads receiving Pell

    const totalRevUsd = pub ? num(pub.F1B25) : priv ? num(priv.F2D18) : null;
    const endowUsd    = pub ? num(pub.F1H02) : priv ? num(priv.F2H02) : null;
    if (totalRevUsd != null || endowUsd != null) withFinance++;

    const baseRow = {
      unitid,
      name: (row.INSTNM || '').replace(/"/g, '').trim(),
      city: (row.CITY || '').trim() || null,
      state: (row.STABBR || '').trim() || null,
      sector,
      carnegie_id: carnegie,
      us_news_list: null,
      flags: {
        bigFour: 0,
        d1: 0,
        health: num(row.HOSPITAL) === 1 ? 1 : 0,    // HD has HOSPITAL field
        law: 0,                                      // not in HD; overlay only
        eng: 0,                                      // overlay only
        aacsb: 0,                                    // overlay only
      },
      enrollment,
      fte,
      metrics: {
        retentionRate, gradRate4yr, gradRate6yr,
        yieldRate, acceptRate, pellPct,
        firstGen: null,
        rAndD: null,
        doctoralOutput: null,
        researchDesignation: carnegie === 'r1' ? 3 : carnegie === 'r2' ? 2 : carnegie === 'rcu' ? 1 : 0,
        enrollTrend: null,
      },
      finance: {
        totalRevenue:        totalRevUsd != null ? Math.round(totalRevUsd / 1_000_000) : null,
        endowmentTotal:      endowUsd != null ? Math.round(endowUsd / 1_000_000) : null,
        endowmentPerStudent: (endowUsd != null && fte) ? Math.round((endowUsd / fte) / 1000) : null,
        fiscalYear: FY_LABEL,
      },
      rankings: {
        usNews: null, usNewsLaw: null, usNewsBiz: null, usNewsEng: null,
        qsRank: null, theWorldRank: null,
        theImpactListed: null, theImpactRank: null,
        nicheRank: null, nicheGrade: null,
        caldwellListed: null, caldwellRank: null,
      },
      fiscal_year: FY_LABEL,
    };

    // Overlay: merge curated values on top
    const ov = overlay[unitid];
    if (ov) {
      overlaid++;
      if (ov.usNewsList) baseRow.us_news_list = ov.usNewsList;
      if (ov.flags) baseRow.flags = { ...baseRow.flags, ...ov.flags };
      const m = baseRow.metrics;
      for (const k of ['retentionRate','gradRate4yr','gradRate6yr','yieldRate','acceptRate','pellPct','firstGen','rAndD','doctoralOutput','researchDesignation','enrollTrend']) {
        if (ov[k] != null) m[k] = ov[k];
      }
      const r = baseRow.rankings;
      for (const k of ['usNews','usNewsLaw','usNewsBiz','usNewsEng','qsRank','theWorldRank','theImpactListed','theImpactRank','nicheRank','nicheGrade','caldwellListed','caldwellRank']) {
        if (ov[k] != null) r[k] = ov[k];
      }
      // Carnegie overlay wins (curated knows the 2025 distinction better than auto-mapping)
      if (ov.carnegieId) baseRow.carnegie_id = ov.carnegieId;
    }

    out[unitid] = baseRow;
  }

  // Write JSON
  const jsonDest = path.join(ROOT, 'src/data/institutionsSeed.json');
  await fs.writeFile(jsonDest, JSON.stringify({
    _meta: {
      source: 'IPEDS Data Center (https://nces.ed.gov/ipeds/datacenter/)',
      files: Object.values(FILES),
      license: 'Public domain (U.S. Department of Education)',
      fetchedAt: new Date().toISOString(),
      fiscalYear: FY_LABEL,
      counts: { totalHD: total, kept, withFinance, overlaid },
    },
    institutions: out,
  }, null, 2) + '\n');

  // Write TSV for psql COPY
  const tsvLines = [];
  const esc = (v) => {
    if (v == null) return '\\N';
    const s = String(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, ' ');
    return s;
  };
  const j = (obj) => esc(JSON.stringify(obj));
  for (const r of Object.values(out)) {
    tsvLines.push([
      esc(r.unitid), esc(r.name), esc(r.city), esc(r.state), esc(r.sector),
      esc(r.carnegie_id), esc(r.us_news_list), j(r.flags),
      esc(r.enrollment), esc(r.fte), j(r.metrics), j(r.finance), j(r.rankings),
      esc(r.fiscal_year),
    ].join('\t'));
  }
  const tsvPath = '/tmp/institutions.copy.tsv';
  await fs.writeFile(tsvPath, tsvLines.join('\n') + '\n');

  console.log(`\n  Total HD rows:    ${total}`);
  console.log(`  Kept (4yr/cohort): ${kept}`);
  console.log(`  With finance:      ${withFinance}`);
  console.log(`  Overlay applied:   ${overlaid}`);
  console.log(`\n  ✓ ${jsonDest}`);
  console.log(`  ✓ ${tsvPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
