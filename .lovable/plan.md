# Fix: Classify dropdown panel is transparent and opens upward

## Problems visible in screenshot
1. The dropdown panel has no solid background — option text bleeds through onto the page behind it.
2. The panel opens **upward** (above the trigger) instead of downward, covering the page header.

## Fix

Edit only the `<SelectContent>` block in `src/pages/HEBrandEquity.jsx`:

1. **Force a solid white background + high z-index** — use an inline `style={{ backgroundColor: '#FFFFFF' }}` so it can't be overridden by class merging or portal-context issues, and bump `z-[100]`.
2. **Force downward placement** — pass `position="popper"`, `side="bottom"`, `align="start"`, `sideOffset={4}`, and `avoidCollisions={false}` so Radix never flips the panel above the trigger.
3. Keep the existing navy border, shadow, and group-label styling.

No other files change. No logic changes.
