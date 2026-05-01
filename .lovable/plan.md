No, I do not need specifics from you for the institutions already in the app. I can read the current institution database and the finance snapshot.

Current finding:
- Peer finance data is present for most U.S. rows: 48 of 52 U.S. institutions match the finance snapshot.
- The app is merging that data into the peer pool, but the visuals are not making it visible enough.
- The spider chart and the bar/readout can still look like peer finance is missing because they do not show per-axis peer coverage, and missing peer values can be visually treated like zero or hidden.

Plan:

1. Make peer financial data visible in the spider chart
- Update the spider chart overlay logic so Financial Strength uses real peer averages when available.
- Add an explicit small label for the Financial Strength axis showing peer coverage, for example: `peer data n=26`.
- Prevent missing peer values from rendering as zero-point dips in the cohort polygon.
- Keep the orange user institution shape, dashed Carnegie average, and dotted all-institution average.

2. Make peer financial data visible in the bar chart / dimension breakdown
- In the Dimension Breakdown bars, show the Carnegie peer average marker for Financial Strength when peer financial data exists.
- Add a small peer-data note under the Financial Strength row, for example: `Financial peer data included: 26 Carnegie peers / 48 all institutions`.
- If no peer financial data is available for a selected cohort, show a clear note rather than implying the peer info is simply missing.

3. Fix the Strategic Insight Report bar chart message
- Update the `PillarRow` logic in `InsightReport.jsx` so Financial Strength shows the same peer average and n-count when available.
- Replace “insufficient peer data” style messaging with a more specific financial coverage message when the issue is only financial-field coverage.
- Ensure the Financial Strength bar renders when both the user score and peer average exist.

4. Add axis-level peer counts to the scoring objects
- Extend the aggregate calculation to return both `scores` and `counts` by axis.
- Example structure: `carnegieAvg.scores.financial = 42`, `carnegieAvg.counts.financial = 26`.
- Reuse those counts in the spider chart, dimension breakdown, and report bars.

5. Keep unmatched institutions excluded, not blocking
- Leave unmatched finance rows out of financial averages rather than forcing placeholder values.
- Current missing finance rows are Drexel, Fordham, Valencia, and Thomas Jefferson; Colorado Boulder has revenue but no endowment-per-student.
- These should not prevent the rest of the peer finance data from appearing.

Files to update after approval:
- `src/pages/HEBrandEquity.jsx`
- `src/components/InsightReport.jsx`
- Possibly `src/lib/insightFramework.js` if the report needs axis-level peer counts passed through its analysis model.