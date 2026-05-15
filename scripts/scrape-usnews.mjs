#!/usr/bin/env node
/**
 * scrape-usnews.mjs
 *
 * Scrapes US News Best Colleges rankings (National Universities, National
 * Liberal Arts Colleges, Regional Universities, Best Colleges) and merges
 * into the Supabase institutions table.
 *
 * What it collects:
 *   usNews       — overall rank within their list
 *   usNewsList   — which list (natl_univ, lib_arts, regional, best_colleges)
 *   usNewsLaw    — law school rank (top 50 only)
 *   usNewsBiz    — business school rank (top 50 only)
 *   usNewsEng    — engineering school rank (top 50 only)
 *
 * Strategy:
 *   US News uses Cloudflare and aggressive bot detection. This scraper uses:
 *   1. Playwright headless browser to render JavaScript
 *   2. Randomized delays and human-like behavior
 *   3. Extracts from __NEXT_DATA__ JSON where available
 *   4. Falls back to DOM extraction
 *
 * Prerequisites:
 *   npm install playwright
 *   npx playwright install chromium
 *
 * Run:
 *   node scripts/scrape-usnews.mjs
 *   node scripts/scrape-usnews.mjs --list natl_univ    # one list only
 *   node scripts/scrape-usnews.mjs --dry-run
 *
 * Note on ToS:
 *   US News data is publicly displayed. This scraper is rate-limited and
 *   non-aggressive. For commercial use at scale, consider a data license.
 *   Contact: licensing@usnews.com
 *
 * Annual schedule:
 *   Run each September after US News releases new rankings
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// US News ranking list configurations
const LISTS = {
  natl_univ: {
    label: 'National Universities',
    url: 'https://www.usnews.com/best-colleges/rankings/national-universities',
    maxPages: 20,
  },
  lib_arts: {
    label: 'National Liberal Arts Colleges',
    url: 'https://www.usnews.com/best-colleges/rankings/national-liberal-arts-colleges',
    maxPages: 15,
  },
  regional_north: {
    label: 'Regional Universities North',
    url: 'https://www.usnews.com/best-colleges/rankings/regional-universities-north',
    mapTo: 'regional',
    maxPages: 15,
  },
  regional_south: {
    label: 'Regional Universities South',
    url: 'https://www.usnews.com/best-colleges/rankings/regional-universities-south',
    mapTo: 'regional',
    maxPages: 15,
  },
  regional_midwest: {
    label: 'Regional Universities Midwest',
    url: 'https://www.usnews.com/best-colleges/rankings/regional-universities-midwest',
    mapTo: 'regional',
    maxPages: 15,
  },
  regional_west: {
    label: 'Regional Universities West',
    url: 'https://www.usnews.com/best-colleges/rankings/regional-universities-west',
    mapTo: 'regional',
    maxPages: 10,
  },
  // Program rankings (top 50 only — beyond that not meaningful for scoring)
  law: {
    label: 'Law Schools',
    url: 'https://www.usnews.com/best-graduate-schools/top-law-schools/law-rankings',
    maxPages: 5,
    field: 'usNewsLaw',
  },
  business: {
    label: 'Business Schools (MBA)',
    url: 'https://www.usnews.com/best-graduate-schools/top-business-schools/mba-rankings',
    maxPages: 5,
    field: 'usNewsBiz',
  },
  engineering: {
    label: 'Engineering Schools (Grad)',
    url: 'https://www.usnews.com/best-graduate-schools/top-engineering-schools/eng-rankings',
    maxPages: 5,
    field: 'usNewsEng',
  },
};

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * 1000)));
}

/**
 * Scrape a US News ranking page using Playwright
 * Returns array of { name, rank, unitid, slug }
 */
async function scrapePage(browser, url, pageNum, listKey) {
  const fullUrl = pageNum > 1 ? `${url}?_page=${pageNum}` : url;
  const page = await browser.newPage();

  try {
    // Set realistic viewport and user agent
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    });

    await page.goto(fullUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Random human-like delay after load
    await sleep(2000 + Math.random() * 2000);

    // Try __NEXT_DATA__ first
    const nextData = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      if (el) {
        try { return JSON.parse(el.textContent); }
        catch { return null; }
      }
      return null;
    });

    if (nextData) {
      const schools = extractFromNextData(nextData, pageNum, listKey);
      if (schools.length > 0) {
        await page.close();
        return schools;
      }
    }

    // DOM fallback
    const schools = await page.evaluate((pageNum) => {
      const results = [];
      const rankOffset = (pageNum - 1) * 25 + 1;

      // US News uses various selectors across list types
      const items = document.querySelectorAll(
        '[class*="RankingListItem"], [class*="ranking-item"], li[data-testid*="ranking"]'
      );

      items.forEach((item, idx) => {
        const nameEl = item.querySelector('h3, h2, [class*="school-name"], a[href*="/best-colleges/"]');
        const rankEl = item.querySelector('[class*="rank"], [class*="RankNumber"]');

        if (!nameEl) return;

        const name = nameEl.textContent?.trim();
        const rankText = rankEl?.textContent?.trim();
        const rank = rankText
          ? parseInt(rankText.replace(/[^0-9]/g, ''))
          : rankOffset + idx;

        const linkEl = item.querySelector('a[href*="/best-colleges/"], a[href*="/best-graduate"]');
        const slug = linkEl?.href?.match(/\/([^/]+)\/?$/)?.[1] || null;

        // Look for IPEDS unitid in data attributes
        const unitidAttr = item.getAttribute('data-unitid')
          || item.getAttribute('data-school-id')
          || item.querySelector('[data-unitid]')?.getAttribute('data-unitid');

        if (name && name.length > 2) {
          results.push({ name, rank, slug, unitid: unitidAttr || null });
        }
      });

      return results;
    }, pageNum);

    await page.close();
    return schools;

  } catch (err) {
    await page.close().catch(() => {});
    throw err;
  }
}

function extractFromNextData(nextData, pageNum, listKey) {
  const schools = [];
  try {
    // Navigate Next.js structure
    const pageProps = nextData?.props?.pageProps;
    const items = pageProps?.rankings
      || pageProps?.schools
      || pageProps?.searchResults?.results
      || pageProps?.data?.items
      || [];

    const rankOffset = (pageNum - 1) * 25;

    items.forEach((item, idx) => {
      const school = item?.institution || item?.school || item?.entity || item;
      if (!school?.displayName && !school?.name) return;

      schools.push({
        name: school.displayName || school.name,
        rank: item.rank || item.rankingPosition || (rankOffset + idx + 1),
        unitid: school.unitId || school.unitid || school.ipedsId
          ? String(school.unitId || school.unitid || school.ipedsId)
          : null,
        slug: school.urlSlug || school.slug || null,
      });
    });
  } catch {}
  return schools;
}

/**
 * Match by institution name when unitid not embedded
 */
function buildNameIndex(seedData) {
  const index = new Map();
  for (const [unitid, inst] of Object.entries(seedData)) {
    const normalize = s => s.toLowerCase()
      .replace(/the university of/g, 'university of')
      .replace(/[^a-z0-9 ]/g, '')
      .trim();
    const key = normalize(inst.name);
    index.set(key, unitid);
  }
  return index;
}

function matchByName(name, nameIndex) {
  const normalize = s => s.toLowerCase()
    .replace(/the university of/g, 'university of')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
  const key = normalize(name);
  if (nameIndex.has(key)) return nameIndex.get(key);

  // Fuzzy: try dropping common suffixes
  const stripped = key
    .replace(/ main campus$/, '')
    .replace(/ - main campus$/, '')
    .replace(/-main$/, '');
  if (nameIndex.has(stripped)) return nameIndex.get(stripped);

  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const onlyList = args.includes('--list') ? args[args.indexOf('--list') + 1] : null;

  // Check playwright is available
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    console.error('Playwright not installed. Run: npm install playwright && npx playwright install chromium');
    process.exit(1);
  }

  console.log(`\nUS News Rankings Scraper`);
  console.log(`Dry run: ${dryRun} | List filter: ${onlyList || 'all'}\n`);

  // Load seed data for name matching
  let seedData = {};
  try {
    const raw = JSON.parse(await fs.readFile(
      path.join(ROOT, 'src/data/institutionsSeed.json'), 'utf8'
    ));
    seedData = raw.institutions || {};
    console.log(`  Loaded ${Object.keys(seedData).length} institutions for name matching\n`);
  } catch {
    console.warn('  ⚠ No institutionsSeed.json — name matching will be limited\n');
  }

  const nameIndex = buildNameIndex(seedData);
  const allResults = {};

  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const listsToScrape = onlyList
    ? { [onlyList]: LISTS[onlyList] }
    : LISTS;

  for (const [listKey, config] of Object.entries(listsToScrape)) {
    if (!config) { console.warn(`  Unknown list: ${listKey}`); continue; }

    console.log(`\n── ${config.label} ──`);
    const listResults = [];

    for (let page = 1; page <= config.maxPages; page++) {
      process.stdout.write(`  Page ${page}/${config.maxPages}... `);

      try {
        const schools = await scrapePage(browser, config.url, page, listKey);

        if (!schools || schools.length === 0) {
          console.log('empty — stopping list');
          break;
        }

        // Resolve unitids
        for (const school of schools) {
          if (!school.unitid) {
            school.unitid = matchByName(school.name, nameIndex);
          }
          listResults.push({ ...school, listKey: config.mapTo || listKey });
        }

        console.log(`${schools.length} schools`);

        // Stop early for program rankings (top 50 only)
        if (config.field && listResults.length >= 50) break;

      } catch (err) {
        console.log(`ERROR: ${err.message}`);
        if (err.message.includes('timeout') || err.message.includes('429')) {
          console.log('  Waiting 30 seconds...');
          await sleep(30000);
        }
      }

      await sleep(3000 + Math.random() * 2000);
    }

    // Store results
    for (const school of listResults) {
      if (!school.unitid) continue;
      if (!allResults[school.unitid]) allResults[school.unitid] = {};

      if (config.field) {
        // Program ranking
        allResults[school.unitid][config.field] = school.rank;
      } else {
        // Main list
        allResults[school.unitid].usNews = school.rank;
        allResults[school.unitid].usNewsList = school.listKey;
      }
    }

    console.log(`  → ${listResults.filter(s => s.unitid).length} matched to unitids`);
  }

  await browser.close();

  // Write output
  const output = {
    _meta: {
      source: 'US News Best Colleges (https://www.usnews.com/best-colleges)',
      scrapedAt: new Date().toISOString(),
      totalMatched: Object.keys(allResults).length,
      note: 'Annual update — run each September after rankings release',
    },
    rankings: allResults,
  };

  const outPath = path.join(ROOT, 'src/data/usNewsRankings.json');
  await fs.writeFile(outPath, JSON.stringify(output, null, 2));
  console.log(`\n  ✓ Written: ${outPath}`);
  console.log(`  Total institutions with US News data: ${Object.keys(allResults).length}`);

  if (!dryRun && Object.keys(allResults).length > 0) {
    console.log('\n  Updating Supabase...');
    await updateSupabase(allResults);
  }
}

async function updateSupabase(allResults) {
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
    body: JSON.stringify({ source: 'usnews', rankings: allResults }),
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
