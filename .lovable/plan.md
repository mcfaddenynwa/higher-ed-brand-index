## Goal

Make 2025 the only Carnegie vintage in the app. Drop the 2021 Basic field everywhere. Rebuild the institutions dataset directly from `scripts/data/2025-Public-Data-File.xlsx` (3,929 schools, full 2025 IC + SAEC + Research designation). Redesign the Classify step so it shows just the auto-matched classification in the existing card, with a dropdown beside it to override.

## Scope of "2025 cohort"

The 2025 Institutional Classification (IC) has 31 categories. We'll keep only 4-year-relevant ones and drop the five pure-Associate categories (ic2025 ids `1, 2, 3, 11, 12`) from the user-facing dropdown and from peer cohort math. Schools with those ids stay in the DB but won't appear as selectable cohorts.

Final cohort list (26 categories), grouped:
- **Associate/Baccalaureate** — 4, 13
- **Baccalaureate** — 5, 14, 15
- **Undergraduate/Graduate-Master's** — 9, 10, 19, 20
- **Undergraduate/Graduate-Doctorate** — 6, 7, 8, 16, 17, 18
- **Special Focus** — 21–31

Research Activity Designation (R1 / R2 / RCU / None) becomes a **separate signal** surfaced on the card, not a cohort selector — matching how the 2025 framework actually works.

## What changes

### 1. Data pipeline — single source of truth = the xlsx

New script `scripts/build-institutions-2025.mjs`:
- Reads `scripts/data/2025-Public-Data-File.xlsx` (`data` sheet).
- Joins finance snapshot (`src/data/financeSnapshot.json`) and curated overlay (`src/data/curatedOverlay.json`) by `unitid`.
- Emits `src/data/institutionsSeed.json` and posts the same payload to the existing `seed-institutions` edge function.
- Per-row output drops `carnegie_id` (the legacy 2021 column) and instead writes:
  - `ic2025` (number, 1–31), `ic2025name` (string), `ic2025group` (one of the 6 groups above)
  - `research2025` (0–3), `research2025name`
  - `saec2025` (0–6), `saec2025name`, `access_ratio`, `earnings_ratio`, `pell_2023`
  - existing `flags`, `enrollment`, `metrics`, `finance`, `rankings`, `us_news_list`

### 2. Database — replace `carnegie_id` with `ic2025`

Migration:
- `ALTER TABLE institutions ADD COLUMN ic2025 smallint, ic2025name text, ic2025group text, research2025 smallint, research2025name text, saec2025 smallint, saec2025name text, access_ratio numeric, earnings_ratio numeric, pell_2023 numeric;`
- Drop `carnegie_id`, `carnegie2025` (jsonb) columns once seeding completes.
- Update `seed-institutions/index.ts` whitelist to the new column set; remove `carnegie_id` and `carnegie2025`.

### 3. Frontend — `src/pages/HEBrandEquity.jsx`

- Replace the `CARNEGIE_CATEGORIES` array (lines 102–116) with a `IC2025_COHORTS` array of the 26 4-year categories. Each entry: `{ id, label, group, description }` where `description` is a short data-driven blurb (program mix + research designation context).
- Replace the `WEIGHTS` map (lines 137–153) with weights keyed by `ic2025group` (6 groups) instead of 12 legacy ids. Existing per-id weights collapse cleanly into the 6 groups; no scoring logic change beyond the lookup key.
- Update `USNEWS_LIST_MAP` to key off `ic2025group` (Doctorate → `natl_univ`, Master's → `regional`, Bac → `lib_arts`/`regional`, Special Focus → `null`).
- `flattenInstitutionRow` (~line 16): map `ic2025`, `ic2025group`, `research2025name` etc. straight through; remove the `carnegieId` legacy alias.
- Selectors (lines 688, 1004, etc.): switch from `carnegieId` to `ic2025` everywhere.
- Peer cohort lens in `src/lib/insightFramework.js`: `LENSES[*].match` switches `carnegieId` → `ic2025`. The "Affiliation" fallback also updates.
- Remove all "2021 BASIC" UI: lines 1062 (eyebrow), and the dual-vintage block at 1066–1071. Sidebar header now shows just the matched 2025 IC + 2025 Research designation + 2025 SAEC.

### 4. Classify screen redesign (lines 1018–1051)

Replace the 12-card grid with:

```text
┌─────────────────────────────────────────────────────────────┐
│ 2025 CARNEGIE CLASSIFICATION                                │
│                                                             │
│ Mixed Undergraduate/Graduate-Doctorate Medium               │
│ Research 1 — Very High Research Activity                    │
│                                                             │
│ Doctoral institution with a balanced mix of academic and    │
│ professional programs. ≥ $50M research spending AND ≥ 70    │
│ research doctorates awarded annually.                       │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│ Classification incorrect?                                   │
│ [ Mixed Undergraduate/Graduate-Doctorate Medium     ▾ ]     │
└─────────────────────────────────────────────────────────────┘

                                          [ CONTINUE → ]
```

- Same outer card style as current selected button (white bg, `2px solid #1C3678`, `inset 4px 0 0 0 #EB5600`).
- The dropdown is a `<select>` styled to match the card's typography. Options are the 26 4-year cohorts grouped via `<optgroup>` by the 6 groups above ("Doctorate", "Master's", "Baccalaureate", "Associate/Baccalaureate", "Special Focus").
- Selecting an option immediately updates `ic2025`, recomputes weights and US News list default, and refreshes the card body.
- If no institution has been picked yet (no auto-match), the card shows an empty state: "Search for your institution above, or pick a classification below" with the same dropdown.
- International path keeps the existing `INTL_CATEGORIES` flow unchanged (it's a separate world).

### 5. Cleanup

- Delete `src/lib/carnegie2025.js` (its data is now the source-of-truth seed). The xlsx → seed pipeline replaces it.
- Remove `institution2025IC`, `institutionSAEC`, `institutionResearch` state — they collapse into a single `selectedIC2025` object derived from the row.
- Drop the `2021 BASIC` eyebrow and the alignment fix added for it (no longer needed once the header is one block).

## Order of operations

1. Migration: add new 2025 columns (don't drop legacy yet).
2. Run `scripts/build-institutions-2025.mjs` → reseeds via edge function.
3. Update `flattenInstitutionRow`, categories, weights, lenses, classify UI in one pass.
4. Verify a known school (UVM) shows R1 correctly, peer cohort uses `ic2025`.
5. Second migration: drop `carnegie_id`, `carnegie2025` columns; remove from edge function whitelist.

## Out of scope

- Changing the scoring formulas or axis weights' magnitudes (only the lookup key changes from 12 ids to 6 groups; group-level weights are derived as the average of the legacy ids that fall into each group).
- International (`INTL_CATEGORIES`) flow.
- The Results screen layout — only its labels referencing "Carnegie" wording stay; the underlying cohort key just switches.

## Confirm before I build

Two quick checks:
1. **Cohort key = group (6 buckets) vs. exact IC (26 buckets)?** I recommend grouping to 6, because most groups will have 30–600 schools (great peer math), while exact IC ids like "Special Focus: Theological Studies" would have <10 peers in the DB. Say "6 groups" or "exact 26".
2. **Drop the legacy `carnegie_id` column entirely (option A from earlier)?** Confirming yes — that's what "clean sweep" implies, but I want explicit go-ahead before the destructive migration.
