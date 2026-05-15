## Goal

Implement Step 6 of the database brief — pull 2025 Carnegie data when an institution is selected and display the three 2025 framework labels (Institutional Classification, SAEC tier, Research Designation) for the chosen school. Steps 1–5, 7, and 8 of the brief are already in place from prior turns.

## Changes to `src/pages/HEBrandEquity.jsx`

### 1. Import 2025 helpers
Add at the top of the file (alongside other lib imports):
```js
import { get2025Data } from "@/lib/carnegie2025";
```

### 2. Add three new state variables
Co-locate with the other selection-related state (near `unitid` / `carnegieId`):
```js
const [institution2025IC, setInstitution2025IC] = useState(null);
const [institutionSAEC, setInstitutionSAEC] = useState(null);
const [institutionResearch, setInstitutionResearch] = useState(null);
```

### 3. Extend `selectInstitution` (line 817)
After existing auto-population logic and before `setValues`, pull `carnegie2025` from the row (with `get2025Data(unitid)` as a fallback for the 52-school sample whose row may predate the column):

```js
const c2025 = school.carnegie2025 || get2025Data(school.unitid);
if (c2025) {
  if (c2025.researchDesignation != null) {
    populated.researchDesignation = String(c2025.researchDesignation);
    autoFields.push('researchDesignation');
  }
  if (c2025.saecScore != null) {
    populated.saecScore = String(c2025.saecScore);
    autoFields.push('saecScore');
  }
  if (c2025.accessRatio != null) {
    populated.accessRatio = String(c2025.accessRatio);
    autoFields.push('accessRatio');
  }
  setInstitution2025IC(c2025.ic2025name ?? null);
  setInstitutionSAEC(c2025.saec2025name ?? null);
  setInstitutionResearch(c2025.research2025name ?? null);
} else {
  setInstitution2025IC(null);
  setInstitutionSAEC(null);
  setInstitutionResearch(null);
}
```

The `populated.researchDesignation`/`saecScore`/`accessRatio` keys only take effect if matching input ids exist in the form. They're harmless otherwise (kept verbatim from the brief) and align with the brief's instruction.

### 4. Surface the three 2025 labels in the Step 2 sidebar
Augment the existing classification block (around line 1034–1037) to add up to three brand-styled rows beneath the institution name when present:

```jsx
{institution2025IC && (
  <div style={{ fontSize: 11, color: '#595959', marginTop: 6, lineHeight: 1.4 }}>
    <div><span style={{ color: '#1C3678', fontWeight: 600 }}>2025 IC:</span> {institution2025IC}</div>
    {institutionResearch && <div><span style={{ color: '#1C3678', fontWeight: 600 }}>Research:</span> {institutionResearch}</div>}
    {institutionSAEC && <div><span style={{ color: '#1C3678', fontWeight: 600 }}>SAEC:</span> {institutionSAEC}</div>}
  </div>
)}
```

Uses brand tokens (Navy `#1C3678`, Mid Gray `#595959`, Bitter body font already in scope). Steel-blue rule device is reserved for major section headings, so it's not used inside this compact sidebar block.

## Out of scope
- Steps 1–5 (data file, seed script, migration, seeding) — already done.
- Step 7 (suggestion dropdown city/state/Carnegie short) — already implemented.
- Step 8 (`IPEDS_DB` fallback) — already preserved.
- Scoring logic, weights, and chart rendering — unchanged.

## Verification
- Build will run automatically.
- Manually: pick a US school in the typeahead, advance to Step 2, confirm the three 2025 lines render under the school name when available, and that schools without 2025 data render exactly as today.
