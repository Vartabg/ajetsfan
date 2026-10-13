# Automatic football publication

Production is `https://ajetsfan.com`. Scores, team coverage and analysis publish directly to the project's existing private Vercel Blob store; neither GitHub queues nor a new deployment sit between a successful provider check and readers.

| Timer | Cadence | Published data |
| --- | --- | --- |
| `/api/cron/football` | Every minute; healthy sources have independent reuse intervals | ESPN game status, score/clock, game box scores, NFLverse schedule/results, Jets RSS news, roster, confirmed season player totals |
| `/api/cron/analysis` | Every ten minutes | Processed PBP analysis, immutable probability curves, league comparisons, Next Gen measurements |
| `/api/cron/media` | Every five minutes; healthy refresh about ten minutes | Publisher videos, audio and reporting with validated inline playback/artwork |

The football active window follows the current kickoff, from sixty minutes before through six hours after kickoff, and remains active for ongoing games. Outside it, scores/news/player stats check about every five minutes and rosters every fifteen minutes. All timers authenticate against the existing encrypted `CRON_SECRET`; no API credentials reach the browser. ESPN and NFLverse sources need no user-managed key.

Football and analysis have separate conditional leases and versioned edition namespaces, so a slow analysis download cannot hold the live-score worker. Body and strong ETag are read together from Blob using identity encoding; conditional writes reject expired/stale publishers. Last-known editions remain readable during failures, with honest retained/unavailable health and the original successful timestamps.

ESPN games must match season, week, teams, venue and known kickoff. Explicitly confirmed finals can advance records; live/suspended scores remain provisional. Box scores describe one game, not season totals. Source-TBD fixtures keep an unknown kickoff. Processed statistics and analysis include only reconciled confirmed finals; missing games remain pending. Rankings and Next Gen keep their own source-check dates and samples. [NFLverse's publication cadence](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html) determines when those deeper measurements become available.

Pages and public `/data` JSON URLs read the same validated runtime editions. Compiled reads are explicit during static route enumeration. Valid new games and roster profiles render at request time, while unknown IDs still return 404. The browser's serialized, visible-only revision check applies changes when idle, preserving the current URL and reading position and deferring around playback, dialogs and forms.

`/api/health` reports timer mode, last completion, duration and source ages. The runtime logs emit `hosted-football-refresh` and `hosted-analysis-refresh` with publication status and failed source IDs. Verification must observe consecutive native timer publications at the same deployed Git SHA and successful advancing provider clocks; a successful initial call or a fresh compiled fallback is insufficient proof. Never replace source timestamps with timer completion dates to conceal an outage.

Daily GitHub refresh remains an independently validated recovery archive. Normal operation requires no manual scores, articles, roster edits, statistics uploads or workflow dispatches.
