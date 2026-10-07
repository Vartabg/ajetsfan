# Navigation and page ownership

The front page is an entry point, not a container for every interactive feature.
A reader should be able to enter a subject, know where they are, and return with
their filters and place intact.

| Destination | Main job |
| --- | --- |
| `/` | One thing at a time: latest result, next game, season, division, a big play, the newest coverage, then every section |
| `/game-day` | Focus view: the next game, the matchup in numbers (every unit number in place), your score call, AFC East standings, the season in margins with the full schedule, league context |
| `/team` | Focus view: who leads the passing, rushing and receiving yards, the roster by position (each position opens the roster filtered to it), the newest official headlines |
| `/team/roster` | Find a player and inspect the roster |
| `/team/stats` | Recorded player production |
| `/team/news` | Official team headlines |
| `/media` | Focus view: the newest video, article, show and post, one moment each, then the searchable collection |
| `/seasons` | Choose a football season; discover history and game stories |
| `/seasons/[year]` | One selected view: games, rankings, tracking, moments or coverage |
| `/stories` | Recorded games as interactive visual timelines |
| `/history` | Classic moments and rivalry records |
| `/history/trades` | Every recorded Jets trade, each pick followed to what it became |
| `/games/[id]` | One published game report, probability curve and available efficiency |
| `/film-room` | Focus view: the six recorded plays, one moment each, then the chalkboard and the sourced game record |
| `/morgue` | Explore ranked finishes and the interactive game tape |
| `/puzzle` | The daily puzzle: guess the recorded game from its clues |

Keep global navigation labels stable and mark the parent destination on detail
pages. Roster, stats and news share the Team tabs (`TeamFrame`); the Team overview is a focus page. Season controls sit
above the changing content; do not move them below expandable chapters.

Use ordinary routes for separate subjects. Preserve native links, keyboard
focus, browser Back, URL filters and no-JavaScript reading. Source definitions
belong on the methodology/season-guide pages or in contextual disclosures.
Avoid duplicate introductions when embedding an existing feature on its own page.

`LegacyNavigation` retains previously shared home/Team section links without
adding a history entry. New internal links should target the destination directly.
Large routes use intent prefetching; don't restore viewport-wide prefetching or
mount all of the interactive experiences on Home.
