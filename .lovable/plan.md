# Plan: 8-school compare + R1 profile audit

## 1. Raise compare cap from 5 → 8

Single-line change in `src/components/InsightReport.jsx`:

- `const MAX_COMPARE = 5;` → `8`

Everything downstream (toggle label, chip renderer, "N of MAX selected" caption, typeahead cap) already reads `MAX_COMPARE`, so no other UI edits are needed. Typeahead suggestions currently cap at 8 results — I'll bump that to 10 so users still see extra choices once several are picked.

## 2. R1 institutional profile audit

Regenerate the same-shape workbook I built last time (`/mnt/documents/R1_Institutional_Profiles.xlsx`) using the current DB and use it to find gaps, then fix them.

### Audit workflow

1. `psql` dump of all `research2025 = 15` rows (should be ~187) to JSON.
2. Python (`openpyxl`) workbook: one row per school, columns for identity + every flag key discovered in `flags` jsonb + US News rankings + enrollment/FTE/retention/graduation/endowment/revenue/research spend.
3. Coverage report tab: for each field, count how many R1s have a value and list the ones missing. Highlight known suspects (Penn State, UVM already fixed; will spot-check ~10 more).
4. Save workbook to `/mnt/documents/R1_Institutional_Profiles.xlsx` and emit a `<presentation-artifact>` link.

### Categories of gaps I expect to find and how I'll fix each

| Gap type | Likely cause | Fix |
|---|---|---|
| Missing `chk_medSchool` / `chk_healthSystem` on schools that clearly have one | CIP-code inference in `fetch-ipeds-seed.mjs` is too narrow, or the school reports med under a parent unitid | Widen CIP rule set; add an override list in the seed script for known med schools not caught by CIP inference |
| Missing `chk_d1Athletics` | `IC2022` conference code missing for that unitid | Fall back to prior-year `IC` files, then a small manual override list of R1 D1s |
| Retention / grad rate blank | `EF2022D` / graduation file missing the unitid | Try prior-year files as fallback |
| Endowment / revenue / research spend blank | NACUBO/HERD/finance snapshot doesn't cover the school | Fall back to IPEDS `F_F2` finance file values already on the DB row; if still blank, flag in report (no manual fabrication) |
| US News rank blank | School not on that list, or scraper miss | Leave blank when genuinely unranked; re-run scraper if the school is on the list but missing |
| Wrong flag TRUE (false positive) | Overly broad CIP rule | Tighten rule and re-seed |

### Deliverables

- Updated `MAX_COMPARE` (compare UI supports 8 slots).
- Updated `scripts/fetch-ipeds-seed.mjs` with widened flag rules + any override lists needed.
- Re-run seeder → re-upsert `institutions` table.
- New `R1_Institutional_Profiles.xlsx` with a **Coverage** sheet showing before/after gap counts so you can see exactly what changed.
- Short written summary listing: total R1 count, % coverage per field before/after, any schools still missing data and why.

## Assumptions

- The audit fixes only R1 (as requested). I won't touch R2 / RCU / masters in this pass.
- Fields I can't populate from any available source (e.g. a private R1 that doesn't report a value) stay blank rather than being estimated.
- No UI changes beyond `MAX_COMPARE`; the peer-cohort statistics logic is unchanged.
