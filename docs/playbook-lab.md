# Playbook Lab

The lab lives at `/film-room#playbook-lab`, ahead of the sourced Jets notebook. It opens with Garrett Wilson's Cleveland touchdown and offers six source-backed Jets study diagrams. It is also a local diagram editor: select an alignment and concept, draw assignments, and examine motion on a shared timeline.

## Jets study archive

`src/lib/jets-playbook.ts` contains Wilson's 15-yard winning touchdown and Davis's 66-yard touchdown in Cleveland (2022), Jumbo Elliott's 3-yard Monday Night Miracle touchdown (2000), Wesley Walker's 43-yard overtime winner (1986), the Butt Fumble (2012) and Marino's Fake Spike (1994). Each record carries primary source links, confirmed facts, explicit schematic limits, team orientation, named central actors and four teaching moments.

Only central actions supported by the cited accounts receive movement. Other markers are anonymous stationary placeholders, not claims that the real players stood still. Alignments, front/concept IDs, coordinates, exact route geometry, timing, flight and blocking remain illustrative. The template selectors do not establish historical calls. The Fake Spike correctly presents Miami offense against Jets defense. The Butt Fumble illustrates a loose ball, Gregory recovery and return without simulating contact or assigning Moore a blocking error.

Readers can filter glory/agony, load a study diagram, step through moments, edit the players and timing, restore the original, undo, save and share a study copy. Direct anchors such as `/film-room#jets-play:sanchez-thanksgiving` open the corresponding board. Historical notebooks link to matching drawings. An optional `archiveId` survives export/import; the UI compares the validated design with its canonical board and labels modified versions as edited study copies. Source facts describe the original historical play, not the reader's edited assignments.

## Football scope

- Offensive presets cover common shotgun, under-center, pistol, spread, trips, bunch, empty, I-family and heavy alignments. Personnel notation counts running backs and tight ends, separately from alignment.
- Defensive presets cover 4–3, 3–4, nickel, dime, 3–3–5, Bear and goal-line fronts. A front does not establish a coverage or rush count.
- Standard offensive presets have eleven players, five interior linemen, two eligible ends and four backfield players. There are five receiving-eligible players in addition to the quarterback. Free positioning can produce an illegal custom alignment.
- Concept and route presets are teaching diagrams. They are not a Jets playbook, a reconstruction of the selected historical play or a verified description of a team's terminology.

Sources: [NFL formations](https://operations.nfl.com/rules-officiating/nfl-football-basics/formations), [2026 NFL rulebook](https://operations.nfl.com/rules-officiating/2026-nfl-rulebook).

## Editing and playback

Select a player on the field or in the native roster selector. Move the player, draw a route with field points, or use a route pattern as a starting point. Numeric position and waypoint controls provide an alternative to dragging. Defensive assignments can be drawn with the same tools.

Play, pause, return to the snap, change playback speed or scrub the timeline. Motion uses distance along each player's polyline over a six-second diagram duration or an optional `motionWindow`. Players hold their starting position before the window and their endpoint after it. Ball motion illustrates the chosen carrier-to-target transfer or an optional ordered `ballEvents` sequence of carry, flight and loose-ball intervals. A carry or flight can refer to either team; this depicts a scripted turnover rather than predicting one. Custom ball settings or formation changes remove the archival event sequence, with Undo available. The engine does not simulate blocking, collisions, fatigue, acceleration, quarterback progressions, catches, interceptions or play success. It uses no tracking data.

Edits return playback to the snap. Undo restores prior edits. Reset starts again from the selected presets. Playback starts only on reader action.

## Persistence and sharing

The reader can explicitly save and load one diagram in this browser. Storage failure produces a visible message; it must not appear to save successfully. Export and import exchange a versioned JSON play file. Imports and shared diagrams are validated before entering the editor: exactly eleven players per side, distinct identifiers, valid receiving eligibility and ball references, finite bounded field coordinates, and limited movement paths.

A play link carries its diagram in a bounded URL fragment, so the diagram payload is not sent in a server request. UTF-8 names survive sharing. Ordinary section anchors preserve the current edit session; loading a shared diagram starts a new session at the snap. Changing the defensive front keeps the offense you have drawn, and changing the offense keeps the defensive assignments. Changing the concept reloads both sides, with the previous design available through Undo.

Sharing does not send a message or publish a community playbook. The historical film notebook has its own independent selection and source links.

## Verification

Pure model checks cover preset counts and eligibility, formation alignment, route bounds, interpolation, ball transfer, cloning and malformed imports. Browser checks cover editing, undo, pointer and keyboard use, playback and scrubbing, persistence, JSON exchange, shared diagrams, reduced motion, narrow reflow and automated accessibility. The existing historical-film tests continue to check recorded evidence and independent coverage lessons.
