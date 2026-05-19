## What I picked up from the doc

Three buckets of work: **UI changes** (Classify / Enter Data / Results), **a couple of open questions** I want your call on before coding, and **database-data bugs** that need their own investigation pass.

---

## A. Classify page

1. Remove the "US Institution / International" toggle. Default to US only. Keep the international code paths in place (just hidden) so we can re-enable later without rewriting.
2. Re-order the 2025 Carnegie dropdown so Doctorate appears first; within Doctorate keep Mixed Large / Medium / Small then Professions. (See open question #1 on whether to also surface R1/R2/RCU labels.)
3. Remove the **2025 SAEC** line from the classification card. Leave the field in the database and in the underlying record — just stop displaying it on this page (and on the Enter Data sidebar where it also shows).
4. Fix the dropdown clipping: the popover currently has `avoidCollisions={false}` and a fixed `max-h-[360px]` which truncates options without an internal scroll. Switch to a scrollable popover that always renders fully on screen.

## B. Enter Data page

1. Same Doctorate-first re-order (driven by the same source list as Classify, so one change covers both).
2. Sidebar header re-order: **Institution Name on top** (largest), then 2025 Carnegie underneath. Drop SAEC line.
3. Visibility & Reach pillar:
   - Replace description with: *"Key rankings and visibility through athletics."*
   - Remove the **US News ranking list** selector (the row of pill buttons + auto-suggested label).
   - Remove the **Niche Best Colleges Rank** and **Niche Overall Grade** inputs from the UI. Keep the scraper, the DB columns, and the `nicheRank` / `nicheGrade` fields untouched.
4. Financial Strength: drop the trailing sentence *"International institutions: manual entry, USD equivalent."* from the pillar description.
5. Institutional Profile: change the helper line under the checkboxes to just *"Ranked programs score higher."* — remove "Auto-populated from institutional database" and "Review annually."
6. Remove the **"See benchmarks for your Carnegie type"** dropdowns under Endowment / Revenue (and the brand-spend ones if/when they appear). Keep the BENCHMARKS data object in source for now.
7. Remove the "IPEDS" badge / "pre-filled from IPEDS" copy? *Not requested — leaving as-is.*

## C. Results page

1. Add a bit more vertical padding between the dimension labels and the spider chart polygon (labels currently sit very close to the rings).
2. Remove the **IPEDS Unit ID** line under the institution name.
3. Remove the **QS band chip** (the orange `QS Top 100` / `QS 401–600` etc. badge) from both the header line and the score box.
4. In the Dimension Breakdown rows, remove the small grey weight `%` (e.g., the "28%" next to the score) and bump the score number up one step (≈17 → 22 px) so it reads as the primary value.

## D. Peer cohort tiers (Insight Report)

Today there are five tiers driven by the focal institution's z-score vs the cohort:

| z-score      | tier            | label                 |
|--------------|-----------------|-----------------------|
| ≥ +1.5       | leader          | Category leader       |
| +0.5 to +1.5 | strength        | Notable strength      |
| −0.5 to +0.5 | on-par          | On par with peers     |
| −1.5 to −0.5 | gap             | Notable gap           |
| < −1.5       | critical-gap    | Critical gap          |

So a parity tier already exists in the framework. The reason your feedback flagged "what's between Strength and Gap" is that the **Results page only renders the Insight Report below the spider/dimension breakdown** — and the breakdown itself just shows raw `+/− vs R1` deltas, not the tier label. I'll surface the tier chip (with its plain-English meaning + thresholds) in the dimension breakdown rows so the parity case is visible, and add a small "How tiers work" tooltip explaining the z-score logic in business terms (e.g. "Leader = more than ~1.5 standard deviations above the R1 average — top ~7% of the cohort").

## E. Database-data issues (separate investigation, not part of this UI batch)

Logging these as a follow-up so we don't conflate them with the UI changes:

- **Financial Strength missing for many institutions** — endowment/revenue come from `src/data/financeSnapshot.json` keyed by unitid. Likely the snapshot covers only a subset (the original IPEDS-Finance pull). Action: audit coverage, re-run `scripts/fetch-ipeds-finance.mjs`, push fresh snapshot.
- **Institutional Profile missing for many** — `flags.health/law/aacsb/eng` come from the seed JSON. Many institutions in the live DB likely have empty `flags{}`. Action: query `institutions` for null/empty flag distribution, then refresh from the curated overlay or backfill.
- **Enrollment & Retention gaps (e.g. Oregon retention)** — `retentionRate` lives in `metrics`. Action: spot-check Oregon's row in the DB, identify whether it's missing in seed or being overwritten on flatten.

I'll come back with a concrete fix plan for these after we land the UI batch.

---

## Open questions

1. **R1/R2/RCU in the Classify dropdown.** Right now the dropdown is keyed by the 2025 IC group (Doctorate / Master's / etc.) and the R1/R2 split is derived separately from the Research Activity Designation column. Three options:
   - **(a)** Leave the dropdown as IC-only and just re-order (Doctorate first). R1/R2/RCU keeps showing as the orange sub-line under the matched name. *Smallest change, no backend ripple.*
   - **(b)** Add a top "Research" group with three pseudo-items — R1, R2, RCU — that select the appropriate combo of IC + research designation. Doctorate IC groups still appear below for non-research doctoral programs.
   - **(c)** Split each Doctorate IC label to include the research designation (e.g. "Mixed Doctorate Large — R1"). Most explicit, longest labels.
2. **"Research activity designation weighted twice" — confirmation.** Inside the Research pillar, the three inputs (R&D $, doctoral output, R1/R2/RCU designation) are averaged equally, so the designation is one of three components, not double-applied within the pillar. Separately, the designation also helps choose the Carnegie *weight profile* (an R1 weighted-pillar mix vs an R2 mix). That's by design — same value affecting both the pillar score and the cohort weights. **Is that what you want, or do you want the designation removed as a scored input so it only drives weights?**

Once you answer those two, I'll implement A–D in one pass and circle back on E.
