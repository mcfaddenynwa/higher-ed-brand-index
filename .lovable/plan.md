# Remove Social Reach field

Pull the auto-calculated **Social reach score** out of the Brand Equity scoring UI and composite. Leave the underlying follower data in `IPEDS_DB` / `curatedOverlay.json` / `insights.json` untouched so we can switch it back on later without re-collecting anything.

## Scope

**In:** UI input row, score contribution, peer-card payload, and the cohort "size band" filter that depends on it.
**Out (intentionally untouched):** raw `socialIg/Li/X/Fb/Yt` fields in `IPEDS_DB`, the same fields in `src/data/curatedOverlay.json`, `socialReachRaw` values in `src/data/insights.json`, and the `INTL_FIELDS` / `IPEDS_FIELDS` arrays (harmless metadata; leaving them avoids churn when we restore the feature).

## Changes

1. **`src/pages/HEBrandEquity.jsx`**
   - Remove the `socialReach` row from the Reputation axis `inputs` (line 200).
   - Remove the special-case render branch for `input.id === 'socialReach'` (lines 1131–1135).
   - Remove the `socialReach` branch from `normalizeAxis` (lines 283–286) so the axis composite is computed only from the remaining reputation inputs.
   - Delete the now-unused `computeSocialReach` function (lines 262–278).
   - Drop the `socialIg/Li/X/Fb/Yt` keys from the `focal` object passed to `<InsightReport>` (lines 1414–1416).

2. **`src/lib/insightFramework.js`**
   - Remove `sameSizeBand` and `totalSocial` helpers.
   - In the cohort match at line 25, simplify to `match: (focal, p) => p.carnegieId === focal.carnegieId` (drop the size-band filter, since it was driven by social-follower totals — a poor size proxy anyway).
   - Update the rule's `description` (line 24) to drop the "(social-reach proxy)" parenthetical.

## Verification

- Reputation axis still renders and scores with the remaining inputs (US News, QS, THE, Caldwell, Impact, Niche).
- No references to `socialReach` / `computeSocialReach` / `totalSocial` / `sameSizeBand` remain in `src/pages/` or `src/lib/`.
- Insight cards still generate (the carnegie-only cohort match continues to find peers).
- Build passes; no TypeScript/ESLint errors.

## Future re-enable

When we want it back, restore the input row, the render branch, the `normalizeAxis` branch, and `computeSocialReach` — the raw data is still on disk in `IPEDS_DB` and `curatedOverlay.json`. (Ideally we'd also wire it up to a real source, e.g., Firecrawl pulls or a stored snapshot in `institutions.metrics`.)
