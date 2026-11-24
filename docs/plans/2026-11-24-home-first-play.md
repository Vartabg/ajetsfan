# A first visit to the Jets homepage

## Revision 3 · Open any week in the season

At `921b67e`, the owner asked to select a season circle for game details and to distinguish home and away games at a glance. Keep the whole-game opening. Make each week a large link, displaying its number, opponent, Home or Away and a text result alongside the color. Use a short instruction and plain scores for finished games. Include next, future and bye weeks in the same interaction.

A week opens one native dialog over the season, with its matchup, location, date and result or kickoff. Completed games can include their verified game recap, record after the game, and existing report and replay links. Future weeks show the scheduled time in ET or a pending-time label. A bye explains the break and points to the next scheduled opponent when known. Preserve unknown and unconfirmed states. Read a single selected archive on the server, using the existing schedule, verified report list and snap loader. Do not ship eighteen recaps or fetch a whole season in the browser.

Use real links at `/?week=N#season`, parse strict in-range week numbers and leave other inputs on the normal homepage. With scripting, upgrade the selected server-rendered detail into a focus-trapping dialog. Escape, a Close control, backdrop and browser Back dismiss it. Restore focus to the game circle. Without scripting the same link opens the server-rendered detail with an ordinary return link. Make the phone grid reflow, keep targets at least 44px, and retain the existing performance budgets. Verify home and away finals, future and bye weeks, dates, score order, links, focus, keyboard, direct entry and no-JavaScript navigation.

## Revision 2 · Read the whole game first

At baseline `615b74a`, the owner tried the play-first preview and asked why Hall's carry was the homepage story. The opening should let someone who missed the game recount how it unfolded. Start with both teams and the final, then two or three sentences covering halftime, the second half and the finish. Put a compact, labeled team-by-quarter linescore alongside the words on wide screens and below them on phones. The first action replays the **whole game** from its opening. The full report remains available. An optional disclosure opens a scoring play tied to the recap and its Xs & Os. Keep the existing win-chance marker linked to its actual source play separately.

Use the archive already checked against the published fixture by `loadSnapGame`; resolve the game even if no featured event matches. In a small server-side projection, derive period points and narrative from chronological before/after score pairs, in Jets/opponent order. Require a connected scoring record from 0–0 through all regulation periods to the verified final. Include every overtime period. Absent or inconsistent play evidence leaves the confirmed result and its available game or season links; the lead should never fall back to an unrelated carry. Choose a late go-ahead score when there is one, a second-half score that protected a lead, or the equalizer in a tie. Verify the scoring team and type before naming players, and attach individual names to credited roles only. A summary can describe scoring by half and quarter without naming a particular player. Keep provenance, chart detail and play-level controls out of the main paragraph.

Check the actual Chargers win, Buffalo loss, comeback, overtime, tie, missing evidence and a score correction. Validate quarter sums, halftime and finish descriptions, and both replay destinations. Inspect mobile, desktop, dark, large text, keyboard and no-JavaScript states, and retain the homepage's build budgets. Preserve the live score-first opening. Refresh the existing preview for assessment.

## Original direction

Revision 1, source `06461e6`. A fan who missed Sunday should recognize the teams and result, understand one football moment, and be able to see it unfold in one click. The owner rejected a chart-first introduction and has approved the current-week focus, one thing per moment, the existing visual identity and full-team play replays. The placement and appearance proposed here still await the owner's assessment.

## Choices

Leading with a game picker would suit someone returning to a particular date. Leading with three questions about replay, players and team stats would explain the breadth, but ask a first-time visitor to choose without seeing an example. Lead with the latest score and one recorded play instead. The visitor gets an answer on arrival and can immediately inspect the play that supports it.

## The opening

Keep the existing live-game precedence, page rail, schedule, season sections and fallback order. On a published final, explicitly name both teams with the score. Present a readable account of the selected play, its period and clock, and its football consequence when the record supplies one. On a simple measured gain, a small football-field illustration shows the two labeled yard lines and gain; the words carry the meaning independently. Resolve a Jets player's full name only by credited role ID in the matching season's loaded coverage. A different opponent, tie, negative play or a loss must work without rebuilding the site.

One primary action opens the confirmed snap in the full-team drive reader, with the action already visible and previous/next controls. Keep the full report and put the win-chance graph in a closed native disclosure below the story, with its keyboard labels, marker and source link available. A retained score can be shown when play evidence is missing; use the existing report or season result as the primary action. Avoid making up a reason for the final outcome or pretending a field position is a tracked route. Keep current and archived material in their established sections.

Use the existing server-side published-game and exact-play identity checks in `src/app/page.tsx`, `featuredSnap`, `snapAccount`, `fieldPosition`, `snapSituation` and `driveReadHref`. Pass only the small presentation fields the first screen displays into `FocusHome`. Retain the chart marker's existing exact-analysis destination. Keep full play records and new libraries out of the initial client payload. The palette, Lexend typography and familiar controls stay consistent with the existing focus pages.

Test the actual phone and desktop first screen, the strength of the visual hierarchy, game/field direction across both possessions, and the destination of the first click. Inspect the source-data fallback, live lead, ties, keyboard, 320px reflow, dark mode, reduced motion, no JavaScript, existing page anchors and homepage performance budget. Build a small inspectable example with the current 27–24 game before polishing. Show the working design as a preview for this request for a recommendation.
