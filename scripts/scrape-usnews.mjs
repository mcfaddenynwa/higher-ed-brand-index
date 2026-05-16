#!/usr/bin/env node
/**
 * scrape-usnews.mjs
 *
 * Probe the US News internal search API and log the raw response from page 1
 * so we can inspect the data structure before building a full parser.
 *
 * Run:
 *   node scripts/scrape-usnews.mjs
 *   node scripts/scrape-usnews.mjs --dry-run
 */

const API_URL =
  'https://www.usnews.com/best-colleges/api/search?_sort=rank&_sortDirection=asc&_page=1';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://www.usnews.com/best-colleges/rankings/national-universities',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'x-requested-with': 'XMLHttpRequest',
};

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log(`\nUS News API probe`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`GET ${API_URL}\n`);

  const res = await fetch(API_URL, { headers: HEADERS });
  console.log(`Status: ${res.status} ${res.statusText}`);
  console.log(`Content-Type: ${res.headers.get('content-type')}\n`);

  const text = await res.text();

  // Try to pretty-print if JSON; otherwise dump raw text
  try {
    const json = JSON.parse(text);
    console.log('--- Parsed JSON (page 1) ---');
    console.log(JSON.stringify(json, null, 2));
  } catch {
    console.log('--- Raw response (non-JSON) ---');
    console.log(text.slice(0, 5000));
    if (text.length > 5000) console.log(`... [truncated, total ${text.length} chars]`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
