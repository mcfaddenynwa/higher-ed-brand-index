## Why each issue is happening

### 1. UVM shows "R2 (Research 2)" but 2025 says R1
Two different vintages of Carnegie data are being shown side-by-side:
- The big heading (`R2 (Research 2)`) comes from the legacy `carnegie_id` column. UVM's row in the seeded `institutions` table has `carnegie_id = "r2"` (from the 2021 Basic Classification used to seed).
- The "Research:" line under it comes from the new `carnegie2025` JSON, where UVM is `"Research 1: Very High Spending and Doctorate Production"`.

UVM was genuinely promoted from R2 → R1 in the 2025 framework. The data isn't wrong — the UI is just showing two snapshots without explaining which is which, so it reads like a contradiction.

**Fix options (pick one — I recommend B):**
- **A.** Re-derive `carnegie_id` from the 2025 `researchDesignation` when seeding (so R1=3 → `r1`, R2=2 → `r2`, etc.). This rewrites history for every R-school whose designation moved. It also changes peer cohorts.
- **B.** Keep the legacy `carnegie_id` for cohort math (so peer comparisons stay stable against the existing dataset), but **relabel the heading** to make the vintage explicit. Replace the bare "R2 (Research 2)" with a small "2021 Basic" eyebrow, and label the 2025 line as "2025 Research" instead of just "Research". Optionally show a subtle "↑ promoted to R1 in 2025" note when the two disagree.
- **C.** Promote the 2025 designation to be the headline (e.g. "R1 — Research 1") and demote the legacy value to a footnote. Cleanest visually but masks the cohort that's actually driving the scoring.

### 2. The "← BACK" button is floating in the middle
The header is a flex row with `justify-content: space-between` and default `align-items: center`. When the 2025 lines were added, the left block grew ~3 lines taller, so the vertically-centered BACK now sits around the middle of that taller block.

**Fix:** add `alignItems: 'flex-start'` to the flex container at line 1060, so BACK pins to the top next to "CLASSIFICATION".

### 3. The spider chart sits too low
Same root cause: the left sidebar header grew taller from the 2025 lines, but the right pane's chart area uses internal padding/margin that was sized before those lines existed. A quick scan of the right pane (need to read lines ~1140–1300) will confirm whether to:
- reduce the chart container's top padding, and/or
- tighten the gap between the 2025 lines (`marginTop: 6`, `lineHeight: 1.4`) so the sidebar header is shorter.

I'll apply both: shrink the 2025 block's top margin from 6→4 and line-height from 1.4→1.35, and trim the chart pane's top padding by ~12px so the chart's vertical center sits closer to the sidebar header.

## Changes to `src/pages/HEBrandEquity.jsx`

1. **Line 1060** — header flex: add `alignItems: 'flex-start'` so BACK sits at the top.
2. **Lines 1062–1064** — relabel the eyebrow to make vintage explicit:
   - `CLASSIFICATION` → `2021 BASIC` (kept in orange eyebrow style)
   - Keep `selectedCarnegie?.short` as the bold line beneath.
3. **Line 1068** — change `Research:` to `2025 Research:` and `2025 IC:` stays, `SAEC:` → `2025 SAEC:` (parallel labeling).
4. **Lines 1066** — tighten the 2025 block: `marginTop: 4, lineHeight: 1.35`.
5. **Right pane (chart container, ~line 1140+)** — read first, then trim its top padding by ~12px so the chart rises to align with the sidebar header.

Net effect: the user sees `2021 BASIC: R2 (Research 2)` clearly distinguished from `2025 Research: Research 1…`, the BACK button anchors top-right of the sidebar header, and the spider chart sits higher in the right pane.

## Out of scope
- Re-seeding `carnegie_id` to use 2025 designations (option A) — only do this if you'd rather collapse to a single vintage.
- Any change to scoring, weights, or peer-cohort logic.

## Confirm before I build
Should I go with **option B** (keep legacy `carnegie_id`, relabel headings to show vintage) or do you want **option A** (rewrite `carnegie_id` from the 2025 designation so UVM becomes R1 everywhere, including peer cohorts)?
