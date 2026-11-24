# A first visit to the Jets homepage

Revision 1, source `06461e6`. A fan who missed Sunday should recognize the teams and result, understand one football moment, and be able to see it unfold in one click. The owner rejected a chart-first introduction and has approved the current-week focus, one thing per moment, the existing visual identity and full-team play replays. The placement and appearance proposed here still await the owner's assessment.

## Choices

Leading with a game picker would suit someone returning to a particular date. Leading with three questions about replay, players and team stats would explain the breadth, but ask a first-time visitor to choose without seeing an example. Lead with the latest score and one recorded play instead. The visitor gets an answer on arrival and can immediately inspect the play that supports it.

## The opening

Keep the existing live-game precedence, page rail, schedule, season sections and fallback order. On a published final, explicitly name both teams with the score. Present a readable account of the selected play, its period and clock, and its football consequence when the record supplies one. On a simple measured gain, a small football-field illustration shows the two labeled yard lines and gain; the words carry the meaning independently. Resolve a Jets player's full name only by credited role ID in the matching season's loaded coverage. A different opponent, tie, negative play or a loss must work without rebuilding the site.

One primary action opens the confirmed snap in the full-team drive reader, with the action already visible and previous/next controls. Keep the full report and put the win-chance graph in a closed native disclosure below the story, with its keyboard labels, marker and source link available. A retained score can be shown when play evidence is missing; use the existing report or season result as the primary action. Avoid making up a reason for the final outcome or pretending a field position is a tracked route. Keep current and archived material in their established sections.

Use the existing server-side published-game and exact-play identity checks in `src/app/page.tsx`, `featuredSnap`, `snapAccount`, `fieldPosition`, `snapSituation` and `driveReadHref`. Pass only the small presentation fields the first screen displays into `FocusHome`. Retain the chart marker's existing exact-analysis destination. Keep full play records and new libraries out of the initial client payload. The palette, Lexend typography and familiar controls stay consistent with the existing focus pages.

Test the actual phone and desktop first screen, the strength of the visual hierarchy, game/field direction across both possessions, and the destination of the first click. Inspect the source-data fallback, live lead, ties, keyboard, 320px reflow, dark mode, reduced motion, no JavaScript, existing page anchors and homepage performance budget. Build a small inspectable example with the current 27–24 game before polishing. Show the working design as a preview for this request for a recommendation.
