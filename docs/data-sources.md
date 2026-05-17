# HE Brand Equity — Data Source Reference

Reference doc for writing ingestion code. For every input in every dimension this
spells out: the source dataset, the file/endpoint, the variable name, the script
that pulls it, and where it lands in the `institutions` table.

Snapshot of the codebase as of this writing. Source files:
- `src/pages/HEBrandEquity.jsx` (axes, weights, scoring, row flattener)
- `scripts/fetch-ipeds-seed.mjs` (master seeder: IPEDS + ACE 2025 → DB)
- `scripts/fetch-ipeds-finance.mjs` (live finance snapshot → JSON)
- `scripts/scrape-usnews.mjs` (US News internal JSON API → edge fn)
- `scripts/scrape-niche.mjs` (Niche Playwright scraper → edge fn)
- `scripts/extract-curated-overlay.mjs` (extracts hand-curated overlay)
- `supabase/functions/ingest-rankings/index.ts` (writes scraped rankings back)
- `src/data/curatedOverlay.json` (hand-maintained overrides)
- `src/data/financeSnapshot.json` (live finance pull)

---

## 1. The 6 dimensions (axes)

Defined as the `AXES` array at `src/pages/HEBrandEquity.jsx:298`. Each axis has
`inputs` (numeric fields) and optionally `checkboxes` (presence flags, some with
a linked rank field). `hiddenFor` removes the axis for certain Carnegie cohorts.

### 1.1 Visibility & Reach  `key: visibility`  color `#EB5600`
Hidden for: `associates`, `tribal`.

Checkboxes:
| id | label |
|---|---|
| `chk_bigFour`     | Big Four athletic conference (ACC, Big Ten, Big 12, SEC) |
| `chk_d1athletics` | Division I athletics (non-Big Four) |

Inputs:
| id | label | scoring |
|---|---|---|
| `usNewsList`     | US News ranking list (selector — not scored) | dropdown |
| `usNews`         | US News Rank | invert, max = `USNEWS_LIST_MAX[list]`, emptyScore 10 |
| `qsRank`         | QS World University Rank | invert, max 1000, emptyScore 5 |
| `theWorldRank`   | THE World University Rank | invert, max 1000, emptyScore 5 |
| `caldwellListed` | American Caldwell Visibility Index listed | binary |
| `caldwellRank`   | American Caldwell rank | invert, max 1000 |
| `theImpactListed`| THE Impact Rankings listed | binary |
| `theImpactRank`  | THE Impact Rank | invert, max 2526 |
| `nicheRank`      | Niche Best Colleges Rank | invert, max 1500, emptyScore 5 |
| `nicheGrade`     | Niche Overall Grade (numeric) | direct, max 100 |

### 1.2 Enrollment & Retention  `key: enrollment`  color `#1A9988`
| id | label | scoring |
|---|---|---|
| `enrollTrend`   | 5-yr enrollment change (%) | centered, min -30 max 30 |
| `yieldRate`     | Yield rate (%) | direct, max 100 |
| `acceptRate`    | Acceptance rate (%) | invert (lower = better), max 100 |
| `retentionRate` | 1st-to-2nd year retention (%) | direct |
| `gradRate4yr`   | 4-year graduation rate (%) | direct |
| `gradRate6yr`   | 6-year graduation rate (%) | direct |

### 1.3 Financial Strength  `key: financial`  color `#243551`
| id | label | scoring |
|---|---|---|
| `endowmentPerStudent` | Endowment per student ($K) | direct, max 600 |
| `totalRevenue`        | Total annual revenue ($M)  | direct, max 5000 |

### 1.4 Institutional Profile  `key: profile`  color `#3F5A8A`
Checkboxes (presence + optional US News specialty rank):
| id | label | rank field | rank max |
|---|---|---|---|
| `chk_healthSystem` | Academic medical center / health system | — | — |
| `chk_lawSchool`    | Law school | `usNewsLaw` | 50 |
| `chk_aacsb`        | AACSB-accredited business school | `usNewsBiz` | 50 |
| `chk_engineering`  | College of Engineering | `usNewsEng` | 50 |

No numeric `inputs` beyond the rank fields above.

### 1.5 Academic & Research Reputation  `key: research`  color `#1C3678`
Hidden for: `associates`, `tribal`, `bac_arts`, `mixed_bac`, `prof_bac`,
`intl_teaching`, `intl_specialist`.

| id | label | scoring |
|---|---|---|
| `rAndD`               | Annual federal R&D expenditures ($M) | direct, max 1000 |
| `doctoralOutput`      | Doctoral degrees awarded annually    | direct, max 2000 |
| `researchDesignation` | 2025 Research Activity (3=High … 0=None) | direct, max 3 |

### 1.6 Diversity & Access  `key: diversity`  color `#6AA4C8`
| id | label | scoring |
|---|---|---|
| `pellPct`  | Pell Grant recipients (%) (intl: low-income / access %) | direct, max 100 |
| `firstGen` | First-generation students (%) | direct, max 100 |

### Axis weighting
- `WEIGHTS` — per-Carnegie cohort (r1, r2, rcu, mixed_doc, prof_doc,
  mixed_masters, prof_masters, mixed_bac, prof_bac, bac_arts, associates,
  special, tribal). `HEBrandEquity.jsx:251`.
- `INTL_WEIGHTS` — international cohorts. `HEBrandEquity.jsx:243`.
- `QS_BAND_WEIGHTS` — blended in for QS-ranked schools. `HEBrandEquity.jsx:436`.
- Scoring math: `normalizeAxis()` at `HEBrandEquity.jsx:376`. Inputs averaged
  0–100; checkboxes contribute 30% when both exist; checkboxes alone = 100%.

---

## 2. Source-of-record for every input

### 2.1 IPEDS files — pulled by `scripts/fetch-ipeds-seed.mjs`
Base URL: `https://nces.ed.gov/ipeds/datacenter/data/<FILE>.zip` (no auth).

| ZIP | IPEDS variables used | Maps to (DB) | Powers axis input |
|---|---|---|---|
| `HD2022.zip`     | `UNITID, INSTNM, CITY, STABBR, CONTROL, ICLEVEL, DEGGRANT, PSEFLAG, C21BASIC, HOSPITAL, HBCU, TRIBAL, HSI` | `institutions.{unitid,name,city,state,sector,carnegie_id, flags.hbcu, flags.tribal, flags.hsi, flags.health}` | — (directory + cohort) |
| `DRVEF2022.zip`  | `FTE, EFTOTLT` | `institutions.fte, institutions.enrollment` | (denominator only) |
| `DRVGR2022.zip`  | `RET_PCF, GBA4RTT, GBA6RTT` | `metrics.{retentionRate, gradRate4yr, gradRate6yr}` | Enrollment & Retention |
| `ADM2022.zip`    | `APPLCN, ADMSSN, ENRLT` → derived | `metrics.{acceptRate, yieldRate}` | Enrollment & Retention |
| `SFA2122.zip`    | `UPGRNTP` | `metrics.pellPct` (fallback only — ACE preferred) | Diversity & Access |
| `F2223_F1A.zip` (public)  | `F1B25` (total revenue), `F1H02` (endowment) | `finance.{totalRevenue, endowmentTotal, endowmentPerStudent}` | Financial Strength |
| `F2223_F2.zip` (private)  | `F2D18` (total revenue), `F2H02` (endowment) | same | Financial Strength |

Bump fiscal year by changing `FY_LABEL` + the four file names at the top of
`fetch-ipeds-seed.mjs` (and `fetch-ipeds-finance.mjs`).

### 2.2 ACE Carnegie 2025 — `scripts/data/2025-Public-Data-File.xlsx`
Local file. Download from
<https://carnegieclassifications.acenet.edu/carnegie-classification/resources/>
and drop in `scripts/data/`. Loaded by `loadAceData()` in `fetch-ipeds-seed.mjs`.

| ACE column | Maps to (DB) | Powers |
|---|---|---|
| `ic2025`, `ic2025name`         | `institutions.ic2025`, `ic2025name`, derives `carnegie_id` | cohort selection |
| `research2025`, `research2025name` | `institutions.research2025`, `research2025name`; also → `metrics.researchDesignation` (1→3, 2→2, 3→1, else 0) | Research axis |
| `saec2025`, `saec2025name`     | `institutions.saec2025`, `saec2025name`; → `metrics.saecScore` (0–6) | Diversity (SAEC) |
| `access_ratio`                 | `institutions.access_ratio` → `metrics.accessRatio` | Diversity |
| `earnings_ratio`               | `institutions.earnings_ratio` → `metrics.earningsRatio` | Diversity (post-grad earnings) |
| `pell_2023`                    | `institutions.pell_2023` → `metrics.pellPct` (×100, rounded) | **Diversity → `pellPct`** |
| `herd_avg`                     | `metrics.rAndD` (÷1000 → $M; 3-yr NSF HERD average) | **Research → `rAndD`** |
| `rdoc_avg`                     | `metrics.doctoralOutput` (3-yr research doctorates avg) | **Research → `doctoralOutput`** |
| `medical`                      | `flags.health` (overrides HD `HOSPITAL`) | Profile checkbox |
| `hbcu`, `tribal`, `hsi`, `landgrant`, `womenonly` | `flags.{...}` | — |
| `basic2021`                    | drives `carnegie_id` mapping (preferred over HD `C21BASIC`) | cohort + WEIGHTS |

### 2.3 IPEDS Finance live snapshot — `scripts/fetch-ipeds-finance.mjs`
Re-runs the F1A/F2/DRVEF pull and writes `src/data/financeSnapshot.json`. The
client (`HEBrandEquity.jsx:974`) merges this on top of the seed so finance can
be refreshed without re-seeding the whole DB. Keyed by `unitid`. Fields:
`{ sector, totalRevenue ($M), endowmentTotal ($M), endowmentPerStudent ($K/FTE), fte, fiscalYear }`.

### 2.4 US News — `scripts/scrape-usnews.mjs`
Endpoint: `https://www.usnews.com/best-colleges/api/search?_sort=rank&_sortDirection=asc&_page=N`
(internal JSON, no key). Headers used:
```
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36
Referer: https://www.usnews.com/best-colleges/rankings/national-universities
Accept: application/json, text/plain, */*
x-requested-with: XMLHttpRequest
```
Per `data.items[].institution`: `xwalkId` (= IPEDS unitid), `displayName`,
`rankingDisplayRank` (e.g. `"#45"`), `schoolType` (list slug). Pages discovered
via `data.total_pages`. 2s delay between pages.

Writes `src/data/usNewsRankings.json` then POSTs to the `ingest-rankings` edge
function with `source: "usnews"`. Lands in `institutions.rankings.{usNews, usNewsRankNum, usNewsList}` and mirrors `usNewsList` to the top-level `us_news_list` column.

**Specialty rankings (Law/Biz/Eng) — not scraped.** `usNewsLaw`, `usNewsBiz`,
`usNewsEng` only come from `curatedOverlay.json`.

### 2.5 Niche — `scripts/scrape-niche.mjs`
Playwright. Scrapes
`https://www.niche.com/colleges/search/best-colleges/?page=N`. Produces
`{ nicheRank, nicheGrade }` per matched name, POSTs to `ingest-rankings` with
`source: "niche"` → `institutions.rankings.{nicheRank, nicheGrade}`.

### 2.6 Curated overlay — `src/data/curatedOverlay.json`
Hand-maintained file keyed by `unitid`. Merged on top of IPEDS+ACE inside
`fetch-ipeds-seed.mjs` (overrides anything from the public sources). Currently
the **only** source for:

- `usNewsList` overrides
- `qsRank`, `theWorldRank`, `theImpactListed`, `theImpactRank`
- `caldwellListed`, `caldwellRank`
- `nicheRank` / `nicheGrade` initial seed (scraper updates later)
- `usNewsLaw`, `usNewsBiz`, `usNewsEng`
- `firstGen`, `enrollTrend`
- `flags.{bigFour, d1, law, eng, aacsb}` (athletics + program flags)

Regenerate from in-file `IPEDS_DB` via `scripts/extract-curated-overlay.mjs`.

### 2.7 Ingest edge function — `supabase/functions/ingest-rankings/index.ts`
- Auth: shared `x-ingest-token` (secret `INGEST_RANKINGS_TOKEN`).
- Body: `{ source: "niche"|"usnews", rankings: { [unitid]: { ...fields } } }`.
- Merges `fields` into existing `institutions.rankings` JSONB per unitid.
- For `source: "usnews"`, also writes `us_news_list` top-level column.

---

## 3. End-to-end flow

```text
NCES IPEDS ZIPs ─┐
ACE 2025 xlsx ───┼─► fetch-ipeds-seed.mjs ─► institutionsSeed.json + TSV ─► institutions table
curatedOverlay ──┘                                                          │
                                                                            ▼
IPEDS Finance ───► fetch-ipeds-finance.mjs ─► financeSnapshot.json ─► merged client-side
                                                                            ▲
US News API ─────► scrape-usnews.mjs ──┐                                    │
Niche scraper  ──► scrape-niche.mjs  ──┴─► ingest-rankings edge fn ─► institutions.rankings JSONB
                                                                            │
                                                                            ▼
                                  HEBrandEquity.jsx
                                  ├─ supabase select institutions
                                  ├─ flattenInstitutionRow()    (DB row → form values)
                                  ├─ selectInstitution()        (merges financeSnapshot + ACE)
                                  └─ normalizeAxis() × 6 axes   (radar score)
```

---

## 4. Known gaps / "broken" connections

These inputs have **no automated pull**. They appear in the UI only when
`curatedOverlay.json` has a value, otherwise the user types them in.

| Input | Today | What's needed |
|---|---|---|
| `firstGen`       | overlay only | Add multi-year IPEDS EF pull (first-gen race/ethnicity proxy) |
| `enrollTrend`    | overlay only | Pull `DRVEF` for 5 consecutive years, compute % change |
| `qsRank`         | overlay only | No QS API; manual or partner data |
| `theWorldRank`   | overlay only | No THE API; manual |
| `theImpactListed`/`theImpactRank` | overlay only | No THE Impact API; manual |
| `caldwellListed`/`caldwellRank`   | overlay only | American Caldwell list — manual |
| `usNewsLaw`/`usNewsBiz`/`usNewsEng` | overlay only | US News specialty endpoints not wired |
| `chk_bigFour`/`chk_d1athletics`  | overlay flags only | Could pull from NCAA member directory |
| NACUBO endowment | **not wired** | Endowment currently comes from IPEDS `F1H02`/`F2H02`. NACUBO Study of Endowments is paywalled — no direct pull |
| NSF HERD direct  | **not wired** | Comes in indirectly via ACE `herd_avg` (3-yr avg). Direct pull would be NSF Survey of R&D Expenditures (HERD) CSV |

---

## 5. Crosswalk: DB → form values → axis input

The `institutions` table is widened into per-input fields by
`flattenInstitutionRow()` (`HEBrandEquity.jsx:46`). Anything inside `metrics`,
`rankings`, or `finance` JSONB is spread onto the school object, so the field
name in JSONB == the field name in the form == the input `id` in `AXES`.

| Axis input id | DB location |
|---|---|
| `usNewsList`         | `institutions.us_news_list` (and `rankings.usNewsList` mirror) |
| `usNews`             | `rankings.usNews` |
| `qsRank`             | `rankings.qsRank` |
| `theWorldRank`       | `rankings.theWorldRank` |
| `theImpactListed`    | `rankings.theImpactListed` |
| `theImpactRank`      | `rankings.theImpactRank` |
| `nicheRank`          | `rankings.nicheRank` |
| `nicheGrade`         | `rankings.nicheGrade` |
| `caldwellListed`     | `rankings.caldwellListed` |
| `caldwellRank`       | `rankings.caldwellRank` |
| `usNewsLaw/Biz/Eng`  | `rankings.usNewsLaw/Biz/Eng` |
| `enrollTrend`        | `metrics.enrollTrend` |
| `yieldRate`          | `metrics.yieldRate` |
| `acceptRate`         | `metrics.acceptRate` |
| `retentionRate`      | `metrics.retentionRate` |
| `gradRate4yr`        | `metrics.gradRate4yr` |
| `gradRate6yr`        | `metrics.gradRate6yr` |
| `endowmentPerStudent`| `finance.endowmentPerStudent` (or `financeSnapshot.json[unitid].endowmentPerStudent`) |
| `totalRevenue`       | `finance.totalRevenue` (or `financeSnapshot.json[unitid].totalRevenue`) |
| `rAndD`              | `metrics.rAndD` (ACE `herd_avg` ÷1000) |
| `doctoralOutput`     | `metrics.doctoralOutput` (ACE `rdoc_avg`) |
| `researchDesignation`| `metrics.researchDesignation` **and** `institutions.research2025` (1→3, 2→2, 3→1, else 0; see `research2025ToScoreVal`) |
| `pellPct`            | `metrics.pellPct` (prefer `institutions.pell_2023 × 100`) |
| `firstGen`           | `metrics.firstGen` |
| `chk_healthSystem`   | `flags.health` (ACE `medical` or HD `HOSPITAL`) |
| `chk_lawSchool`      | `flags.law` |
| `chk_aacsb`          | `flags.aacsb` |
| `chk_engineering`    | `flags.eng` |
| `chk_bigFour`        | `flags.bigFour` |
| `chk_d1athletics`    | `flags.d1` |

For a new ingestion to "just work" in the UI, write the value into the
matching JSONB key with the exact id above, then either re-seed or POST through
`ingest-rankings` (for rankings) or extend `financeSnapshot.json` (for finance).

---

## 6. Cheat-sheet: where to add a new data source

1. **Cohort or directory** (sector, name, flags) → extend `fetch-ipeds-seed.mjs`,
   re-run seeder, `psql \copy` the TSV.
2. **Per-institution metric** that maps to an existing `AXES` input → either
   (a) add a column read in `fetch-ipeds-seed.mjs` and write into `metrics.*`, or
   (b) POST to `ingest-rankings` with `source: "usnews"|"niche"` (or add a new
   source branch) writing into `rankings.*`.
3. **Live-refreshable finance** → extend `fetch-ipeds-finance.mjs` and write
   into `financeSnapshot.json` under the same input id.
4. **New axis input** → add to `AXES` array in `HEBrandEquity.jsx`, add to
   `IPEDS_FIELDS` / `INTL_FIELDS` so `selectInstitution()` auto-populates it,
   and add a row to the crosswalk above.
