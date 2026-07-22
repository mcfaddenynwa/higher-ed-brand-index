## What you're seeing today

1. When you add 8 schools in Compare mode, `InsightReport` only uses their **pillar scores** for peer averaging. Their institutional-profile flags (Big Four, D1, med, law, biz, eng, land-grant) and their US News/QS/THE rankings are never rendered — that's why the compared schools look empty on the profile side.
2. Penn State's `usNewsLaw` is `64` in the database, but earlier we suppressed any grad-school rank above 50 in the focal-school panel, so Penn State's law rank disappeared even though it exists. We'll surface it in the new comparison table (with "#64" shown, not "LOCKED") so above-50 ranks are visible in the compare view even if the focal-school top-50 gate stays.
3. Today the only cohort-leader signal is a small "Cohort leader: X (score)" sentence at the end of each pillar narrative. It's easy to miss.

## What I'll build

### 1. Fix compared-school data pull-through
`InsightReport` already receives full peer rows via `scoredPool` — every row already carries `flags`, `usNewsLaw/Biz/Eng`, `qsRank`, `theWorldRank`, `nicheRank`, `usNews`, `retentionRate`, `gradRate6yr`, `enrollment`, etc. from `flattenInstitutionRow`. No new fetch needed — I just need to actually render this data. Also verify Penn State's row (`usNewsLaw=64`, `flags.law` currently false) and set `flags.law` from `usNewsLaw != null` at flatten time so the law checkbox shows correctly in downstream displays.

### 2. New panel: "Brand Index — all 9 schools" (above pillar readout)
Compact table, one row per school (focal on top, highlighted), one column per pillar plus an **overall index** column (mean of available pillar scores, same math as `cohortTopLine`'s topInstitution). Cells color-tinted by relative rank within the 9. Sortable by any pillar or by overall. Shown in both Classification and Compare modes (in Classification mode it renders focal + top 8 by overall, so it stays 9 rows).

### 3. New panel: "Institutional profile — side-by-side"
Right under the brand-index table, in Compare mode only: one row per school × columns for Big Four / D1 / Med / Law / Biz / Eng / Land-Grant (✓ / —), plus US News overall, US News Law/Biz/Eng (shown even if >50 here — this is the fix to Penn State's missing law rank), QS, THE, retention, 6-yr grad. Values pulled straight from the `scoredPool` rows so nothing new has to be wired.

### 4. Clearer cohort-leader block
Above the pillar-by-pillar readout, a "Cohort leaders by dimension" grid: one tile per pillar showing pillar name, leader institution, its score, and the delta vs. the focal school. Highlight tiles where the focal school itself is the leader.

### 5. Small cleanup
- Keep the "hide graduate ranks >50" rule on the focal-school Enter Data sidebar (that's what you asked for originally), but do **not** apply it in the new compare table — you need to see Penn State's #64 there.
- `flattenInstitutionRow` derives `flags.law/biz/eng` from `usNewsLaw/Biz/Eng` presence when the flag is missing, so checkbox-driven counts stay consistent with the ranks.

## Files touched
- `src/components/InsightReport.jsx` — add BrandIndexTable, ProfileMatrix (compare-only), and CohortLeadersGrid subcomponents; wire them above the existing pillar readout.
- `src/pages/HEBrandEquity.jsx` — extend `flattenInstitutionRow` to backfill `flags.law/biz/eng` from ranking presence; pass `axes` unchanged.
- No database or edge-function changes.

## Out of scope for this pass
- Re-scraping missing US News / Niche coverage.
- Changing peer-cohort math or the tier thresholds.
- Reintroducing capped grad ranks in the focal sidebar.
