## Pipeline pass: fix retention + D1 universally

Two data-pipeline fixes to `scripts/fetch-ipeds-seed.mjs`, then re-seed and upsert. No UI changes.

### 1. Retention — switch source to EF{year}D

**Problem:** `DRVGR.RET_PCF` is null for ~98.5% of institutions in current IPEDS releases. Only 48 of 3,189 schools have retention populated.

**Fix:** Add a Fall Enrollment Part D loader (`EF{year}D.zip`) and read:
- `RRFTCT` — full-time first-year retention rate (primary)
- `RRPTCT` — part-time first-year retention rate (fallback for institutions that don't report full-time)

Wire the result into `metrics.retentionRate`, replacing the current `DRVGR.RET_PCF` read at line 468. Keep `DRVGR` for `GBA4RTT`/`GBA6RTT` (grad rates) — those are still correct there.

Expected coverage lift: ~1.5% → ~85–90% (every degree-granting 4-year and most 2-year institutions report this).

### 2. D1 athletics — switch from ACE local file to IPEDS Athletic Aid

**Problem:** `is_division_1` currently sourced from `scripts/data/2025-Public-Data-File.xlsx` (ACE), which only covers ~340 schools. Legitimate D1 programs outside that list (UVM/America East, many mid-majors) default to `d1: 0`. Only 96 of 3,189 schools flagged.

**Fix:** Add an IPEDS Student Financial Aid Part 2 loader (`SFA{year}_P2.zip`) and read the NCAA division participation field (`ASSOC1` / `ASSOC2` membership codes — NCAA Division I = code `1`). Set `flags.d1 = 1` when the institution reports Division I membership in any sport. Drop the ACE-derived `is_division_1` read.

Keep `flags.bigFour` on the curated overlay (Big Four conference membership isn't in IPEDS — that stays a hand-maintained list).

Expected coverage lift: ~3% → ~100% of the ~362 current D1 institutions.

### 3. Re-seed + upsert

- Re-run `node scripts/fetch-ipeds-seed.mjs` to regenerate `institutionsSeed.json` + TSV
- Upsert to the `institutions` table via the existing `upsert_institutions_full` RPC (chunked, same as prior seeds)
- Spot-check UVM (unitid 231174): should return non-null `metrics.retentionRate` (~87%) and `flags.d1 = 1`

### Technical details

**Files touched (pipeline only):**
- `scripts/fetch-ipeds-seed.mjs`
  - Add `EF_D_FILE = "EF${EF_YEAR}D.zip"` constant near other IPEDS file constants
  - Add `SFA_P2_FILE = "SFA${SFA_YEAR}_P2.zip"` constant
  - Add `loadEFD()` function — same shape as existing `loadDRVGR()`, indexed by `UNITID`
  - Add `loadSFAP2()` function — index by `UNITID`, return `{ d1: bool }`
  - In the per-institution merge: `retentionRate = num(efd[unitid]?.RRFTCT) ?? num(efd[unitid]?.RRPTCT)`
  - In flags merge: `d1 = sfaP2[unitid]?.d1 ? 1 : 0` (overrides ACE)
  - Leave `chk_bigFour` source unchanged (curated overlay)

**IPEDS file URLs (no auth):**
- `https://nces.ed.gov/ipeds/datacenter/data/EF2023D.zip`
- `https://nces.ed.gov/ipeds/datacenter/data/SFA2223_P2.zip`

(Confirm latest available year at fetch time; bump `EF_YEAR` / `SFA_YEAR` constants together with the existing IPEDS year vars.)

**Verification before claiming done:**
```sql
select count(*) filter (where metrics->>'retentionRate' is not null) as retention_n,
       count(*) filter (where (flags->>'d1')::int = 1) as d1_n,
       count(*) as total
from institutions;
```
Expect retention_n > 2,500 and d1_n between 340–370.

### Not in scope
- No UI changes
- No finance re-pull (separate decision, lower priority)
- `chk_bigFour` stays on curated overlay
- Specialty US News ranks (Law/Biz/Eng) stay on curated overlay
