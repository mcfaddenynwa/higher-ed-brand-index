## Goal

Replace `fetch()`-based page requests in `scripts/scrape-niche.mjs` with a Playwright-driven Chromium browser, mirroring the pattern already in `scripts/scrape-usnews.mjs`. Niche blocks the native fetch user-agent; a real headless browser bypasses that.

## Changes (scripts/scrape-niche.mjs only)

1. **main()** — before scraping, dynamically import `playwright` (with the same install-error fallback as `scrape-usnews.mjs`) and launch a single Chromium browser instance with `--no-sandbox` args. Close it at the end of the run (and on error).

2. **fetchNichePage(browser, pageNum)** — rewrite to:
   - Open a new `browser.newPage()`.
   - `setViewportSize({ width: 1440, height: 900 })` and set `Accept-Language` / `Accept` headers (random UA via `setExtraHTTPHeaders` is fine, but Playwright sets a realistic Chromium UA by default — keep `randomUA()` only if we override via context; simplest is to drop it for page fetches and rely on Playwright's default UA).
   - `page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })`.
   - Small randomized human delay after load.
   - Read `__NEXT_DATA__` via `page.evaluate(() => JSON.parse(document.getElementById('__NEXT_DATA__')?.textContent || 'null'))`.
   - If present and yields schools via existing `extractFromNextData`, return them.
   - Otherwise fall back to DOM extraction inside `page.evaluate(...)` that mirrors today's `extractFromHTML` selectors (search-result cards, name, grade, slug, unitid hints), returning the same shape.
   - Always `page.close()` in a `finally`.
   - If `page.goto` returns a 404 response, return `null` so the existing "end of pages" logic still works.

3. **fetchUnitidFromProfile(browser, slug)** — same treatment: take the shared `browser`, open a page, navigate to the profile URL, extract `__NEXT_DATA__` for `entity.unitid`/`ipeds` and the regex fallbacks, close the page.

4. **Loop wiring** — `main()` passes `browser` into both `fetchNichePage` and `fetchUnitidFromProfile`. Existing `--dry-run`, `--pages`, delays, output JSON shape, name-matching, and `updateSupabase()` flow are unchanged.

5. **Cleanup** — remove the now-unused `USER_AGENTS` array and `randomUA()` helper (Playwright provides a realistic UA), or keep them only if used to randomize the browser context UA. Recommendation: drop them for simplicity, matching `scrape-usnews.mjs`.

## Out of scope

- No changes to `extractFromNextData`, `extractFromHTML` logic semantics, grade map, name-matching, output JSON, or the `ingest-rankings` POST.
- No changes to `scrape-usnews.mjs` or the edge function.
- No new dependencies — `playwright` is already required by `scrape-usnews.mjs`.
