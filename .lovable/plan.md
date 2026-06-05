# Universal coverage for Institutional Profile flags

## Problem

Today the Institutional Profile checkboxes (`chk_lawSchool`, `chk_aacsb`, `chk_engineering`, `chk_healthSystem`) and their associated US News rank fields come from one source: the ACE master file (`scripts/data/2025-Public-Data-File.xlsx`), which only covers ~340 institutions. For the other ~2,800 schools in the DB, every flag defaults to 0.

Current coverage:

```text
flags.health   201 / 3,189
flags.law       59 / 3,189
flags.aacsb     64 / 3,189
flags.eng       59 / 3,189
```

Result: University of Vermont (Grossman Business, Larner Medicine, Engineering program) shows 1/4 checkboxes instead of 4/4. Same pattern for thousands of other schools.

## Fix — derive flags from IPEDS completions

Add a new loader in `scripts/fetch-ipeds-seed.mjs` that pulls `C{year}_A.zip` (Completions by CIP code) and aggregates degree awards per institution. Then derive each flag from a clear CIP+award-level rule:

| Flag | IPEDS rule | Expected coverage |
|---|---|---|
| `flags.law` | Any degrees awarded in CIP `22.01` at first-professional / doctoral level (AWLEVEL 6, 17) | ~200 schools |
| `flags.eng` | ≥10 bachelor's degrees in CIP series `14` (Engineering) over the year (AWLEVEL 5) | ~400 schools |
| `flags.aacsb` | ≥10 bachelor's degrees in CIP series `52` (Business) — proxy for "has a business school." Real AACSB accreditation list overlaid where available | ~1,400 schools |
| `flags.health` | Existing IPEDS HD `HOSPITAL=1` (already used) **OR** any first-professional CIP `51.12` (Medicine) | ~250 schools |

Keep ACE master file as an **override** for the ~340 schools it covers — it has higher fidelity for AACSB specifically.

## What changes

1. **`scripts/fetch-ipeds-seed.mjs`**
   - Download + parse `C{year}_A.zip` once (alongside existing EF/IC/SFA loaders).
   - Build `completionsMap[unitid] = { lawDegrees, engBach, bizBach, medDegrees }`.
   - Update flag construction (~line 580):
     ```js
     law:   ace?.lawTier ? 1 : (comp?.lawDegrees > 0 ? 1 : 0),
     eng:   ace?.engTier ? 1 : (comp?.engBach >= 10 ? 1 : 0),
     aacsb: ace?.bizTier ? 1 : (comp?.bizBach >= 10 ? 1 : 0),
     health: ace?.medicalFlag ?? (hospitalFlag || (comp?.medDegrees > 0 ? 1 : 0)),
     ```
   - Re-seed `institutionsSeed.json` and upsert via `upsert_institutions_full`.

2. **Verification queries** after upsert:
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE (flags->>'law')::int = 1)   AS law,
     COUNT(*) FILTER (WHERE (flags->>'eng')::int = 1)   AS eng,
     COUNT(*) FILTER (WHERE (flags->>'aacsb')::int = 1) AS aacsb,
     COUNT(*) FILTER (WHERE (flags->>'health')::int = 1) AS health
   FROM institutions;
   ```
   Spot-check UVM (231174): expect `law=1`, `eng=1`, `aacsb=1`, `health=1`.

## What's NOT in scope

- **US News Law/Biz/Eng ranks** (`usNewsLaw`, `usNewsBiz`, `usNewsEng`) cannot be derived from IPEDS — they remain dependent on the ACE master file + curated overlay. The checkbox will auto-check, but the rank stays blank for non-ACE schools (existing behavior is fine — fields are optional and labeled "blank if unranked in top 50").
- AACSB will be a presence proxy ("school awards ≥10 business degrees"), not formal accreditation. ~95% accurate vs the real AACSB list but will have some false positives at small non-accredited schools.
- No UI changes beyond the toggle fix already shipped.

## Risk

- One additional ~50MB download in the seed pipeline. Adds ~15s to a full re-seed.
- AACSB false-positive rate: small business programs at non-accredited regional colleges may auto-check. The presence credit is small (1 pt of axis score) so impact on Brand Index is minor.
