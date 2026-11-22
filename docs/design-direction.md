# Design direction

What the owner has accepted, rejected and not yet decided about how ajetsfan looks. Read this before changing the look of a page or a share card.

## Accepted

- **Focus pages** (2026-10-05): the site adapts to the device and shows one thing at a time, without overloading a screen. Each moment has a label, one plain sentence, one shape and one action.
- **Moments fit their content** at every width, divided by a hairline (2026-10-21, PR #56).
- **Lexend, one face** (2026-10-20, PR #50): no all-caps, no italics, no caps letter-spacing, and labels of at least 13px.
- **One control shape** (PR #60): every button, chip and tab is a pill; every text box and dropdown is a 12px rounded box.
- **The name is ajetsfan** (PR #61), written as "ajets" plus a green "fan" where the type allows it.
- **Colors**: the focus palette in `src/components/Focus.module.css` (`--bg`, `--ink`, `--quiet`, `--green`, `--faint`), with era greens from `src/lib/jets-eras.ts` used sparingly.
- **Current week and season on Home** (2026-11-16): the front page shows only this week and this season — scores, schedule, standings, player stats, team news and current coverage. Archive games, legends, drawn plays, puzzles and history stay in their own sections when fans go looking for them.
- **Finding games and sections** (2026-11-17): place Browse sections beside the name. Keep the page index available independently. A fan can search by opponent and season, then open the game and its related stories or film. On Home, connect the latest game's chart to the recorded turning point and the next kickoff to a measured matchup.

- **Following a play** (2026-11-19). A fan watching on delay chooses the last clock they saw and advances the game one recorded play at a time. Each play can be shared and compared with earlier Jets games. The first two examples are Cleveland in 2022 and Buffalo in 2026.

- **Reading an exact play** (2026-11-19). The fan needs the score, clock, offense, down and field position together, with a plain account of the result. Put play-level football analysis below that context.

- **Reliving a game** (2026-11-19). A fan can pick a Jets game, click forward or backward, and see the score and a visual account of how the game unfolded. They can explore the underlying football data at their own pace.

- **Seeing the play design** (2026-11-19). The owner liked the game replay and asked to add Xs and Os for the selected play. Keep the score and game controls available while the diagram explains the football action.

- **Seeing both teams** (2026-11-22). The owner liked stepping through the Cleveland series and asked to see the entire Xs and Os. Keep all the players on the same field when revealing a snap, including the blocking, rush and coverage around the ball.

- **Reading a drive before the result** (2026-11-22). The owner approved the interactive Cleveland series and asked to add it to the website. Open on the formation and score before the snap, reveal the play on demand, keep earlier throws on the field, and let a fan follow the same identified player through substitutions.

## Rejected

- The initial exact-play view separated the score and play text from the down, distance and field position. The owner said it missed the basics of what was happening in the game.
- A drive diagram showing only Flacco, a throw and its destination leaves out the rest of the football play.
- The newspaper identity: "The Back Page", mastheads, desks, editions, datelines, stamps, paper tints and the condensed all-caps display type. It was an earlier agent's idea; the owner finds it corny.
- Any other themed concept proposed on his behalf.

## Not decided

- New names for pages that still carry newspaper names: "The Morgue" (shown as "Game archive" in the menu) and "How the paper is made".

- Whether fans find and share evidence faster than on the official site awaits a head-to-head usability session.

- The default replay pace, its selection threshold and the fixed-direction field are design choices to try with fans.

- The coaching-board orientation, phase control and level of schematic detail are implementation choices for fan testing.

## Share cards

A link preview is usually seen at thumbnail size in a chat or feed. It should name the site and say in one glance what the page is about. It uses the focus-page grammar: the site name, a quiet label, one plain sentence in Lexend, a short detail, and a score or record in a green rounded box where the page has one. Everything is sentence case on the light focus background, with no rules, tints or capitals.
