# Fix cohort averages + remove manual submit

## What's wrong now

The header shows "Cohort Size: 24" because that number is computed from `scoredPool` — every institution in `IPEDS_DB` / `INTL_DB` auto-scored from public data.

The spider chart's dashed/dotted overlays are computed from a totally different source: `submissions`, which is a localStorage list of users who clicked **Submit to Benchmark Pool**. That list is empty (or near-empty), so `computeAggregates()` returns `null` and no overlay renders.

Two sources of truth for the same concept. Fix is to unify on the auto-scored pool and retire the manual submit step entirely, since every school is already in the pool from day one.

## Changes

### 1. Rebuild `computeAggregates` from `scoredPool`
- Change signature to `computeAggregates(scoredPool, carnegieId, focalName)`.
- Filter out the focal institution from its own peer averages (so a school doesn't compare against itself).
- Build the classification overlay from `scoredPool.filter(s => s.carnegieId === carnegieId)`.
- Build the "all institutions" overlay from the rest of `scoredPool`.
- Read pre-computed `s.scores[key]` (already on each scored row) instead of recomputing.

### 2. Move the call site so it sees `scoredPool`
- In the component, move the `computeAggregates(...)` call below the `scoredPool` `useMemo`.
- Result: the `n=` shown in the spider legend will match the cohort size in the header card.

### 3. Remove the manual submit flow
Strip from `src/pages/HEBrandEquity.jsx`:
- State: `submissions`, `submitted`, `saving`, the `useEffect` that loads from localStorage.
- Functions: `handleSubmit`, `loadSubmissions`, `saveSubmission`, the `STORAGE_KEY` constant.
- UI: the entire "Submit to Benchmark Pool" card (lines ~1293–1312).
- Derived values: `carnegieN`, `globalN` (no longer needed — we always have data now).
- Legend fallback text "{N} more needed" — overlays will essentially always render, but keep a generic "insufficient data" fallback in case `MIN_N` isn't met for an exotic classification.
- Footer note about deduplication / submissions can be trimmed to just cite data sources.

### 4. Keep the framework intact
- `MIN_N` stays as a guard.
- `InsightReport` and the cohort logic in `insightFramework.js` are unchanged — they already consume `scoredPool` correctly.
- Header card "Cohort Size" / "Cohort Avg Index" stay as-is.

## Files touched
- `src/pages/HEBrandEquity.jsx` — only file affected.

## Result
- Spider chart overlays appear immediately for every school, matching the 24-school cohort already shown in the header.
- No "submit" button — the app behaves as a read-only benchmarking tool driven entirely by IPEDS data.
- One source of truth for "the cohort."
