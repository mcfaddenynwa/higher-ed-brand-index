# Hierarchy + data-coverage fixes

## 1. Carnegie hierarchy on both pages (quick fix)

Right now on both the Classify card and the Enter Data sidebar, the IC2025 name ("Mixed Undergraduate/Graduate-Doctorate Medium") renders **above** the orange Research designation ("Research 1: Very High Spending and Doctorate Production"). You want Research first.

**Files / locations:**

- `src/pages/HEBrandEquity.jsx` ~lines 1205–1212 (Classify confirmation card): swap the order so `institutionResearch` (orange) renders above `matchedName` (serif IC name). Keep both styles as-is; just swap the JSX blocks.
- `src/pages/HEBrandEquity.jsx` ~lines 1304–1306 (Enter Data sidebar): render `institutionResearch` line immediately under the "2025 Carnegie" eyebrow, then `ic.label` below it.

No logic changes — pure render-order swap on both pages.

## 2. Finance fields not auto-populating (UVM and many others) — real bug

I checked University of Vermont in the database. Its row **does** have finance data (`totalRevenue: 909`, `endowmentPerStudent: 63`, `endowmentTotal: 835`) but the form leaves Financial Strength blank.

**Root cause:** `selectInstitution` (HEBrandEquity.jsx ~lines 997–1009) only auto-fills `endowmentPerStudent` / `totalRevenue` from `src/data/financeSnapshot.json`, which is a 49-school overlay. It never falls back to the values already on the DB row (`school.endowmentPerStudent`, `school.totalRevenue`), so any institution outside the 49 hand-curated rows shows blank — including UVM.

**Fix:** in `selectInstitution`, prefer snapshot value, then fall back to `school.endowmentPerStudent` / `school.totalRevenue` from the flattened DB row. Existing snapshot precedence stays the same; this just adds a fallback.

This single fix lifts finance auto-fill from 49 institutions to ~2,052 (the count in the DB with a totalRevenue value), and resolves the UVM case immediately.

## 3. Why D1 athletics is wrong, and retention is mostly blank — pipeline issues

Database audit just now:

```text
total institutions:                3,189
with retentionRate populated:         48   (1.5%)
with flags.d1 = 1:                    96   (3%)
with finance.totalRevenue:          2,052  (64%)
```

These three are upstream data-load problems, not UI problems. Findings:

**Retention (1.5% coverage).** `scripts/fetch-ipeds-seed.mjs` line 468 pulls retention from the DRVGR file:

```js
const retentionRate = gr ? num(gr.RET_PCF) : null;
```

`RET_PCF` no longer lives in the current DRVGR derived-graduation file for most institutions — IPEDS moved the full-time first-year retention rate to `EF{year}D` (Fall Enrollment, Part D — `RRFTCT` for full-time cohort retention, `RRPTCT` for part-time). That's why 98.5% of rows are null. Confirmed by spot-checking UVM (has well-documented ~87% retention but DB row is null).

**Fix:** add an EF{year}D loader to the seed script, read `RRFTCT` (full-time, four-year and grad institutions) with `RRPTCT` fallback, and use that as the retention source. Re-run seed and upsert.

**D1 athletics (3% coverage).** The seed reads `is_division_1` from a local ACE file (line 282). That file only contains the ~340 schools ACE tracks, so any institution outside that list defaults to `d1: 0` — including a lot of legitimate D1 programs (UVM among them; UVM competes in America East).

**Fix options, in order of effort:**

1. Drop in a CSV of the official 2024-25 NCAA D1 membership list (~362 schools, public from ncaa.org) and join on `unitid` or `name`. Cleanest and complete.
2. Or read IPEDS' Athletic Aid survey (`SFA{year}_P2`) which records NCAA division participation per institution — fully covers all reporting institutions.

After whichever source is chosen, re-run the seed and the d1 flag will populate correctly across the dataset.

**Finance (64% coverage).** Reasonable today; the remaining 36% are mostly small institutions where IPEDS Finance hasn't been pulled for the current fiscal year. Lower priority than the two above, but if you want full coverage we'd re-run `scripts/fetch-ipeds-finance.mjs` against the latest F{year}_F1A / F{year}_F2 files.

## Proposed order of work

1. **Now, this pass (UI-only, no data re-pulls):**
   - Swap Research / IC order on Classify and Enter Data pages.
   - Add DB-row fallback for `endowmentPerStudent` / `totalRevenue` in `selectInstitution`.

2. **Next pass (data pipeline — needs re-running seed scripts and re-upserting):**
   - Add EF{year}D loader → fixes retention universally.
   - Replace ACE-only D1 flag with NCAA D1 roster CSV (or IPEDS Athletic Aid) → fixes D1 universally.
   - Optional: re-run finance pull for fuller coverage.

## Open question for you

For step 2, do you want me to wire it up to **IPEDS' Athletic Aid survey** (fully automated re-pull, no manual list to maintain) or **a static NCAA D1 roster CSV** (simpler, but you'd need to refresh it each season)? Athletic Aid is my recommendation. Same question doesn't apply to retention — fix is the same path either way.
