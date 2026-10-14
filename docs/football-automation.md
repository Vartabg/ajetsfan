# Automatic football publication

Production is `https://ajetsfan.com`. Scores, team coverage and analysis publish directly to the project's existing private Vercel Blob store; neither GitHub queues nor a new deployment sit between a successful provider check and readers.

| Timer | Cadence | Published data |
| --- | --- | --- |
| `/api/cron/football` | Every minute; healthy sources have independent reuse intervals | ESPN game status, score/clock, game box scores, NFLverse schedule/results, Jets RSS news, roster, confirmed season player totals |
| `/api/cron/analysis` | Every ten minutes | Processed PBP analysis, immutable probability curves, drive charts, quarterback history, league comparisons, Next Gen measurements |
| `/api/cron/media` | Every five minutes; healthy refresh about ten minutes | Publisher videos, audio and reporting with validated inline playback/artwork |

The football active window follows the current kickoff, from sixty minutes before through six hours after kickoff, and remains active for ongoing games. Outside it, scores/news/player stats check about every five minutes and rosters every fifteen minutes. All timers authenticate against the existing encrypted `CRON_SECRET`; no API credentials reach the browser. ESPN and NFLverse sources need no user-managed key.

Football and analysis have separate conditional leases and versioned edition namespaces, so a slow analysis download cannot hold the live-score worker. Body and strong ETag are read together from Blob using identity encoding; conditional writes reject expired/stale publishers. Last-known editions remain readable during failures, with honest retained/unavailable health and the original successful timestamps.

ESPN games must match season, week, teams, venue and known kickoff. Explicitly confirmed finals can advance records; live/suspended scores remain provisional. Box scores describe one game, not season totals. Source-TBD fixtures keep an unknown kickoff. Processed statistics and analysis include only reconciled confirmed finals; missing games remain pending. Rankings and Next Gen keep their own source-check dates and samples. [NFLverse's publication cadence](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html) determines when those deeper measurements become available.

Pages and public `/data` JSON URLs read the same validated runtime editions. Compiled reads are explicit during static route enumeration. Valid new games and roster profiles render at request time, while unknown IDs still return 404. The browser's serialized, visible-only revision check applies changes when idle, preserving the current URL and reading position and deferring around playback, dialogs and forms.

Current-season drive charts and quarterback history have a thirty-minute publication target after their provider data becomes available. The analysis worker shares one schedule CSV response and one PBP download across its datasets. It independently publishes history and drive source checks, reuses unchanged verified PBP assets, and retries retained datasets at the next ten-minute tick. The thirty-second reader cache and content revision also apply to `/data/league-history.json` and `/data/drives/:season.json`; a deployment is unnecessary for each postgame update.

A drive chart requires terminal-game PBP evidence matching the confirmed score and date. Missing charts remain pending, and score/date corrections withhold old charts until verified again. A truncated source can add an independently verified new chart while keeping still-valid prior rows, with a retained status and the previous successful check time. Scheduled games never supply projected starting quarterbacks. Historical drive seasons remain compiled recovery data.

Game Day links to newly verified charts even when win-probability analysis is still unavailable. Those game pages publish the confirmed score and chart with an analysis-pending caption; page metadata and share images use the same result. Legacy current-season backups need matching compiled analysis evidence and a compatible source clock before their rows can become runtime witnesses.

`/api/health` reports timer mode, last completion, duration and source ages, including separate thirty-minute history and drive freshness checks. The runtime logs emit `hosted-football-refresh` and `hosted-analysis-refresh` with publication status and failed source IDs. Verification must observe consecutive native timer publications at the same deployed Git SHA and successful advancing provider clocks; a successful initial call or a fresh compiled fallback is insufficient proof. Never replace source timestamps with timer completion dates to conceal an outage.

Daily GitHub refresh remains an independently validated recovery archive. Normal operation requires no manual scores, articles, roster edits, statistics uploads or workflow dispatches.
