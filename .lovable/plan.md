## Bug

The "US News Law Rank" field labels itself **"blank if unranked in top 50"** but auto-populates any rank value, including ones outside the top 50. Penn State Main's law school is rank 64 → field shows `64 LOCKED` instead of being blank. Same issue applies to **US News Business Rank** and **US News Engineering Rank** (both also use `rankMax: 50`).

## Why it happens

In `src/pages/HEBrandEquity.jsx` (lines 954–962), the auto-populate loop copies every IPEDS field straight onto the form values:

```js
fields.forEach(field => {
  if (school[field] != null) {
    populated[targetField] = String(school[field]);
    autoFields.push(targetField);
  }
});
```

There's no gate on `usNewsLaw / usNewsBiz / usNewsEng` against their checkbox's `rankMax`. The scoring math already clamps the bonus to 0 for ranks > 50 (line 414), so the score is correct — but the displayed number is misleading.

## Fix

One focused change in the auto-populate loop: for the three grad-program rank fields, only populate when the rank is ≤ 50. Otherwise leave the value blank (and don't mark it auto-populated), matching the field's own label.

```js
const GRAD_RANK_MAX = { usNewsLaw: 50, usNewsBiz: 50, usNewsEng: 50 };

fields.forEach(field => {
  if (school[field] == null) return;
  const cap = GRAD_RANK_MAX[field];
  if (cap != null && Number(school[field]) > cap) return; // unranked in top 50 → leave blank
  const targetField = (isIntl && field === 'accessPct') ? 'pellPct' : field;
  populated[targetField] = String(school[field]);
  autoFields.push(targetField);
});
```

The `chk_lawSchool / chk_aacsb / chk_engineering` checkboxes still get checked from `school.flags` (lines 968–970), so the presence of the school is preserved — only the rank number is suppressed when it's outside the top 50. This matches how the field already behaves for users who type the value manually (the placeholder/hint asks them to leave it blank if unranked).

## Verification

- Penn State Main (214777): law checkbox stays checked, US News Law Rank input is empty. Business rank 37 still shows. Engineering rank 20 still shows.
- A school with law rank ≤ 50 (e.g., Michigan = 9, Texas = 15) still shows the number.
- Score for Penn State's profile axis is unchanged (rank-bonus math already returned 0 for >50).

Approve and I'll apply the fix.