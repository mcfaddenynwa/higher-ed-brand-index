# Add Niche + US News scrapers

## Files to add (verbatim, no edits)
- `scripts/scrape-niche.mjs` — copied as-is from upload
- `scripts/scrape-usnews.mjs` — copied as-is from upload

## package.json
Add to `scripts`:
- `"scrape:niche": "node scripts/scrape-niche.mjs"`
- `"scrape:usnews": "node scripts/scrape-usnews.mjs"`
- `"scrape:usnews:dry": "node scripts/scrape-usnews.mjs --dry-run"`
- `"scrape:niche:dry": "node scripts/scrape-niche.mjs --dry-run"`

## Dependencies
- Install `playwright` as a devDependency (`bun add -d playwright`).
- Note: `npx playwright install chromium` (browser binary download) must be run locally by you — it can't run in the Lovable sandbox.

## Out of scope
No source/UI changes. No DB migrations. Scrapers are intended to be run locally; they won't execute in preview.
