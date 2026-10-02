# Playbook Lab

The lab lives at `/film-room#playbook-lab`, ahead of the sourced Jets notebook. It is a local diagram editor: select an alignment and concept, draw assignments, and examine motion on a shared timeline.

## Football scope

- Offensive presets cover common shotgun, under-center, pistol, spread, trips, bunch, empty, I-family and heavy alignments. Personnel notation counts running backs and tight ends, separately from alignment.
- Defensive presets cover 4–3, 3–4, nickel, dime, 3–3–5, Bear and goal-line fronts. A front does not establish a coverage or rush count.
- Standard offensive presets have eleven players, five interior linemen, two eligible ends and four backfield players. There are five receiving-eligible players in addition to the quarterback. Free positioning can produce an illegal custom alignment.
- Concept and route presets are teaching diagrams. They are not a Jets playbook, a reconstruction of the selected historical play or a verified description of a team's terminology.

Sources: [NFL formations](https://operations.nfl.com/rules-officiating/nfl-football-basics/formations), [2026 NFL rulebook](https://operations.nfl.com/rules-officiating/2026-nfl-rulebook).

## Editing and playback

Select a player on the field or in the native roster selector. Move the player, draw a route with field points, or use a route pattern as a starting point. Numeric position and waypoint controls provide an alternative to dragging. Defensive assignments can be drawn with the same tools.

Play, pause, return to the snap, change playback speed or scrub the timeline. Motion uses distance along each player's polyline over a six-second diagram duration. Ball motion illustrates the chosen carrier-to-target transfer. The engine does not simulate blocking, collisions, fatigue, acceleration, quarterback progressions, catches, interceptions or play success. It uses no tracking data.

Edits return playback to the snap. Undo restores prior edits. Reset starts again from the selected presets. Playback starts only on reader action.

## Persistence and sharing

The reader can explicitly save and load one diagram in this browser. Storage failure produces a visible message; it must not appear to save successfully. Export and import exchange a versioned JSON play file. Imports and shared diagrams are validated before entering the editor: exactly eleven players per side, distinct identifiers, valid receiving eligibility and ball references, finite bounded field coordinates, and limited movement paths.

A play link carries its diagram in a bounded URL fragment, so the diagram payload is not sent in a server request. UTF-8 names survive sharing. Ordinary section anchors preserve the current edit session; loading a shared diagram starts a new session at the snap. Changing the defensive front keeps the offense you have drawn, and changing the offense keeps the defensive assignments. Changing the concept reloads both sides, with the previous design available through Undo.

Sharing does not send a message or publish a community playbook. The historical film notebook has its own independent selection and source links.

## Verification

Pure model checks cover preset counts and eligibility, formation alignment, route bounds, interpolation, ball transfer, cloning and malformed imports. Browser checks cover editing, undo, pointer and keyboard use, playback and scrubbing, persistence, JSON exchange, shared diagrams, reduced motion, narrow reflow and automated accessibility. The existing historical-film tests continue to check recorded evidence and independent coverage lessons.
