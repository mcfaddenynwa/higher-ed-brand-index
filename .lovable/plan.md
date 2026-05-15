## Remove social follower data

Goal: purge `socialIg`, `socialLi`, `socialX`, `socialFb`, `socialYt` (and any `socialReach` references) from the app. Scoring math, weights, UI layout, and all other fields stay as-is.

### Note before starting
Two items in the request don't currently exist in the codebase — flagging so you know nothing was missed:
- **No `computeSocialReach` function exists** in `HEBrandEquity.jsx` (or anywhere in the project).
- **No `socialReach` input** is present in the Visibility & Reach axis `inputs` array. The only trace is the word "social reach" inside the axis `description` string (line 301).
- **`normalizeAxis` has no social-specific branch** — it's a generic loop over `axis.inputs`. Once `socialReach` is gone from inputs (already gone) there's nothing to remove inside the function.

So those three bullets reduce to: delete the phrase "social reach (normalized by enrollment)" from the visibility axis description.

### Changes

**1. `src/pages/HEBrandEquity.jsx`**
- **IPEDS_DB entries (lines ~147–200ish)**: remove `socialIg`, `socialLi`, `socialX`, `socialFb`, `socialYt` keys from every row. Use a regex sweep:
  ```
  ,?\s*social(Ig|Li|X|Fb|Yt):\s*-?\d+,?
  ```
  applied per-line so commas stay clean.
- **INTL_DB entries**: same sweep across the international block.
- **`INTL_FIELDS` (line 205)**: drop the trailing `"socialIg","socialLi","socialX","socialFb","socialYt"`.
- **`IPEDS_FIELDS` (line 212)**: drop the trailing `"socialIg","socialLi","socialX","socialFb","socialYt"`.
- **Visibility axis description (line 301)**: change
  `"…THE Impact, athletics conference, social reach (normalized by enrollment)"` → `"…THE Impact, athletics conference"`.

**2. `src/data/curatedOverlay.json`**
- Strip the five `socialIg/Li/X/Fb/Yt` keys from every institution entry. Easiest path: small node script that loads JSON, deletes those keys per entry, writes back with the existing 2-space pretty-print + trailing newline.

**3. `flattenInstitutionRow` rankings JSONB expectation**
- The function currently spreads `r.rankings` wholesale (line 69). It does not enumerate social fields, so no code edit is required there. The "expectation" is documentary: nothing in the app reads social keys anymore, so any social keys still sitting in the `rankings` JSONB column will be harmlessly spread and ignored. Out-of-scope but worth knowing: a future seed/ingest run would need to stop writing them.

### Out of scope (not touched)
- `scripts/fetch-ipeds-seed.mjs` and `scripts/extract-curated-overlay.mjs` still reference social fields. Per the request, scoring logic and UI are the only targets. If you want these scripts cleaned up too, say the word and I'll add it.
- No changes to `normalizeAxis`, weights, AXES order, charts, or insight framework.

### Verification
- `rg "social(Ig|Li|X|Fb|Yt|Reach)" src/pages/HEBrandEquity.jsx src/data/curatedOverlay.json` → no matches.
- App still renders; Visibility & Reach axis still scores from the remaining 9 inputs.
