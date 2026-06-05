# R1 Institutional Profile Export (.xlsx)

Generate a single Excel workbook listing every R1 (Carnegie 2025 "Research 1") institution with the same fields the Institutional Profile form shows in-app.

## Source

- Query Supabase `institutions` directly via `psql`, filtering to R1 (`research2025 = 15` / `research2025name ILIKE 'Research 1%'`). Cross-reference `carnegie_id` / `carnegie2025` to ensure we catch all ~187 R1s.
- All needed fields already live on the row (`flags`, `rankings`, `metrics`, `finance`, `ic2025*`, `research2025*`, `saec2025*`, `enrollment`, `fte`).

## Workbook layout

One sheet, `R1 Institutions`, one row per school. Frozen header, autosized columns, brand-styled header (Navy `#243551` fill, white Bitter text). Checkbox flags rendered as `TRUE`/`FALSE` (Excel-friendly). Blank rankings stay blank.

Columns, in order:

**Identity**
- UNITID, Name, City, State, Sector, Carnegie 2025 (`research2025name`), IC 2025 group, SAEC 2025, Fiscal Year

**Flags (checkboxes)**
- AACSB, Law School, Engineering, Health System, Hospital, Medical School, NCAA D1 Athletics, plus any other flag keys present on R1 rows (auto-discovered from `flags` jsonb so we don't miss one)

**US News rankings** (from `rankings` jsonb)
- National Universities, Liberal Arts, Law, Business, Engineering, Medical (Research), Medical (Primary Care)

**Metrics & finance**
- Enrollment, FTE, Retention %, 6-yr Graduation %, Endowment ($), Total Revenue ($), Research Expenditures ($) — pulled from `metrics` / `finance` with the same field names the profile form reads

## Steps

1. `psql` query → JSON dump of R1 rows to `/tmp/r1.json`.
2. Python script (`openpyxl`) builds the workbook, applies brand header styling, writes to `/mnt/documents/R1_Institutional_Profiles.xlsx`.
3. QA: open the file, screenshot first/last pages, confirm flag coverage counts (e.g., AACSB, Law, Eng, Health) and spot-check UVM-style schools.
4. Emit `<presentation-artifact>` so you can download.

## Notes

- This is a one-off export, not a new app feature — no UI or DB changes.
- Rankings will be blank for R1s not covered by the curated ACE/US News overlay; that matches what the form shows today.
