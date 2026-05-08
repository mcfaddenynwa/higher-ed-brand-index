## Goal

Replace the hardcoded 48-school `IPEDS_DB` array in `src/pages/HEBrandEquity.jsx` with a real database of every US 4-year, degree-granting university (~2,500), seeded from IPEDS, with a searchable picker so a user can choose any US school instead of being limited to the curated list.

International (`INTL_DB`) stays as-is for now — we'll do that as a separate pass.

## What's actually achievable from public data

The current `IPEDS_DB` row has ~30 fields per school. They split into three buckets:

**Bucket 1 — Auto-fillable from IPEDS (free, official, already wired in via `financeSnapshot.json` pattern):**
- name, unitid, city, state, sector (public/private), Carnegie classification → `carnegieId`
- enrollment, FTE, enrollment trend (multi-year delta)
- retention rate, 4-yr grad rate, 6-yr grad rate
- yield rate, accept rate, Pell %, first-gen %
- R&D expenditures (HERD), doctoral output
- Total revenue, endowment, endowment per FTE (already in `financeSnapshot.json`)
- Flags: health system, law school, engineering, AACSB-adjacent (derived from CIP program offerings)

**Bucket 2 — Auto-fillable from other free sources:**
- US News national-univ vs regional list bucket (`usNewsList`) — scrapeable from US News public rankings pages
- US News overall rank, Law rank, Business rank, Engineering rank — same source, but rate-limited; we'd cache annually
- THE Impact listed/rank, QS rank, THE World rank — public ranking tables
- D1 athletics flag — NCAA member directory
- Big-Four conference flag — derived from conference field

**Bucket 3 — Stays manual or gets dropped:**
- Niche rank / Niche grade — Niche.com is paywalled/ToS-restricted; leave as user-entered or drop
- Caldwell listed/rank — proprietary list, manual entry
- Social media follower counts (IG/LI/X/FB/YT) — no clean free API at scale; either user-entered per assessment, or we drop them and rely on the visibility pillar's other signals

**Recommendation:** Phase 1 = Bucket 1 only (everything IPEDS gives us, ~2,500 schools). The other buckets become follow-on work. This is the same pattern you already have working for finance.

## Architecture

**One Postgres table on Lovable Cloud: `institutions`**

```text
id              uuid (pk)
unitid          text (unique, IPEDS identifier)
name            text
state           text
city            text
sector          text          -- public | private_nonprofit | private_for_profit
carnegie_id     text          -- r1, r2, m1, bac_as, etc. (mapped from IPEDS BASIC2021)
us_news_list    text          -- natl_univ | regional | liberal_arts | null (Phase 2)
flags           jsonb         -- { bigFour, d1, health, law, aacsb, eng }
enrollment      integer
fte             integer
metrics         jsonb         -- { retentionRate, gradRate4yr, gradRate6yr, yieldRate, acceptRate, pellPct, firstGen, rAndD, doctoralOutput, researchDesignation, enrollTrend }
finance         jsonb         -- { totalRevenue, endowmentTotal, endowmentPerStudent, fiscalYear }
rankings        jsonb         -- { usNews, usNewsLaw, usNewsBiz, usNewsEng, qsRank, theWorldRank, theImpactRank, theImpactListed }  (Phase 2, mostly null at start)
fiscal_year     text
updated_at      timestamptz
```

Trigram index on `name` for fast typeahead (`"ohio st..."` → matches).

**Seeding:** Extend the existing `scripts/fetch-ipeds-finance.mjs` pattern. Add IPEDS files for HD (directory), EFFY (enrollment), DRVGR (grad rates), ADM (admissions), SFA (Pell), HERD (R&D). Output a single `institutionsSeed.json` and a one-shot edge function that upserts it into the table by `unitid`.

**Annual refresh:** Same script re-run when new IPEDS releases land (~once a year). Edge function is idempotent.

**App integration:**
1. Replace `IPEDS_DB` array with a query against the `institutions` table.
2. Add a typeahead picker on the data-entry screen (replaces the current dropdown of 48).
3. When a school is selected, fetch its row and pre-populate every field we have. Fields in Bucket 2/3 that aren't in the DB stay as editable inputs (current behavior).
4. The 48 hand-curated schools currently in `IPEDS_DB` keep their richer Bucket 2/3 values — we migrate them as a one-time seed *overlay* so we don't lose the work.

## Phase 1 scope (this build)

1. Enable Lovable Cloud (if not already) and create the `institutions` table + trigram index.
2. Write `scripts/fetch-ipeds-seed.mjs` — pulls HD, EFFY, DRVGR, ADM, SFA, HERD, F1A, F2, DRVEF; emits `src/data/institutionsSeed.json` (~2,500 rows).
3. Write a one-shot edge function `seed-institutions` that reads the JSON and upserts.
4. Migrate the 48 existing hand-curated rows as an overlay (preserves their `usNews`, social, niche, caldwell values).
5. Replace the dropdown in `HEBrandEquity.jsx` with a typeahead component backed by the table.
6. Wire the data-entry form to pre-populate from the selected row, leaving Bucket 2/3 fields editable.

## Out of scope for Phase 1

- US News / QS / THE rank scraping (Phase 2)
- Niche, Caldwell, social follower auto-fill (likely stays manual forever)
- International schools (separate pass — UK/Canada later)
- Admin UI for editing institution rows (DB-only for now)

## Open questions

1. **48 curated schools' extra fields** (US News rank, social, Niche, Caldwell): keep as overlay seed, or wipe and rely only on IPEDS + manual entry going forward?
2. **Carnegie scope:** include only doctoral + master's + bac (the ones with `WEIGHTS` entries in your code), or include associate's/special-focus too with a fallback weighting? Recommend: doctoral + master's + bac only (~1,800 schools), matches your existing weight tables.
3. **Picker UX:** keep current Carnegie-class dropdown as a *filter* on the typeahead, or just let users search by name freely?

Once you approve, I'll implement Phase 1 end-to-end.
