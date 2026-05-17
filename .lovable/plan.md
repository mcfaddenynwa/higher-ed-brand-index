# Plan: Data Source Reference for the 6 Dimensions

You want a single document you can paste into Claude so it knows, for every input in every dimension, **where the value comes from** (which dataset, which file, which variable) and **how it currently flows into the app**. I'll produce that as a Markdown reference at `docs/data-sources.md`.

## What the doc will contain

### 1. Dimension → Inputs map (verbatim from `src/pages/HEBrandEquity.jsx` lines 298-370)

For each of the 6 axes (Visibility & Reach, Enrollment & Retention, Financial Strength, Institutional Profile, Academic & Research Reputation, Diversity & Access):
- Axis key, label, hidden-for cohorts
- Every input id, label, min/max, invert/binary flag
- Every checkbox id + linked rank field
- The `WEIGHTS` / `INTL_WEIGHTS` / `QS_BAND_WEIGHTS` profile that scales it

### 2. Source-of-record for every input

A table with columns: **Input id | Dimension | Source dataset | File/endpoint | Variable | Pull script | Lands in DB as**. Sources currently wired up:

- **IPEDS HD2022** — directory (name, city, state, sector, HBCU/HSI/Tribal flags) → `scripts/fetch-ipeds-seed.mjs` → `institutions.{name,city,state,sector,flags}`
- **IPEDS DRVEF2022** — `FTE`, `EFTOTLT` → `institutions.{fte,enrollment}`
- **IPEDS DRVGR2022** — `RET_PCF` (retention), `GBA4RTT`, `GBA6RTT` → `metrics.{retentionRate,gradRate4yr,gradRate6yr}`
- **IPEDS ADM2022** — `APPLCN`, `ADMSSN`, `ENRLT` → derived `acceptRate`, `yieldRate`
- **IPEDS SFA2122** — `UPGRNTP` (Pell %) → fallback for `pellPct`
- **IPEDS F2223_F1A / F2** — `F1B25`/`F2D18` (total revenue), `F1H02`/`F2H02` (endowment) → `finance.{totalRevenue,endowmentTotal,endowmentPerStudent}` via `scripts/fetch-ipeds-finance.mjs` → `src/data/financeSnapshot.json`
- **ACE 2025 Carnegie public data file** (`scripts/data/2025-Public-Data-File.xlsx`) — `ic2025`, `research2025`, `saec2025`, `access_ratio`, `earnings_ratio`, `pell_2023`, `herd_avg` (3-yr NSF HERD avg → `rAndD`), `rdoc_avg` (`doctoralOutput`), `medical`, `hbcu`, `tribal`, `hsi`, `landgrant`, `womenonly` → top-level `institutions` columns + `metrics`
- **NSF HERD** — currently *not* pulled directly; comes in through ACE `herd_avg` 3-yr average
- **NACUBO endowment** — currently *not* pulled directly; endowment comes from IPEDS finance F1H02/F2H02 only
- **US News** — `scripts/scrape-usnews.mjs` (internal JSON API) → `rankings.{usNews,usNewsRankNum,usNewsList}` via `ingest-rankings` edge function
- **Niche** — `scripts/scrape-niche.mjs` (Playwright) → `rankings.{nicheRank,nicheGrade}` via same edge function
- **QS / THE / THE Impact / Caldwell / US News Law/Biz/Eng** — currently **not** scraped; values live only in `src/data/curatedOverlay.json` (hand-maintained) and get merged in `scripts/fetch-ipeds-seed.mjs`
- **Athletic conference (Big Four / D1)** — manual flags in `curatedOverlay.json` only

### 3. End-to-end flow diagram

```text
NCES IPEDS ZIPs ─┐
ACE 2025 xlsx ───┼─► fetch-ipeds-seed.mjs ─► institutionsSeed.json + TSV ─► institutions table
curatedOverlay ──┘                                                          │
                                                                            ▼
IPEDS Finance ───► fetch-ipeds-finance.mjs ─► financeSnapshot.json ─► merged client-side in selectInstitution()
                                                                            ▲
US News API ─────► scrape-usnews.mjs ──┐                                    │
Niche (Playwright)─► scrape-niche.mjs ─┴─► ingest-rankings edge fn ─► institutions.rankings JSONB
                                                                            │
                                                                            ▼
                                          HEBrandEquity.jsx → flattenInstitutionRow() → AXES.normalizeAxis() → radar score
```

### 4. Known gaps / "broken" connections

I'll flag each input whose source is *not* currently wired so you know what to ask Claude to build:

- `firstGen` — no source pull; nullable
- `enrollTrend` — needs multi-year IPEDS EF pull; curated overlay only
- `qsRank`, `theWorldRank`, `theImpactListed/Rank` — overlay only, no scraper
- `caldwellListed`, `caldwellRank` — overlay only
- `usNewsLaw`, `usNewsBiz`, `usNewsEng` — overlay only (US News specialty rankings API not wired)
- NACUBO direct feed — none; relies on IPEDS finance
- NSF HERD direct — none; relies on ACE 3-yr `herd_avg`

### 5. Field-name crosswalk

A small table showing how a DB column → `flattenInstitutionRow()` → axis input id (e.g. `metrics.retentionRate` → `school.retentionRate` → input `retentionRate` in Enrollment axis). This is what Claude needs to write new ingestion code without breaking the UI.

## Deliverable

One file: `docs/data-sources.md` (no app code changes). You upload your spreadsheet, then Claude can read it alongside this doc to write a precise ingestion prompt.

## Open question

Do you want me to **also** include the raw `WEIGHTS` / `normalizeAxis` scoring math in the doc, or keep it strictly to "where does each data point come from"? Let me know and I'll write it.

