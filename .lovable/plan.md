## Why Penn State only shows one checked column

The **Institutional Profile — side-by-side** matrix reads `r.data.flags` and top-level rank/metric keys (`usNewsLaw`, `usNewsBiz`, `usNewsEng`, `qsRank`, `theWorldRank`, `retentionRate`, `gradRate6yr`, `usNews`) off each row.

For every peer row that comes from `scoredPool`, the full flattened institution is passed in, so all seven flags + ranks render correctly.

For the **focal row**, though, `src/pages/HEBrandEquity.jsx:1683-1698` builds a hand-rolled object that only includes:

```js
flags: { bigFour: values.chk_bigFour ? 1 : 0, d1: values.chk_d1athletics ? 1 : 0 }
```

No `health`, `law`, `aacsb`, `eng`, or `landGrant`. No `usNewsLaw`/`usNewsBiz`/`usNewsEng`/`qsRank`/`theWorldRank`/`retentionRate`/`gradRate6yr`/`usNews` either. So Penn State's focal row shows at most one ✓ (D1 or Big Four) and every rank cell is em-dashed — even though the same institution renders fully for peer rows.

## Fix

In `src/pages/HEBrandEquity.jsx` where the `<InsightReport focal={…}>` object is built:

1. Look up the focal row already present in `scoredPool` (by `unitid` when available, falling back to name) to pick up the full `flags` object and every rank/metric field the matrix reads.
2. Spread that row first, then overlay the user-editable state so anything they toggled in the sidebar wins:
   - `flags`: merge scoredPool flags with `bigFour`/`d1` derived from `values.chk_bigFour` / `values.chk_d1athletics`, and also derive `health` from `chk_healthSystem`, `law` from `chk_lawSchool`, `aacsb` from `chk_aacsb`, `eng` from `chk_engineering`.
   - Top-level ranks/metrics: prefer `values.usNewsLaw` / `usNewsBiz` / `usNewsEng` / `usNews` / `qsRank` / `theWorldRank` / `retentionRate` / `gradRate6yr` when the user has entered them, otherwise keep the scoredPool value.
3. Keep the existing `carnegieId`, `usNewsList`, `intlGroup`, `scores`, and `name` fields.

No other files need to change. `ProfileMatrix` itself is correct; it just needs a complete focal object.

## Out of scope
- No change to scoring or weighting.
- No change to peer rows (already correct).
- `landGrant` will now populate on the focal row from IPEDS data since we're reusing the scoredPool row.
