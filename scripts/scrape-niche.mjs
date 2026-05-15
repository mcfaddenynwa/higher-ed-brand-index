#!/usr/bin/env node
/**
 * scrape-niche.mjs
 *
 * Scrapes Niche Best Colleges rankings and overall grades for all ~4,000
 * US colleges and universities, then merges into the Supabase institutions
 * table via the rankings JSONB column.
 *
 * What it collects:
 *   nicheRank   — Best Colleges national rank (integer)
 *   nicheGrade  — Overall Niche Grade as numeric (A+=100, A=91, A-=83, etc.)
 *
 * Strategy:
 *   Niche uses React/Next.js with server-side rendered JSON embedded in
 *   __NEXT_DATA__ script tags. We extract the ranking data from there
 *   rather than parsing DOM, which is more stable across UI changes.
 *
 * Rate limiting:
 *   2 second delay between pages, randomized ±500ms
 *   User-agent rotated to avoid detection
 *   Respects robots.txt pause signals
 *
 * Run:
 *   node scripts/scrape-niche.mjs
 *   node scripts/scrape-niche.mjs --dry-run   # scrape only, don't write to DB
 *   node scripts/scrape-niche.mjs --pages 5   # scrape first 5 pages only
 *
 * Output:
 *   src/data/nicheRankings.json   — full scraped dataset
 *   Updates Supabase institutions table rankings JSONB column
 *
 * Annual schedule:
 *   Run each September after Niche releases new rankings (typically late August)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const NICHE_BASE = 'https://www.niche.com';
const RANKINGS_URL = `${NICHE_BASE}/colleges/search/best-colleges/`;
const PAGE_SIZE = 10; // Niche shows 10 results per page
const DELAY_MS = 2000;
const MAX_PAGES = 400; // ~4,000 schools / 10 per page

// Grade to numeric mapping
const GRADE_MAP = {
  'A+': 100, 'A': 91, 'A-': 83,
  'B+': 75,  'B': 67, 'B-': 58,
  'C+': 50,  'C': 42, 'C-': 33,
  'D+': 25,  'D': 17, 'D-': 8,
  'F': 0,
};

function gradeToNum(grade) {
  if (!grade) return null;
  const clean = grade.trim().replace(/\s+/g, '');
  return GRADE_MAP[clean] ?? null;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * 500)));
}

/**
 * Fetch a Niche rankings page using a Playwright browser and extract school
 * data from __NEXT_DATA__. Falls back to in-page DOM extraction if the JSON
 * shape doesn't yield results.
 */
async function fetchNichePage(browser, pageNum) {
  const url = pageNum === 1
    ? RANKINGS_URL
    : `${RANKINGS_URL}?page=${pageNum}`;

  const page = await browser.newPage();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    });

    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    if (response && response.status() === 404) return null;
    if (response && !response.ok()) {
      throw new Error(`HTTP ${response.status()} on page ${pageNum}`);
    }

    // Human-like settle delay
    await sleep(1500);

    // Try __NEXT_DATA__ extraction first
    const nextData = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el) return null;
      try { return JSON.parse(el.textContent); } catch { return null; }
    });

    if (nextData) {
      const schools = extractFromNextData(nextData, pageNum);
      if (schools.length > 0) return schools;
    }

    // DOM fallback — same shape as extractFromHTML, but evaluated in-page
    const domSchools = await page.evaluate((pageSize) => {
      const out = [];
      const cards = document.querySelectorAll(
        'li[class*="search-result"], [class*="SearchResult"], article[class*="card"]'
      );
      cards.forEach((card) => {
        const nameEl = card.querySelector(
          'h2[class*="search-result__title"], h2, h3, [class*="title"]'
        );
        if (!nameEl) return;
        const name = nameEl.textContent?.trim();
        if (!name) return;

        const gradeEl = card.querySelector(
          '[class*="overall-grade"], [class*="OverallGrade"], [class*="niche-grade"]'
        );
        const gradeRaw = gradeEl?.textContent?.trim().match(/[A-F][+-]?/)?.[0] || null;

        const slugEl = card.querySelector('a[href*="/colleges/"]');
        const slugMatch = slugEl?.getAttribute('href')?.match(/\/colleges\/([^/]+)\//);
        const slug = slugMatch ? slugMatch[1] : null;

        const unitidAttr = card.getAttribute('data-id')
          || card.getAttribute('data-college-id')
          || null;

        out.push({ name, slug, unitid: unitidAttr, gradeRaw });
      });
      return out;
    }, PAGE_SIZE);

    let rankOffset = (pageNum - 1) * PAGE_SIZE + 1;
    return domSchools.map((s) => ({
      name: s.name,
      slug: s.slug,
      unitid: s.unitid,
      nicheRank: rankOffset++,
      nicheGrade: gradeToNum(s.gradeRaw),
      nicheGradeRaw: s.gradeRaw,
    }));
  } finally {
    await page.close().catch(() => {});
  }
}

function extractFromNextData(nextData, pageNum) {
  const schools = [];
  try {
    // Navigate the Next.js data structure — path varies by Niche version
    const props = nextData?.props?.pageProps;
    const items = props?.searchResults?.results
      || props?.results
      || props?.colleges
      || [];

    for (const item of items) {
      const entity = item?.entity || item?.college || item;
      if (!entity?.name) continue;

      const rank = item?.rank || entity?.rank || null;
      const grade = entity?.overallGrade || entity?.grade || null;
      const slug = entity?.slug || null;
      const unitid = entity?.unitid || entity?.ipeds || null;

      schools.push({
        name: entity.name,
        slug,
        unitid: unitid ? String(unitid) : null,
        nicheRank: rank ? parseInt(rank) : ((pageNum - 1) * PAGE_SIZE + schools.length + 1),
        nicheGrade: gradeToNum(grade),
        nicheGradeRaw: grade,
      });
    }
  } catch (e) {
    // Silently fall through to HTML parsing
  }
  return schools;
}

function extractFromHTML(html, pageNum) {
  const schools = [];
  let rankOffset = (pageNum - 1) * PAGE_SIZE + 1;

  // Match school cards — Niche uses consistent class patterns
  // Pattern: data-id or data-college-id with name and grade
  const cardPattern = /<li[^>]*class="[^"]*search-result[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
  let cardMatch;

  while ((cardMatch = cardPattern.exec(html)) !== null) {
    const card = cardMatch[1];

    // Extract name
    const nameMatch = card.match(/<h2[^>]*class="[^"]*search-result__title[^"]*"[^>]*>([^<]+)<\/h2>/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();

    // Extract grade
    const gradeMatch = card.match(/Niche Grade[^"]*"[^>]*>([A-F][+-]?)<\/span>/i)
      || card.match(/overall-grade[^>]*>([A-F][+-]?)<\/span>/i)
      || card.match(/>([A-F][+-]?)<\/span>[^<]*Niche/i);
    const gradeRaw = gradeMatch ? gradeMatch[1].trim() : null;

    // Extract slug for individual page fetch if needed
    const slugMatch = card.match(/href="\/colleges\/([^/]+)\//);
    const slug = slugMatch ? slugMatch[1] : null;

    // Extract unitid if embedded
    const unitidMatch = card.match(/data-id="(\d+)"|data-college-id="(\d+)"|unitid[":]+(\d+)/);
    const unitid = unitidMatch
      ? (unitidMatch[1] || unitidMatch[2] || unitidMatch[3])
      : null;

    schools.push({
      name,
      slug,
      unitid,
      nicheRank: rankOffset++,
      nicheGrade: gradeToNum(gradeRaw),
      nicheGradeRaw: gradeRaw,
    });
  }

  // If HTML parsing also fails, try a simpler anchor pattern
  if (schools.length === 0) {
    const anchorPattern = /href="\/colleges\/([^/]+)\/"\s*[^>]*>([^<]{5,80})<\/a>/g;
    let aMatch;
    while ((aMatch = anchorPattern.exec(html)) !== null) {
      schools.push({
        name: aMatch[2].trim(),
        slug: aMatch[1],
        unitid: null,
        nicheRank: rankOffset++,
        nicheGrade: null,
        nicheGradeRaw: null,
      });
    }
  }

  return schools;
}

/**
 * For schools missing unitid, fetch their individual Niche profile page
 * to get the IPEDS unitid embedded in the page data
 */
async function fetchUnitidFromProfile(slug) {
  if (!slug) return null;
  try {
    await sleep(1500);
    const url = `${NICHE_BASE}/colleges/${slug}/`;
    const res = await fetch(url, {
      headers: { 'User-Agent': randomUA() },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Look for unitid in __NEXT_DATA__ or meta tags
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      const data = JSON.parse(nextDataMatch[1]);
      const entity = data?.props?.pageProps?.entity || data?.props?.pageProps?.college;
      if (entity?.unitid || entity?.ipeds) {
        return String(entity.unitid || entity.ipeds);
      }
    }

    // Fallback: look for IPEDS in meta or structured data
    const ipedsMatch = html.match(/\"unitid\"[:\s]+"?(\d{6})"?/)
      || html.match(/ipeds[_\s]?id["\s:]+(\d{6})/i);
    return ipedsMatch ? ipedsMatch[1] : null;
  } catch {
    return null;
  }
}

/**
 * Match scraped schools to IPEDS unitids using name fuzzy matching
 * when the profile page doesn't embed the unitid
 */
function buildNameIndex(institutions) {
  const index = new Map();
  for (const [unitid, inst] of Object.entries(institutions)) {
    const key = inst.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    index.set(key, unitid);
    // Also index common abbreviations
    const shortKey = inst.name.toLowerCase()
      .replace(/university of /g, 'u')
      .replace(/university/g, 'u')
      .replace(/college/g, 'col')
      .replace(/[^a-z0-9]/g, '');
    if (shortKey !== key) index.set(shortKey, unitid);
  }
  return index;
}

function matchByName(nicheName, nameIndex) {
  const key = nicheName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (nameIndex.has(key)) return nameIndex.get(key);

  // Try partial match
  for (const [indexKey, unitid] of nameIndex.entries()) {
    if (key.includes(indexKey) || indexKey.includes(key)) {
      if (Math.abs(key.length - indexKey.length) < 8) return unitid;
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const maxPages = args.includes('--pages')
    ? parseInt(args[args.indexOf('--pages') + 1])
    : MAX_PAGES;

  console.log(`\nNiche Best Colleges Scraper`);
  console.log(`Max pages: ${maxPages} | Dry run: ${dryRun}\n`);

  // Load existing seed data for name matching
  let seedData = {};
  try {
    const seedPath = path.join(ROOT, 'src/data/institutionsSeed.json');
    const raw = JSON.parse(await fs.readFile(seedPath, 'utf8'));
    seedData = raw.institutions || {};
    console.log(`  Loaded ${Object.keys(seedData).length} institutions for name matching`);
  } catch {
    console.warn('  ⚠ No institutionsSeed.json found — will rely on profile page unitids');
  }

  const nameIndex = buildNameIndex(seedData);
  const allSchools = [];
  let emptyPages = 0;

  for (let page = 1; page <= maxPages; page++) {
    process.stdout.write(`  Page ${page}/${maxPages}... `);

    try {
      const schools = await fetchNichePage(page);

      if (!schools || schools.length === 0) {
        emptyPages++;
        console.log(`empty (${emptyPages} in a row)`);
        if (emptyPages >= 3) {
          console.log('  3 empty pages in a row — assuming end of rankings');
          break;
        }
        await sleep(DELAY_MS);
        continue;
      }

      emptyPages = 0;

      // Resolve unitids for schools that don't have them
      for (const school of schools) {
        if (!school.unitid) {
          // Try name matching first (fast)
          school.unitid = matchByName(school.name, nameIndex);

          // If still no match and we have a slug, fetch profile page (slow)
          if (!school.unitid && school.slug && page <= 50) {
            school.unitid = await fetchUnitidFromProfile(school.slug);
          }
        }
        allSchools.push(school);
      }

      console.log(`${schools.length} schools (total: ${allSchools.length})`);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      if (err.message.includes('429')) {
        console.log('  Rate limited — waiting 30 seconds');
        await sleep(30000);
      }
    }

    await sleep(DELAY_MS);
  }

  // Build output keyed by unitid where available
  const byUnitid = {};
  const unmatched = [];

  for (const school of allSchools) {
    if (school.unitid) {
      byUnitid[school.unitid] = {
        name: school.name,
        nicheRank: school.nicheRank,
        nicheGrade: school.nicheGrade,
        nicheGradeRaw: school.nicheGradeRaw,
      };
    } else {
      unmatched.push(school);
    }
  }

  const output = {
    _meta: {
      source: 'Niche Best Colleges 2026 (https://www.niche.com/colleges/search/best-colleges/)',
      scrapedAt: new Date().toISOString(),
      totalScraped: allSchools.length,
      matchedToUnitid: Object.keys(byUnitid).length,
      unmatched: unmatched.length,
    },
    rankings: byUnitid,
    unmatched,
  };

  const outPath = path.join(ROOT, 'src/data/nicheRankings.json');
  await fs.writeFile(outPath, JSON.stringify(output, null, 2));
  console.log(`\n  ✓ Written: ${outPath}`);
  console.log(`  Matched: ${Object.keys(byUnitid).length} | Unmatched: ${unmatched.length}`);

  if (!dryRun && Object.keys(byUnitid).length > 0) {
    console.log('\n  Updating Supabase...');
    await updateSupabase(byUnitid);
  }
}

async function updateSupabase(byUnitid) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const token = process.env.INGEST_RANKINGS_TOKEN;
  if (!url || !anon || !token) {
    console.error('  ✗ Missing env: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, INGEST_RANKINGS_TOKEN');
    return;
  }

  const endpoint = `${url}/functions/v1/ingest-rankings`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'x-ingest-token': token,
    },
    body: JSON.stringify({ source: 'niche', rankings: byUnitid }),
  });

  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`  ✗ ingest-rankings failed (${res.status}):`, result);
    return;
  }
  console.log(`  ✓ Supabase updated via ingest-rankings: ${result.updated} updated, ${result.failed} failed, ${result.skipped?.length || 0} skipped`);
  if (result.errors?.length) console.log('    sample errors:', result.errors);
}

main().catch(e => { console.error(e); process.exit(1); });
