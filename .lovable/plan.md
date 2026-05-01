## What's wrong

You're right — peers' financials are **not** being pulled in.

`financeSnapshot.json` (48 institutions, FY2022-23) is currently used for **one thing only**: auto-filling the form when *you* pick your institution. The peer database rows in `IPEDS_DB` (`SCHOOL_LIST`) have no `endowmentPerStudent` or `totalRevenue` fields on them. So when `scorePool()` scores all peers on the two financial axes, every peer reads as `null` and contributes nothing to:

- the cohort average on Endowment per student
- the cohort average on Total revenue
- z-scores / strength-gap ranking on those two axes
- the spider chart's peer overlay for those axes

In other words: when you look at how you compare to peers on financial scale, the comparison is empty.

## Fix (light, one place)

Merge the snapshot into the peer pool at score time. No data entry, no schema changes — the snapshot is already keyed by `unitid`, which every US row already has.

In `src/pages/HEBrandEquity.jsx`, inside the `scoredPool` `useMemo` (~line 666), before calling `scorePool`:

```js
const combined = [...IPEDS_DB, ...INTL_DB].map(s => {
  if (!s.unitid) return s;                      // skip intl rows
  const fin = financeSnapshot[s.unitid];
  if (!fin) return s;
  return {
    ...s,
    endowmentPerStudent: s.endowmentPerStudent ?? fin.endowmentPerStudent,
    totalRevenue:        s.totalRevenue        ?? fin.totalRevenue,
  };
});
```

That's it. The two existing axes (`endowmentPerStudent`, `totalRevenue`) already know how to normalize these values — they just need the values present on each peer row.

## Coverage check

- 48 of the ~60 US peers in `IPEDS_DB` have a finance snapshot row → they'll now contribute to peer averages.
- US peers without a snapshot row stay `null` (excluded from that axis's average — correct behavior).
- International peers in `INTL_DB` already carry their own `endowmentPerStudent` / `totalRevenue` USD-equivalent values inline → unchanged.

## Expected impact

- Endowment-per-student and Total-revenue axes will now show real peer means and bars.
- Strength/Gap cards may shuffle once the financial axes have a real cohort to compare against.
- "Cohort size" stays the same — we're enriching existing rows, not adding any.

## Out of scope

- No change to scoring weights, axes, or the InsightReport UI.
- No re-fetch of IPEDS — snapshot is already current (FY2022-23, fetched today).
- No change to the user's auto-fill behavior — that path still works exactly as before.
