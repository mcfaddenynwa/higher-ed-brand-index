# Simplify the Strategic Insight Report

Goal: keep the analytical rigor (cohort-based scoring, strength/gap classification, visual bars) but strip the technical jargon (z-scores, μ, "peer dispersion below 1 point") that adds cognitive load without insight value.

## Changes

### `src/components/InsightReport.jsx`

**Intro paragraph (lines 104–108)** — replace z-score language with plain English:
> "Each pillar is scored against your selected peer cohort, so a school can be excellent in several categories while still showing a clear gap in others."

**Headline cards (HeadlineCard, lines 299–302)** — replace the `+delta` and `z +1.2` row with a single clean delta chip:
- Show only `+15 vs peers` (or `−8 vs peers`) in the tier color
- Drop the raw z value entirely

**PillarRow stats (lines 334–338)** — replace the "You X · Peer μ Y · z Z" row with:
- `Your score: 78` (prominent, navy)
- `peer avg 63` (muted gray, smaller)
- No z value displayed

**Bar visual (lines 342–352)** — minor polish:
- Increase bar height from 6px to 8px for better legibility
- Keep the navy tick marking the peer mean, add a subtle hover/title "Peer average: X"

**Methodology footer (lines 261–265)** — rewrite in plain language:
> "How we score: each pillar compares your institution to the peer cohort you selected. Tiers reflect how far above or below the cohort average you sit. Cohorts of 3+ schools give the most reliable read."
- Keep the colored tier legend (Leader / Strength / On par / Gap / Critical gap) but drop the `(z ≥ +1.5)` annotations.

**Insufficient-cohort warnings (lines 226–229)** — replace "Z-scores need at least 3 peers" with "Comparisons are most reliable with 3+ peers."

### `src/lib/insightFramework.js`

**`pillarNarrative()` (lines ~210–235)** — strip `z = ±X.X` from every branch. Keep the "+X pts vs peer mean" delta phrasing (renamed to "vs peer average") and the cohort leader callout. Example rewrite:

- Leader: "{name} is a category leader on {pillar} (+{delta} pts vs peer average). This is a defensible brand asset…"
- Gap: "{name} trails the peer average on {pillar} by {delta} pts. Worth a focused investment plan…"

The underlying `analyzePillars()` function and z-score math are untouched — they still drive tier classification and sort order. We're only hiding the raw numbers from the UI/copy.

## Out of scope
- No changes to scoring logic, cohort building, or the spider chart
- No changes to the strength/gap classification thresholds
