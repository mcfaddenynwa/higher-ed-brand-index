I confirmed University of Vermont exists in the seeded US institution data and the live app is fetching the institution table successfully. The likely issue is the picker still only searches the already-loaded client list, so timing/ranking can miss the intended row depending on what has loaded and how many broad matches are returned.

Plan:
1. Update the typeahead search to query the backend directly when the user types 2+ characters in US mode, using name search against the `institutions` table instead of relying only on the local `usDb` array.
2. Keep the current local array as an instant fallback so the picker still works if the network request fails.
3. Improve ranking so these results surface first:
   - exact name match
   - word/prefix match, e.g. `vermont` → `University of Vermont`
   - contains match
   - alphabetical tie-breaker
4. Keep the suggestion count reasonable, but large enough that state/name searches like “vermont” show all relevant matches.
5. Verify the picker path by checking the relevant code and confirming the query would include `University of Vermont`.