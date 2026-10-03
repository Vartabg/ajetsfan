# Navigation and page ownership

The front page is an entry point, not a container for every interactive feature.
A reader should be able to enter a subject, know where they are, and return with
their filters and place intact.

| Destination | Main job |
| --- | --- |
| `/` | Latest result, next fixture, and clear routes into the site |
| `/game-day` | Next matchup, personal score prediction, AFC East standings, current schedule and form |
| `/team` | Team overview and featured players |
| `/team/roster` | Find a player and inspect the roster |
| `/team/stats` | Recorded player production |
| `/team/news` | Official team headlines |
| `/media` | Beat reporting, radio, video and replay |
| `/seasons` | Choose a football season; discover history and game stories |
| `/seasons/[year]` | One selected view: games, rankings, tracking, moments or coverage |
| `/stories` | Recorded games as interactive visual timelines |
| `/history` | Classic moments and rivalry records |
| `/games/[id]` | One published game report, probability curve and available efficiency |
| `/film-room` | Play design and sourced game studies |
| `/morgue` | Explore ranked finishes and the interactive game tape |

Keep global navigation labels stable and mark the parent destination on detail
pages. Team pages share one layout and local navigation. Season controls sit
above the changing content; do not move them below expandable chapters.

Use ordinary routes for separate subjects. Preserve native links, keyboard
focus, browser Back, URL filters and no-JavaScript reading. Source definitions
belong on the methodology/season-guide pages or in contextual disclosures.
Avoid duplicate introductions when embedding an existing feature on its own page.

`LegacyNavigation` retains previously shared home/Team section links without
adding a history entry. New internal links should target the destination directly.
Large routes use intent prefetching; don't restore viewport-wide prefetching or
mount all of the interactive experiences on Home.
