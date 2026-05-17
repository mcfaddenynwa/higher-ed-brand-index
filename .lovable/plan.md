## What I found

**Penn State Main Campus (UNITID 214777) is the smoking gun.**

- In the DB: row exists with name/city/state/Carnegie2025 names populated, but `enrollment`, `fte`, `sector`, `finance`, `metrics`, `rankings`, `flags`, `fiscal_year` are all empty/null.
- In `src/data/institutionsSeed.json`: **214777 is missing entirely.** It's never written by the seed, so the full upsert can't fill those fields. The reason the row exists at all is the earlier 2025 Carnegie-only upsert (`upsert_institutions_2025`) — that's why only the ACE-derived columns show data.

### Why the seed drops it

In `scripts/fetch-ipeds-seed.mjs` (lines 422–427):

```js
const ace = aceData.get(unitid);
const basic2021 = ace?.basic2021 ?? num(row.C21BASIC);
const carnegieId = mapCarnegie2021(basic2021);
...
if (!sector || !carnegieId) continue;
```

For Penn State Main, ACE has `basic2021: -2` (the ACE file uses -2 for "not applicable" — Penn State Main is treated as a system office in the 2021 Carnegie). `-2` is not null, so the `??` fallback to HD's `C21BASIC` never fires. `mapCarnegie2021(-2)` returns null → institution dropped.

The same fallback bug affects **151 institutions** in the ACE file with `basic2021 = -2` (including Penn State Main, the only R1 in that bucket).

## Fix

One-line logic change in `scripts/fetch-ipeds-seed.mjs`:

```js
// Treat ACE -2 / missing / non-positive as "no value", fall back to HD C21BASIC
const aceBasic = num(ace?.basic2021);
const basic2021 = (aceBasic && aceBasic > 0) ? aceBasic : num(row.C21BASIC);
```

Then:

1. Re-run `node scripts/fetch-ipeds-seed.mjs` to regenerate `src/data/institutionsSeed.json` (Penn State Main and any other negative-basic2021 institutions that legitimately classify via HD will be included with full finance/enrollment/rankings/flags).
2. Re-invoke the `seed-institutions` edge function to upsert the new rows into the database.
3. Verify in DB:
   - `214777` now has populated `enrollment`, `fte`, `sector='public'`, `finance.totalRevenue`, `metrics.enrollTrend`, `rankings.usNews`, athletics flags (Big Ten, D1), etc.
   - Spot-check 3–4 other "Main Campus" / system-office institutions to confirm none are still silently dropped.

## Out of scope (for this plan)

- I did **not** dig into UI categorization yet (the user mentioned "some could be UI fixes"). Once the data is flowing correctly for Penn State, we should re-check the Penn State page in the app and address any remaining UI labeling issues as a separate, smaller pass.

Approve and I'll apply the fix, re-seed, reload, and verify Penn State end-to-end.