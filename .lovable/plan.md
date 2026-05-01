## Goal

Produce a single, brand-styled PDF document that explains the Higher Ed Brand Index weighting system in plain language — something you can read offline, share with colleagues, or reference without opening the app. No changes to the app itself.

## Format

- **PDF**, US Letter, mcfadden+co brand styling (navy headings, Young Serif display, Bitter body, 4px brand color bar at top, 56×3px Steel Blue rules before each section).
- ~6–8 pages.
- Saved to `/mnt/documents/HE_Brand_Index_Weighting.pdf` and offered as an artifact.

## Contents

1. **Cover page** — title, subtitle ("How the Higher Ed Brand Index weights its six dimensions"), date, mcfadden+co wordmark.

2. **A note on methodology (1 short page)** — Frames the document honestly: weighting is judgment, not science. There is no single "correct" formula. The weights below reflect a defensible point of view about what matters most for different kinds of institutions, calibrated against publicly available signals (IPEDS, US News, QS, THE, Niche, Caldwell, NACUBO).

3. **The six dimensions** — One short paragraph each explaining what's being measured and why it matters (Visibility & Reach, Enrollment & Retention, Financial Strength, Institutional Profile, Research, Diversity & Access).

4. **Weight tables** — Clean, readable tables showing the weight assigned to each dimension by:
   - **US Carnegie classification** (13 cohorts: R1, R2, RCU, Mixed Doctoral, Professions Doctoral, Mixed Master's, Professions Master's, Mixed Bac, Professions Bac, Liberal Arts, Associate's, Special Focus, Tribal).
   - **International classification** (5 cohorts: Research Elite, Research Univ., Comprehensive, Teaching-Focused, Specialist).
   - **QS band overlay** (Top 100, 101–200, 201–400, 401–600, 601+, Unranked) — explains how QS standing nudges the base weights for international schools.

5. **How blending works (½ page)** — Plain-English explanation: for international schools, the base classification weight is averaged with the QS-band weight, then normalized to sum to 100%. US schools use only their Carnegie weight.

6. **What the weights are NOT** — One-pager addressing the obvious critiques head-on: not a ranking, not predictive, not absolute, not equally applicable to every institution. Encourages reading dimensions individually.

## Technical approach

- Use the `pdf` skill with **reportlab** (Python) to generate the PDF — gives precise control over brand layout, tables, and the Steel Blue rule device.
- Pull weight values directly from `src/pages/HEBrandEquity.jsx` (`WEIGHTS`, `INTL_WEIGHTS`, `QS_BAND_WEIGHTS`) so numbers exactly match the app.
- Use Helvetica/Times as font fallbacks (Young Serif and Bitter aren't installed in the sandbox; the PDF will use a serif/sans pair styled to feel close to brand). If you want exact brand fonts embedded, that's a follow-up.
- After generation: convert each page to JPG and visually QA for overflow, alignment, and contrast issues before delivering.

## Deliverable

A `<lov-artifact>` link to the PDF so you can download and read it.

No code changes to the app. No new routes, no new UI.
