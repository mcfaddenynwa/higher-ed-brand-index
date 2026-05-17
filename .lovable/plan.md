# Restore 5-year enrollment trend

## Problem

NCES no longer hosts `DRVEF2018`–`DRVEF2020` (derived enrollment files). Only `DRVEF2021` is still available, so the script currently produces a 1-year trend instead of 5-year.

## Fix

Use the raw 12-month enrollment files (`EFFY{year}.zip`) for 2018–2020, which contain the same underlying data. `EFFY` files use field `EFYTOTLT` (total 12-month unduplicated headcount), which is the source DRVEF derives its `EFTOTLT` column from. Values are directly comparable.

## Changes to `scripts/fetch-ipeds-seed.mjs`

1. Update `ENROLL_TREND_FILES` to map each year to the right zip:
   ```js
   const ENROLL_TREND_FILES = {
     y2018: { zip: 'EFFY2018.zip',  field: 'EFYTOTLT' },
     y2019: { zip: 'EFFY2019.zip',  field: 'EFYTOTLT' },
     y2020: { zip: 'EFFY2020.zip',  field: 'EFYTOTLT' },
     y2021: { zip: 'DRVEF2021.zip', field: 'EFTOTLT' },
   };
   ```

2. In the download loop, iterate the new shape and remember which field to read for each year.

3. EFFY files contain multiple rows per UNITID (one per level-of-student). Filter to `EFFYLEV == 1` (all students, total) before indexing, otherwise the Map will collapse on duplicate UNITIDs.

4. In the trend calculation, look up `past[fieldForYear]` instead of hardcoded `past.EFTOTLT`.

## Expected result

Trend calculated from 2018 → 2022 (4-year delta, labeled as 5-year in UI per current convention) for nearly all 2,428 institutions, instead of just the 1-year delta from 2021.

## Verification

Re-run `bun run scripts/fetch-ipeds-seed.mjs` and confirm:
- All 4 historical files download (no 404s)
- Log reads `✓ enrollTrend: using 4 historical DRVEF years`
- Spot-check `enrollTrend` values in `src/data/institutionsSeed.json` for a few well-known schools
