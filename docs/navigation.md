# Navigation and page ownership

The front page is an entry point, not a container for every interactive feature.
A reader should be able to enter a subject, know where they are, and return with
their filters and place intact.

| Destination | Main job |
| --- | --- |
| `/` | One thing at a time for this week and this season: live or latest result, next game, season, division, stat leaders, official team news, current media coverage, then every section |
| `/game-day` | Focus view: the next game, the matchup as one plain sentence and each unit pairing as league-ranked bars, with every unit number opening in place, your score call, AFC East standings, the season in margins with the full schedule, league context |
| `/team` | Focus view: who leads the passing, rushing and receiving yards, the roster by position (each position opens the roster filtered to it), the newest official headlines |
| `/team/roster` | Find a player and inspect the roster |
| `/team/stats` | Recorded player production |
| `/team/news` | Official team headlines |
| `/media` | Focus view: the newest video, article, show and post, one moment each, then the searchable collection |
| `/seasons` | Focus view: every season as its record and one square per game, the 2010 playoff run, the best and worst seasons |
| `/seasons/[year]` | One selected view: games, rankings, tracking, moments or coverage |
| `/stories` | Monday Night Miracle three-part journey invitation (with browser-only save/resume) and interactive visual game timelines |
| `/stories/monday-night-miracle` | Three connected steps: the Miami comeback, Elliott’s illustrated catch, and comparison with Cleveland; explicit browser-only save and share controls |
| `/find` | Find a published Jets game by opponent, season or recorded play and open its report, available visual story or Film Room material |
| `/discover` | Same-score games with different paths, improbable finishes and recorded play changes; scoped findings with linked evidence |
| `/history` | Classic moments, rivalry records, Jets games on today’s date, and Jets legends |
| `/history/trades` | Every recorded Jets trade, each pick followed to what it became |
| `/games/[id]` | One published game report, probability curve and available efficiency |
| `/film-room` | Focus view: the six recorded plays, one moment each, then the chalkboard and the sourced game record |
| `/morgue` | Explore ranked finishes and the interactive game tape |
| `/puzzle` | The daily puzzle: guess the recorded game from its clues |

Browse sections opens the site directory from the wordmark area. On this page opens the local index on phones. The desktop index stays visible. The last section at `#more` remains directly addressable.

Keep global navigation labels stable and mark the parent destination on detail
pages. Every published route and recovery page owns `FocusShell`; the root layout mounts no legacy masthead or footer. Roster, stats and news keep Team tabs (`TeamFocusNavigation`) within that frame. Season controls sit
above the changing content; do not move them below expandable chapters.

Use ordinary routes for separate subjects. Preserve native links, keyboard
focus, browser Back, URL filters and no-JavaScript reading. Source definitions
belong on the methodology/season-guide pages or in contextual disclosures.
Avoid duplicate introductions when embedding an existing feature on its own page.

`LegacyNavigation` retains previously shared home/Team section links without
adding a history entry. New internal links should target the destination directly.
Large routes use intent prefetching; don't restore viewport-wide prefetching or
mount all of the interactive experiences on Home.
