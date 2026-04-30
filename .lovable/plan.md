## Plan: pull live financial data from Urban Institute Education Data Portal

### What this gets us

The Urban Institute API is a free, no-auth JSON wrapper around IPEDS, NACUBO, EADA, and other federal data, all keyed by IPEDS `unitid` — which we already store on every US row in `IPEDS_DB`. Endpoints we'd use:

| Field in our app | Endpoint | Source |
|---|---|---|
| `endowmentPerStudent` | `/college-university/ipeds/finance/{year}/` (gross endowment) ÷ FTE enrollment | IPEDS Finance |
| `totalRevenue` | `/college-university/ipeds/finance/{year}/` (total revenue) | IPEDS Finance |
| `endowmentPerStudent` (cross-check) | `/college-university/nacubo/endowments/{year}/` | NACUBO |
| Athletics revenue (future, for "pride" signal) | `/college-university/equity-in-athletics/{year}/` | EADA |

URL pattern: `https://educationdata.urban.org/api/v1/college-university/ipeds/finance/2022/?unitid=170976` returns Michigan's full finance row as JSON.

**Coverage caveat (important):** This is **US-only**. International institutions (`isIntl=true`, the INTL_DB rows) won't get auto-fill from this source. Their Financial Strength fields stay manual. I'll surface that in the UI ("Financial auto-pull available for US institutions only").

### Architecture

Two layers:

**1. Build-time snapshot (the right call for our use case)**
- One-off script `scripts/fetch-urban-finance.mjs` that loops every `unitid` in `IPEDS_DB`, hits the IPEDS Finance + NACUBO endpoints for the latest available year (2022 finance, 2023 NACUBO based on docs), and writes `src/data/financeSnapshot.json`: `{ "170976": { endowmentPerStudent: 65, totalRevenue: 12100, year: 2022 }, ... }`.
- Run once now, then annually (matches your "annual refresh" scope from earlier).
- `selectInstitution()` merges the snapshot into auto-populated values, same `autoPopulated` flag pattern as IPEDS social/academic fields today.
- No backend, no API keys, no runtime cost. Ships with the app.

**2. Live fetch (NOT building this round)**
- Could later add an edge function that hits the API on-demand for any `unitid`, useful if/when we expand to all 6,500 universities and don't want to ship a giant JSON. Punt until that scope decision.

### Files touched

- New: `scripts/fetch-urban-finance.mjs` — one-time fetcher (Node, no deps).
- New: `src/data/financeSnapshot.json` — generated output (~50 rows × ~6 fields = trivial size).
- `src/pages/HEBrandEquity.jsx`:
  - Import the snapshot.
  - In `selectInstitution()`, if `school.unitid` and `financeSnapshot[unitid]` exist, merge `endowmentPerStudent` and `totalRevenue` into `populated` and push to `autoFields`.
  - Update the Financial Strength axis description to say "auto-populated from IPEDS Finance via Urban Institute Education Data Portal (US institutions only)".
  - For international flow, add a small inline note that financial fields are manual.
- No changes to the scoring math, weights, or AXES structure — we're just feeding the existing inputs.

### Sequencing with the round-1 changes

Do round-1 first (alumni removal, law-school audit, results-screen redesign) since those touch the AXES + WEIGHTS + InsightReport — then layer the finance snapshot on top so the fetched values flow into a stable schema. Roughly:

1. Round 1 changes (already approved).
2. Run the fetcher locally, commit `financeSnapshot.json`.
3. Wire snapshot into `selectInstitution()`.
4. QA on a few schools (Michigan, Penn State, a small lib-arts).

### Open questions

1. **Year**: I'll target IPEDS Finance 2022 (latest per the version history) and NACUBO 2023. Confirm or override.
2. **Endowment normalization**: Urban returns gross endowment (`f1d01` or similar code). To get "per student", I'll divide by 12-month FTE from the IPEDS enrollment endpoint. OK?
3. **Conflict policy**: If an institution already has a hardcoded `endowmentPerStudent` in `IPEDS_DB` (currently only intl rows do), the snapshot wins for US rows. Sound right?
4. **International institutions**: Confirm they stay manual for financial — I don't see a free global equivalent of IPEDS Finance.

Approve and I'll execute round-1 + this finance snapshot in one pass.