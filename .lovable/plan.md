## Two things to address

### 1. Overall Brand Index isn't actually weighted right now

The **Brand Index — all 9 schools** table computes the Overall column as a plain mean of the six pillar scores (`overallIndex` in `src/components/InsightReport.jsx:404`). But the app already has a full tier-weighted overall (`weightedOverall` in `src/pages/HEBrandEquity.jsx:497`) that blends the Carnegie-tier weights (`WEIGHTS`) with QS-band weights.

Confirmed pillar weights by Carnegie tier (`src/pages/HEBrandEquity.jsx:264-280`). Example — **R1**:

```text
Visibility & Reach ............ 24%
Academic & Research ........... 24%
Financial Strength ............ 15%
Enrollment & Retention ........ 14%
Diversity & Access ............ 12%
Institutional Profile ......... 11%
```

R2, RCU, master's, bac, etc. each have their own profile. For international schools, `blendWeights` averages the Carnegie profile with a QS-band profile and renormalizes to 1.

**What I'll change:**
- Replace the mean-based `overallIndex` in `BrandIndexTable` with the real `weightedOverall(scores, carnegieId, qsBand)` so the Overall column matches the number the sidebar shows for the focal school. Peer rows use each peer's own `carnegieId` + `qsBand`.
- Add a new compact **"How the overall index is weighted"** readout directly under the Brand Index table, showing the focal school's six pillar weights as a sorted list (label • %) plus a one-line note ("Weights are set by your 2025 Carnegie classification: R1 — Very High Research; QS band: unranked."). Numbers pulled from `blendWeights(carnegieId, qsBand)`.

### 2. Institutional Profile scores are too low across the board

Root cause is in `normalizeAxis` (`src/pages/HEBrandEquity.jsx:404-441`). For the Profile axis with 4 checkboxes (Med, Law, Biz, Eng):

- `maxPoints = checkboxes.length * 2 = 8`
- Each checked box = 1 point of presence
- Each ranked program adds up to 1 more point (only if ranked #1, and only if a rank is entered)

Consequence: **a school with all 4 assets but no US News ranks entered maxes at 4/8 = 50.** Penn State (all 4 checked, law #64, no biz/eng ranks) lands around 52. Even a top school with #1 in all four grad programs would only be 8/8 = 100 — but that's essentially unreachable. This is why every school looks weak on this pillar.

**What I'll change** (in `normalizeAxis`, profile-axis path only — other pillars untouched):

New split, presence-heavy and normalized to what's actually achievable:

- **Presence: 70%** of the pillar. All 4 assets checked = 70 pts. Each asset = 17.5 pts.
- **Rank bonus: 30%**, distributed only across the ranked programs (Law/Biz/Eng — Med has no US News rank input). If none of the ranked assets have a rank entered, presence fills the full 100 (rescale). Each ranked asset with a rank contributes `(1 − (rank−1)/(rankMax−1)) × tierMult` scaled into its share of the 30%.
- Tier multiplier (`top_20`=1.0, `21_50`=0.6) stays as it is now.
- Unchecked-but-ranked "half credit" behavior gets dropped — it's a data-quality artifact, not a real signal.

Result on realistic profiles:

```text
All 4 assets, no ranks entered .................... 100
All 4 assets, law #64 only (Penn State today) ....  ~76
All 4 assets, law #10 top-20 tier ................. ~85
2 assets, no ranks ................................  50
```

That reads much closer to how these institutions actually compare, and it stops punishing schools just for having missing US News grad-rank data.

### Files touched
- `src/components/InsightReport.jsx` — swap `overallIndex` for `weightedOverall`; add WeightingReadout panel under BrandIndexTable.
- `src/pages/HEBrandEquity.jsx` — export `weightedOverall` / `blendWeights` and their labels; rework the `axis.key === 'profile'` branch of `normalizeAxis`.

### Out of scope
- No changes to the other five pillars' scoring.
- No changes to cohort/lens logic or the compare-mode profile matrix.
- No data re-seed — this is pure UI/scoring math.
