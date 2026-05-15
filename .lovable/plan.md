# Style the Classify dropdown to match the UI

## Goal
Replace the native `<select>` on the Classify screen with a fully branded dropdown that matches the rest of the mcfadden+co UI (Young Serif headings, Bitter body, navy/orange palette, signature steel-blue rule).

## Approach
Swap the native `<select>` for the existing shadcn `Select` component (`src/components/ui/select.tsx` — already in the project, built on Radix). This gives us:
- Full control over trigger, dropdown panel, group headings, and items via Tailwind classes
- Consistent appearance across Chrome, Safari, Firefox
- Keyboard + screen-reader accessibility out of the box
- Grouped options (Doctorate / Master's / Baccalaureate / Associate's / Special Focus) using `SelectGroup` + `SelectLabel`

## What changes (scope-limited to the Classify card)

1. **Trigger** — styled to match the auto-detected classification card:
   - White background, 1px navy border, rounded-md
   - Bitter font, navy `#1C3678` label text
   - Orange `#EB5600` chevron icon
   - Hover/focus ring in navy

2. **Dropdown panel**
   - White surface, soft navy shadow, 1px light-gray border
   - Group headings in Young Serif, small-caps, mid-gray, preceded by the 56×3 steel-blue rule motif (scaled down to ~24×2 for menu density)
   - Items in Bitter, navy on hover background (light-gray `#E9EDEE`), orange check mark for the selected item
   - Max-height with smooth scroll for the 26 cohorts

3. **Selected state inside the card**
   - Show the chosen IC code + label in Young Serif (matches the rest of the card's typography)
   - Keep "auto-detected" vs "manually overridden" eyebrow text

## Files touched
- `src/pages/HEBrandEquity.jsx` — replace the `<select>` block in the Classify screen with `<Select>` / `<SelectTrigger>` / `<SelectContent>` / `<SelectGroup>` / `<SelectLabel>` / `<SelectItem>` from `@/components/ui/select`. Wire `value`/`onValueChange` to the existing `ic2025` override state.

## Out of scope
- No changes to classification logic, weights, peer cohorts, or scoring
- No changes to the auto-detected classification card content itself (only the dropdown control inside/under it)
- No global token changes to `index.css` or `tailwind.config.ts`

## Open question (optional)
Want the dropdown panel to also show the **research designation** (R1/R2/R3) and **SAEC tier** as small chips next to each Doctorate option, or keep it to just the cohort name? Default plan is just the cohort name to keep the menu compact.
