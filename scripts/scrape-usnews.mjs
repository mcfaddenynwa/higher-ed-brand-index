#!/usr/bin/env node
/**
 * scrape-usnews.mjs
 *
 * Scrapes US News Best Colleges rankings via their internal JSON API and
 * merges into the Supabase institutions table via the rankings JSONB column.
 *
 * What it collects:
 *   usNewsRank — rank string like "#1" (kept as the raw display value)
 *   usNewsRankNum — numeric rank parsed from the display string
 *   usNewsList — schoolType list slug (e.g. "national-universities")
 *
 * Run:
 *   node scripts/scrape-usnews.mjs
 *   node scripts/scrape-usnews.mjs --dry-run
 *   node scripts/scrape-usnews.mjs --pages 5
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const API_BASE =
  'https://www.usnews.com/best-colleges/api/search?_sort=rank&_sortDirection=asc&_page=';
const DELAY_MS = 2000;
const MAX_PAGES_DEFAULT = 500;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://www.usnews.com/best-colleges/rankings/national-universities',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'x-requested-with': 'XMLHttpRequest',
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms + Math.floor(Math.random() * 1000)));
}

function parseRankNum(display) {
  if (!display) return null;
  const m = String(display).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

async function fetchPage(pageNum) {
  const res = await fetch(`${API_BASE}${pageNum}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} on page ${pageNum}`);
  return res.json();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const maxPages = args.includes('--pages')
    ? parseInt(args[args.indexOf('--pages') + 1], 10)
    : MAX_PAGES_DEFAULT;

  console.log(`\nUS News Best Colleges Scraper`);
  console.log(`Max pages: ${maxPages} | Dry run: ${dryRun}\n`);

  const byUnitid = {};
  const unmatched = [];
  let totalPages = null;
  let totalItems = 0;

  for (let page = 1; page <= maxPages; page++) {
    process.stdout.write(`  Page ${page}${totalPages ? `/${totalPages}` : ''}... `);

    try {
      const data = await fetchPage(page);
      const items = data?.data?.items || [];
      if (totalPages === null) totalPages = data?.data?.total_pages || null;

      for (const item of items) {
        const inst = item?.institution || {};
        const unitid = inst.xwalkId ? String(inst.xwalkId) : null;
        const record = {
          name: inst.displayName || null,
          usNewsRank: inst.rankingDisplayRank || null,
          usNewsRankNum: parseRankNum(inst.rankingDisplayRank),
          usNewsList: inst.schoolType || null,
        };

        if (unitid) {
          byUnitid[unitid] = record;
        } else {
          unmatched.push(record);
        }
      }

      totalItems += items.length;
      console.log(`${items.length} items (total: ${totalItems})`);

      if (totalPages && page >= totalPages) break;
      if (items.length === 0) break;
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      if (err.message.includes('429')) {
        console.log('  Rate limited — waiting 30 seconds');
        await sleep(30000);
      }
    }

    await sleep(DELAY_MS);
  }

  const output = {
    _meta: {
      source: 'US News Best Colleges (internal API)',
      scrapedAt: new Date().toISOString(),
      totalScraped: totalItems,
      matchedToUnitid: Object.keys(byUnitid).length,
      unmatched: unmatched.length,
    },
    rankings: byUnitid,
    unmatched,
  };

  const outPath = path.join(ROOT, 'src/data/usNewsRankings.json');
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
    body: JSON.stringify({ source: 'usnews', rankings: byUnitid }),
  });

  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`  ✗ ingest-rankings failed (${res.status}):`, result);
    return;
  }
  console.log(`  ✓ Supabase updated via ingest-rankings: ${result.updated} updated, ${result.failed} failed, ${result.skipped?.length || 0} skipped`);
  if (result.errors?.length) console.log('    sample errors:', result.errors);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
