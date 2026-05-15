#!/usr/bin/env node
/**
 * fetch-ipeds-seed.mjs  (v2 — updated May 2026)
 *
 * Pulls IPEDS files + reads the local 2025 ACE Carnegie data file to seed
 * the Supabase `institutions` table with all US degree-granting institutions.
 *
 * IPEDS files downloaded:
 *   HD2022.zip      - Directory: name, city, state, sector, control, HOSPITAL flag
 *   DRVEF2022.zip   - Derived enrollment (12-month FTE, total headcount)
 *   DRVGR2022.zip   - Derived grad rates (4-yr, 6-yr) + retention rate
 *   ADM2022.zip     - Admissions: applicants, admits, enrolled (yield, accept rate)
 *   SFA2122.zip     - Student financial aid: % receiving Pell, % first-gen
 *   F2223_F1A.zip   - Public institution finance (revenue, endowment)
 *   F2223_F2.zip    - Private institution finance (revenue, endowment)
 *   EF2022A.zip     - Fall enrollment by race/ethnicity (first-gen proxy)
 *   SFA_RV.zip      - NSF HERD R&D expenditures (rAndD field)
 *
 * Local file required:
 *   scripts/data/2025-Public-Data-File.xlsx  (ACE Carnegie 2025 public data file)
 *   Download from: https://carnegieclassifications.acenet.edu/carnegie-classification/resources/
 *
 * The 2025 ACE file provides:
 *   - ic2025 / ic2025name  — 2025 Institutional Classification (31 categories)
 *   - saec2025 / saec2025name — Student Access & Earnings tier
 *   - research2025 / research2025name — Research Activity Designation
 *   - basic2021  — 2021 Carnegie Basic (for backward-compatible weighting)
 *   - pell_2023  — Real Pell % from IPEDS 2022-23
 *   - access_ratio / earnings_ratio — SAEC ratios
 *   - herd_avg   — 3-year average R&D expenditures (replaces rAndD from NSF)
 *   - rdoc_avg   — 3-year average research doctorates awarded
 *   - medical    — binary medical school flag
 *   - hbcu/tribal/hsi/pbi/womenonly — institution type flags
 *
 * Outputs:
 *   src/data/institutionsSeed.json   — one row per institution (for local dev)
 *   /tmp/institutions.copy.tsv       — tab-separated for psql COPY
 *
 * Run:
 *   node scripts/fetch-ipeds-seed.mjs
 *
 * Then load into Supabase:
 *   psql $DATABASE_URL -c "TRUNCATE public.institutions CASCADE"
 *   psql $DATABASE_URL -c "\copy public.institutions(unitid,name,city,state,sector,carnegie_id,us_news_list,flags,enrollment,fte,metrics,finance,rankings,carnegie2025,fiscal_year) FROM '/tmp/institutions.copy.tsv'"
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
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

// ── Helpers ───────────────────────────────────────────────────────────────

async function downloadCsv(zipName) {
  const zipPath = path.join(TMP, zipName);
  console.log(`  ↓ ${zipName}`);
  const res = await fetch(`${BASE}/${zipName}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${zipName}`);
  await fs.writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', TMP]);
  const files = await fs.readdir(TMP);
  const stem = zipName.replace('.zip', '').toLowerCase();
  const csv = files.find(
    f => f.toLowerCase().startsWith(stem) &&
         f.toLowerCase().endsWith('.csv') &&
         !f.includes('_rv')
  );
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

// ── 2025 ACE Carnegie file loader ─────────────────────────────────────────
// Reads the local 2025-Public-Data-File.xlsx and returns a Map keyed by unitid

async function loadAceData() {
  const acePath = path.join(__dirname, 'data', '2025-Public-Data-File.xlsx');

  try {
    await fs.access(acePath);
  } catch {
    console.warn(`\n  ⚠ ACE 2025 data file not found at ${acePath}`);
    console.warn('    Download from: https://carnegieclassifications.acenet.edu/carnegie-classification/resources/');
    console.warn('    Place at: scripts/data/2025-Public-Data-File.xlsx');
    console.warn('    Proceeding without 2025 Carnegie data...\n');
    return new Map();
  }

  // Use xlsx package (install: npm i xlsx)
  let XLSX;
  try { XLSX = require('xlsx'); }
  catch {
    console.warn('  ⚠ xlsx package not installed. Run: npm i xlsx');
    console.warn('    Proceeding without 2025 Carnegie data...\n');
    return new Map();
  }

  console.log('  ↓ Reading ACE 2025 Carnegie data file...');
  const wb = XLSX.readFile(acePath, { sheetRows: 0 });
  const ws = wb.Sheets['data'];
  const rows = XLSX.utils.sheet_to_json(ws, { raw: true, defval: null });

  const aceMap = new Map();
  for (const r of rows) {
    const uid = String(r.unitid || '').trim();
    if (!uid) continue;

    // Map research2025 → our 0-3 scale
    // ACE: 1=R1, 2=R2, 3=Research College, -2=None
    const researchAce = num(r.research2025);
    const researchDesignation = researchAce === 1 ? 3
                              : researchAce === 2 ? 2
                              : researchAce === 3 ? 1
                              : 0;

    // Map saec2025 → numeric score for diversity dimension
    // ACE values from data: 1=Opportunity, 2=Higher/Higher, 3=Higher/Medium,
    //   4=Higher/Lower, 5=Lower/Higher, 6=Lower/Medium, 7=Lower/Lower, -2=N/A
    const saecAce = num(r.saec2025);
    const saecScore = saecAce === 1 ? 6   // Opportunity
                    : saecAce === 2 ? 6   // Higher Access, Higher Earnings
                    : saecAce === 3 ? 5   // Higher Access, Medium Earnings
                    : saecAce === 4 ? 4   // Higher Access, Lower Earnings
                    : saecAce === 5 ? 2   // Lower Access, Higher Earnings
                    : saecAce === 6 ? 1   // Lower Access, Medium Earnings
                    : saecAce === 7 ? 0   // Lower Access, Lower Earnings
                    : null;

    aceMap.set(uid, {
      // 2025 Institutional Classification
      ic2025:      num(r.ic2025),
      ic2025name:  r.ic2025name ?? null,

      // 2025 Student Access & Earnings
      saec2025:    saecAce,
      saec2025name: r.saec2025name ?? null,
      saecScore,
      accessRatio:  r.access_ratio != null ? Math.round(num(r.access_ratio) * 100) / 100 : null,
      earningsRatio: r.earnings_ratio != null ? Math.round(num(r.earnings_ratio) * 100) / 100 : null,

      // 2025 Research Activity Designation (our 0-3 scale)
      researchDesignation,
      research2025name: r.research2025name ?? null,

      // Real Pell % from 2022-23 IPEDS (more accurate than SFA survey)
      pellPct: r.pell_2023 != null ? Math.round(num(r.pell_2023) * 1000) / 10 : null,

      // R&D and doctoral output from 3-year HERD averages
      rAndD: r.herd_avg != null ? Math.round(num(r.herd_avg) / 1000) : null, // convert $K → $M
      doctoralOutput: r.rdoc_avg != null ? Math.round(num(r.rdoc_avg)) : null,

      // Institution type flags from ACE
      medicalFlag:  num(r.medical) === 1 ? 1 : 0,
      womenOnly:    num(r.womenonly) === 1 ? 1 : 0,
      hbcu:         num(r.hbcu) === 1 ? 1 : 0,
      tribal:       num(r.tribal) === 1 ? 1 : 0,
      hsi:          num(r.hsi) === 1 ? 1 : 0,
      landGrant:    num(r.landgrant) === 1 ? 1 : 0,

      // 2021 Basic Classification code (for carnegieId mapping)
      basic2021: num(r.basic2021),
    });
  }

  console.log(`  ✓ ACE data loaded: ${aceMap.size.toLocaleString()} institutions`);
  return aceMap;
}

// ── 2021 Carnegie BASIC → WEIGHTS key mapping ─────────────────────────────
// Uses 2021 basic code from ACE file (more reliable than HD C21BASIC field)
// Maps to the carnegieId values used in the WEIGHTS object in HEBrandEquity.jsx

function mapCarnegie2021(basic2021) {
  const n = num(basic2021);
  if (n == null || n < 0) return null;

  // Doctoral
  if (n === 15) return 'r1';           // Doctoral Universities: Very High Research
  if (n === 16) return 'r2';           // Doctoral Universities: High Research
  if (n === 17) return 'r3';           // Doctoral/Professional Universities

  // Master's
  if (n === 18) return 'masters_l';    // Master's Colleges: Larger
  if (n === 19) return 'masters_m';    // Master's Colleges: Medium
  if (n === 20) return 'masters_s';    // Master's Colleges: Smaller

  // Baccalaureate
  if (n === 21) return 'bac_arts';     // Baccalaureate: Arts & Sciences
  if (n === 22) return 'bac_diverse';  // Baccalaureate: Diverse Fields

  // Associate
  if (n >= 1 && n <= 14) return 'associates';
  if (n === 23) return 'associates';   // Baccalaureate/Associate Mixed

  // Special Focus
  if (n >= 25 && n <= 32) return 'special';

  // Tribal
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

// ── US News list assignment by Carnegie type ───────────────────────────────
function mapUsNewsList(carnegieId) {
  if (['r1','r2','r3'].includes(carnegieId)) return 'natl_univ';
  if (carnegieId === 'bac_arts') return 'lib_arts';
  if (['masters_l','masters_m','masters_s','bac_diverse'].includes(carnegieId)) return 'regional';
  if (carnegieId === 'associates') return 'best_colleges';
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nSeeding US institutions  (IPEDS ${FY_LABEL} + ACE Carnegie 2025)\n`);

  // Load ACE 2025 data first
  const aceData = await loadAceData();

  // Download IPEDS files
  console.log('\nDownloading IPEDS files...');
  const paths = {};
  for (const [k, zip] of Object.entries(FILES)) {
    paths[k] = await downloadCsv(zip);
  }

  console.log('\n  Parsing CSVs...');
  const [hd, drvef, drvgr, adm, sfa, f1a, f2] = await Promise.all([
    parseCsv(paths.hd),
    parseCsv(paths.drvef),
    parseCsv(paths.drvgr),
    parseCsv(paths.adm),
    parseCsv(paths.sfa),
    parseCsv(paths.f1a),
    parseCsv(paths.f2),
  ]);

  const idx = rows => new Map(rows.map(r => [r.UNITID, r]));
  const HD = idx(hd), EF = idx(drvef), GR = idx(drvgr), AD = idx(adm),
        SF = idx(sfa), PUB = idx(f1a), PRIV = idx(f2);

  // Curated overlay (US News, QS, THE, Niche, Caldwell, athletics, law/biz/eng flags)
  const overlayPath = path.join(ROOT, 'src/data/curatedOverlay.json');
  let overlay = {};
  try {
    overlay = JSON.parse(await fs.readFile(overlayPath, 'utf8'));
    console.log(`  ✓ Curated overlay: ${Object.keys(overlay).length} institutions`);
  } catch {
    console.warn('  ⚠ No curatedOverlay.json found — rankings will be null');
  }

  // Scope: all 4-year degree-granting Title IV institutions
  // Plus associates (community colleges) — expanded from Phase 1
  const KEEP_CARNEGIE = new Set([
    'r1','r2','r3',
    'masters_l','masters_m','masters_s',
    'bac_arts','bac_diverse',
    'special','tribal','associates',
  ]);

  const out = {};
  let total = 0, kept = 0, withAce = 0, withFinance = 0, overlaid = 0;

  for (const row of hd) {
    total++;
    const unitid = row.UNITID;
    const sector = mapSector(row.CONTROL);

    // Use ACE 2021 basic code if available; fallback to HD C21BASIC
    const ace = aceData.get(unitid);
    const basic2021 = ace?.basic2021 ?? num(row.C21BASIC);
    const carnegieId = mapCarnegie2021(basic2021);

    if (!sector || !carnegieId) continue;
    if (!KEEP_CARNEGIE.has(carnegieId)) continue;
    if (num(row.ICLEVEL) !== 1) continue;   // 4-year only
    if (num(row.DEGGRANT) !== 1) continue;  // degree-granting only
    if (num(row.PSEFLAG) !== 1) continue;   // Title IV active

    kept++;
    if (ace) withAce++;

    const ef   = EF.get(unitid);
    const gr   = GR.get(unitid);
    const ad   = AD.get(unitid);
    const sf   = SF.get(unitid);
    const pub  = PUB.get(unitid);
    const priv = PRIV.get(unitid);

    const fte        = ef ? num(ef.FTE) : null;
    const enrollment = ef ? num(ef.EFTOTLT) : null;

    const applicants = ad ? num(ad.APPLCN) : null;
    const admits     = ad ? num(ad.ADMSSN) : null;
    const enrolled   = ad ? num(ad.ENRLT) : null;
    const acceptRate = (admits && applicants) ? Math.round((admits / applicants) * 100) : null;
    const yieldRate  = (enrolled && admits) ? Math.round((enrolled / admits) * 100) : null;

    const retentionRate = gr ? num(gr.RET_PCF) : null;
    const gradRate4yr   = gr ? num(gr.GBA4RTT) : null;
    const gradRate6yr   = gr ? num(gr.GBA6RTT) : null;

    // Pell: prefer ACE real value; fallback to SFA survey
    const pellPct = ace?.pellPct ?? (sf ? num(sf.UPGRNTP) : null);

    // R&D: prefer ACE herd_avg (3yr NSF average); fallback null
    const rAndD = ace?.rAndD ?? null;
    const doctoralOutput = ace?.doctoralOutput ?? null;

    // Research designation: prefer ACE 2025; fallback from 2021 carnegieId
    const researchDesignation = ace?.researchDesignation
      ?? (carnegieId === 'r1' ? 3 : carnegieId === 'r2' ? 2 : 0);

    // Finance
    const totalRevRaw = pub ? num(pub.F1B25) : priv ? num(priv.F2D18) : null;
    const endowRaw    = pub ? num(pub.F1H02) : priv ? num(priv.F2H02) : null;
    if (totalRevRaw != null || endowRaw != null) withFinance++;

    const totalRevenue       = totalRevRaw != null ? Math.round(totalRevRaw / 1_000_000) : null;
    const endowmentTotal     = endowRaw != null ? Math.round(endowRaw / 1_000_000) : null;
    const endowmentPerStudent = (endowRaw != null && fte && fte > 0)
      ? Math.round((endowRaw / fte) / 1_000)
      : null;

    // Flags — combine IPEDS HD flags with ACE flags
    const hospitalFlag = num(row.HOSPITAL) === 1 ? 1 : 0;
    const medicalFlag  = ace?.medicalFlag ?? hospitalFlag;

    const baseRow = {
      unitid,
      name: (row.INSTNM || '').replace(/"/g, '').trim(),
      city: (row.CITY || '').trim() || null,
      state: (row.STABBR || '').trim() || null,
      sector,
      carnegie_id: carnegieId,
      us_news_list: mapUsNewsList(carnegieId),

      flags: {
        bigFour:   0,  // curated overlay only
        d1:        0,  // curated overlay only
        health:    medicalFlag,
        law:       0,  // curated overlay only
        eng:       0,  // curated overlay only
        aacsb:     0,  // curated overlay only
        womenOnly: ace?.womenOnly ?? 0,
        hbcu:      ace?.hbcu ?? (num(row.HBCU) === 1 ? 1 : 0),
        tribal:    ace?.tribal ?? (num(row.TRIBAL) === 1 ? 1 : 0),
        hsi:       ace?.hsi ?? (num(row.HSI) === 1 ? 1 : 0),
        landGrant: ace?.landGrant ?? 0,
      },

      enrollment,
      fte,

      metrics: {
        retentionRate,
        gradRate4yr,
        gradRate6yr,
        yieldRate,
        acceptRate,
        pellPct,
        firstGen: null,       // not in current IPEDS pull; curated overlay
        rAndD,
        doctoralOutput,
        researchDesignation,
        enrollTrend: null,    // requires multi-year; curated overlay
        accessRatio:   ace?.accessRatio ?? null,
        saecScore:     ace?.saecScore ?? null,
        earningsRatio: ace?.earningsRatio ?? null,
      },

      finance: {
        totalRevenue,
        endowmentTotal,
        endowmentPerStudent,
        fiscalYear: FY_LABEL,
      },

      rankings: {
        usNews:        null,
        usNewsLaw:     null,
        usNewsBiz:     null,
        usNewsEng:     null,
        qsRank:        null,
        theWorldRank:  null,
        theImpactListed: null,
        theImpactRank: null,
        nicheRank:     null,
        nicheGrade:    null,
        caldwellListed: null,
        caldwellRank:  null,
        socialIg:      null,
        socialLi:      null,
        socialX:       null,
        socialFb:      null,
        socialYt:      null,
      },

      // New column: 2025 Carnegie data (all three frameworks)
      carnegie2025: ace ? {
        ic2025:       ace.ic2025,
        ic2025name:   ace.ic2025name,
        saec2025:     ace.saec2025,
        saec2025name: ace.saec2025name,
        saecScore:    ace.saecScore,
        accessRatio:  ace.accessRatio,
        earningsRatio: ace.earningsRatio,
        researchDesignation: ace.researchDesignation,
        research2025name: ace.research2025name,
      } : null,

      fiscal_year: FY_LABEL,
    };

    // Apply curated overlay on top
    const ov = overlay[unitid];
    if (ov) {
      overlaid++;
      if (ov.usNewsList) baseRow.us_news_list = ov.usNewsList;
      if (ov.carnegieId) baseRow.carnegie_id = ov.carnegieId;
      if (ov.flags) baseRow.flags = { ...baseRow.flags, ...ov.flags };

      const m = baseRow.metrics;
      for (const k of [
        'retentionRate','gradRate4yr','gradRate6yr','yieldRate','acceptRate',
        'pellPct','firstGen','rAndD','doctoralOutput','researchDesignation','enrollTrend'
      ]) {
        if (ov[k] != null) m[k] = ov[k];
      }

      const r = baseRow.rankings;
      for (const k of [
        'usNews','usNewsLaw','usNewsBiz','usNewsEng','qsRank','theWorldRank',
        'theImpactListed','theImpactRank','nicheRank','nicheGrade',
        'caldwellListed','caldwellRank',
        'socialIg','socialLi','socialX','socialFb','socialYt'
      ]) {
        if (ov[k] != null) r[k] = ov[k];
      }
    }

    out[unitid] = baseRow;
  }

  // ── Write outputs ─────────────────────────────────────────────────────

  // JSON for local dev / inspection
  const jsonDest = path.join(ROOT, 'src/data/institutionsSeed.json');
  await fs.writeFile(jsonDest, JSON.stringify({
    _meta: {
      source: 'IPEDS Data Center (https://nces.ed.gov/ipeds/datacenter/) + ACE Carnegie 2025',
      ipeds_files: Object.values(FILES),
      ace_file: '2025-Public-Data-File.xlsx',
      license: 'Public domain (U.S. Department of Education / ACE)',
      fetchedAt: new Date().toISOString(),
      fiscalYear: FY_LABEL,
      counts: { totalHD: total, kept, withAce, withFinance, overlaid },
    },
    institutions: out,
  }, null, 2) + '\n');

  // TSV for psql COPY
  const esc = v => {
    if (v == null) return '\\N';
    return String(v)
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, ' ');
  };
  const j = obj => esc(JSON.stringify(obj));

  const tsvLines = Object.values(out).map(r => [
    esc(r.unitid), esc(r.name), esc(r.city), esc(r.state), esc(r.sector),
    esc(r.carnegie_id), esc(r.us_news_list), j(r.flags),
    esc(r.enrollment), esc(r.fte),
    j(r.metrics), j(r.finance), j(r.rankings),
    j(r.carnegie2025),
    esc(r.fiscal_year),
  ].join('\t'));

  const tsvPath = '/tmp/institutions.copy.tsv';
  await fs.writeFile(tsvPath, tsvLines.join('\n') + '\n');

  console.log(`\n  Total HD rows:     ${total.toLocaleString()}`);
  console.log(`  Kept (in scope):   ${kept.toLocaleString()}`);
  console.log(`  With ACE 2025:     ${withAce.toLocaleString()}`);
  console.log(`  With finance:      ${withFinance.toLocaleString()}`);
  console.log(`  Overlay applied:   ${overlaid.toLocaleString()}`);
  console.log(`\n  ✓ ${jsonDest}`);
  console.log(`  ✓ ${tsvPath}`);
  console.log(`\n  Next step: load into Supabase`);
  console.log(`  psql $DATABASE_URL -c "TRUNCATE public.institutions CASCADE"`);
  console.log(`  psql $DATABASE_URL -c "\\copy public.institutions(...) FROM '${tsvPath}'"`);
}

main().catch(e => { console.error(e); process.exit(1); });
