# Two things in this pass

## 1. Fix Classify dropdown (still flipping up, unscrollable)

**Root cause:** The `<SelectContent>` uses `position="popper"` with `side="bottom"`, but Radix's default collision behavior flips the panel above the trigger whenever there isn't enough room below. When it flips up, the available height collapses to whatever space exists *above* the trigger — which on this page is small — so `max-h-[min(60vh,520px)]` ends up being clipped and the inner scroll never engages.

**Fix (single file, `src/pages/HEBrandEquity.jsx`, the SelectContent at ~line 1238):**

- Add `avoidCollisions={false}` so the panel stays anchored below the trigger.
- Add `collisionPadding={16}` as a safety net.
- Keep `position="popper"`, `side="bottom"`, `align="start"`.
- Tighten max-height to `max-h-[420px]` so it never exceeds typical viewport-below space, and keep `overflow-y-auto` so the list scrolls inside the panel.
- Add `onWheel={(e) => e.stopPropagation()}` on the SelectContent so wheel events scroll the list rather than bubbling to the page.

That combination forces the dropdown to open downward, cap its height, and scroll internally — which is what you're asking for.

## 2. How the peer-tier logic works today

Each pillar score is compared to the cohort (right now: same Carnegie / R1, R2, RCU) using a **z-score** — how many standard deviations your score sits above or below the peer mean.

```text
z = (your_score − peer_mean) / peer_stdev
```

Tier thresholds (from `src/lib/insightFramework.js → classifyZ`):

```text
z ≥ +1.5   → Category leader
+0.5 ≤ z < +1.5 → Notable strength
−0.5 < z < +0.5 → On par with peers
−1.5 < z ≤ −0.5 → Notable gap
z ≤ −1.5   → Critical gap
```

In plain English, assuming a roughly normal cohort:

- **Leader (z ≥ +1.5):** top ~7% of the cohort on that pillar.
- **Strength (+0.5 to +1.5):** clearly above average, roughly top 7–31%.
- **On par (−0.5 to +0.5):** middle ~38% — statistically indistinguishable from peers.
- **Gap (−0.5 to −1.5):** below average, roughly bottom 7–31%.
- **Critical gap (z ≤ −1.5):** bottom ~7% of the cohort.

**Guardrails already in the code:**

- If the cohort has `< 2` peers, or the peer standard deviation is `≤ 1` (i.e. everyone scores nearly the same so any z-score becomes noisy), the function returns `null` and the tier is reported as **"Insufficient peer data"** rather than labeling you a leader or critical gap on thin signal.
- Cohort mean, median, stdev, peer count `n`, the delta in raw points, and the cohort leader's name + score are all returned per pillar — they just aren't all surfaced in the UI yet.

**What this means for justification:**

- "Leader" and "Critical gap" require you to be **1.5σ** away from the peer average — a meaningful separation, not a small lead.
- "Strength" / "Gap" are softer — half a standard deviation off — and are framed in the narrative as "worth amplifying" / "worth a focused plan" rather than absolute claims.
- "On par" is the honest default and covers the bulk of cases for an average R1 vs. R1 cohort.

## What I'm *not* doing in this pass

- Not changing the thresholds.
- Not adding inline tier chips to the Results dimension rows yet (still deferred — want your read on the logic above first).
- Not touching the database-data backlog (finance/profile gaps).

## Open question for you

The 1.5σ / 0.5σ cutoffs are the standard convention but they're a judgment call. Want to keep them, tighten "Leader" to 2σ (top ~2%) so the badge feels rarer, or loosen "Strength" to 0.25σ so more institutions get a positive callout? Happy to adjust once the dropdown is fixed.
