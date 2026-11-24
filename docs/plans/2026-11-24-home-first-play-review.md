# Review of the homepage opening

## Whole-game revision

Gemini 3.8 Flash High reviewed revision 2 against `615b74a` in a fresh supplied-text session. It completed successfully in 47 seconds with no tool calls. Its inputs included the revised brief, the archive and replay contracts, the homepage code and two real scoring histories. The later review exercised the user's preference for a recap before any play.

The confirmed result must survive archive lag or a corrected score. Require an uninterrupted score record for the linescore and the recap. Choose the whole-game replay's explicit `pace=all` so visitors start at the first snap and can move to every play. Include overtime periods in the table, and use a native disclosure for the individual scoring play. Touchdowns and their tries have separate timestamps. Count both score deltas in the correct period, choose an actual go-ahead extra point when a touchdown only tied the game, and use the existing drive reader's action URL for its Xs & Os. The Chargers' featured touchdown extended an existing lead. It did not put the Jets ahead.

The small interaction proof showed the Jets' halftime lead, scoring pass and final Chargers rally, and opened the full game with JavaScript disabled.

## Play-first revision

Gemini 3.8 Flash High completed an isolated, supplied-text EGM review of revision 1 against `06461e6`. The input contained the design brief, proposal, and excerpts of Home, LastGame, the focus types, snap matching and field projection. The review completed successfully in 30 seconds and used no tools.

The review identified three necessary behaviors already proposed. The graph must start closed, the first action must open the indicated play, and a visitor must be able to identify both teams and their scores. Use the opponent’s nickname in the scoreboard. The marker’s existing URL goes to analysis, so build the separate replay URL with the verified game and play IDs. Preserve the chart’s labels inside its disclosure. Omit the field illustration when a recorded end spot is unavailable.

The suggestion to reconstruct a legacy overtime clock from regulation game-seconds conflicts with the data contract in `games.ts`. Those seconds can be pinned to zero throughout overtime. Keep the exact-ID lookup and the ordinary report fallback for ambiguous records. The homepage story may be available when chart points are missing, so resolve it independently of the graph using the same published fixture and exact-play checks.

A phone proof using the Chargers final displayed the score and Hall’s run, opened the optional explanation with JavaScript off, and reached play 3038 in the drive reader. The owner subsequently rejected the run as the lead story.
