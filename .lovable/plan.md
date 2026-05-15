## Goal

Create an edge function `ingest-rankings` that lets the local scrapers (`scrape:niche`, `scrape:usnews`) push results to Supabase without ever holding the service role key on the client. The function merges per-institution ranking fields into the existing `rankings` JSONB column without clobbering other source's data.

## What to build

### 1. Edge function: `supabase/functions/ingest-rankings/index.ts`

- Accepts `POST` with JSON body:
  ```json
  {
    "source": "niche" | "usnews",
    "rankings": {
      "<unitid>": { "nicheRank": 45, "nicheGrade": 91 },
      ...
    }
  }
  ```
- Validates with Zod:
  - `source` ∈ `"niche" | "usnews"`
  - `rankings` is a non-empty object keyed by string unitids, each value an object of scalar fields
- Auth: requires a shared secret header `x-ingest-token` checked against env var `INGEST_RANKINGS_TOKEN` (so the public anon key alone can't write). Returns 401 on mismatch.
- Uses `SUPABASE_SERVICE_ROLE_KEY` server-side via `createClient`.
- For each unitid: reads current `rankings`, shallow-merges the new fields, writes back. Also updates `us_news_list` column when `source === "usnews"` and `usNewsList` is present in the payload (mirrors what `scrape-usnews.mjs` already does).
- Batches in groups of ~50 with a small concurrency limit; returns `{ ok, updated, failed, skipped: [...unitids not found] }`.
- Full CORS headers; returns CORS on errors too.
- Deploys with `verify_jwt = false` (default) — auth is via the shared token instead.

### 2. New secret: `INGEST_RANKINGS_TOKEN`

Requested via the secrets tool. The local scraper sends it in `x-ingest-token`.

### 3. Update local scrapers' write step

Replace the current `updateSupabase()` body in both `scrape-niche.mjs` and `scrape-usnews.mjs` with a single `POST` to:

```
${VITE_SUPABASE_URL}/functions/v1/ingest-rankings
```

Headers:
- `Content-Type: application/json`
- `apikey: <anon key>`
- `Authorization: Bearer <anon key>`
- `x-ingest-token: <INGEST_RANKINGS_TOKEN from local env>`

Body: `{ source, rankings: allResults }`.

Local `.env` for scrapers needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `INGEST_RANKINGS_TOKEN`. The service role key is no longer required locally.

## Out of scope

- No schema changes (the `rankings` JSONB and `us_news_list` columns already exist).
- No UI changes.
- No changes to scraping logic itself, only the write path.

## Order of operations

1. Add secret `INGEST_RANKINGS_TOKEN` (you'll set the value).
2. Create + deploy the edge function.
3. Update both scraper scripts' `updateSupabase()` to call the function.
4. You run `npm run scrape:niche` / `scrape:usnews` locally; data flows through the function into `institutions.rankings`.
