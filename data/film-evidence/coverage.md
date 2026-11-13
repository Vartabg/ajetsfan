# Film evidence corpus coverage

Generated 2026-10-20T17:48:38.013Z from research edition `3487ecae1418953352a56fb6c08db56bb1f44a3de171897c60132eae2eb4f8fc` (completed 2026-10-20T17:48:08.668Z).

Stored at `/Users/vartny/.local/share/ajetsfan/film-evidence`. The [source manifest](manifest.json) records exact URLs, acquisition times, schemas and checksums; full Parquet objects remain outside Git and browser payloads.

Persisted PBP: **1,296,008 raw rows in 7,366 games, 1999–2026**, with **1,135,241 action-proxy rows**. These are source-edition counts, not a claim of every NFL play ever.

Raw rows include administrative and nullified records. Action proxy: Published play_type in run, pass, punt, kickoff, field_goal, extra_point, qb_kneel, qb_spike. Includes kneels/spikes/special teams; a reproducible action-row proxy, not proof of physical snaps.

Candidate-complete audit: Terminal marker, nonempty probability evidence and PBP running/final scores reconciled with schedule. An audit candidate only; existing publication eligibility remains authoritative.

**Published eligibility remains controlled by the existing application. This research audit grants no new published cases.**

## Persisted statistical families

| Family | Assets | Rows | Source years | Columns per asset | Object bytes | Notes |
| --- | ---: | ---: | --- | ---: | ---: | --- |
| draft_picks | 1 | 12,927 | 1980–2026 | 36 | 701,584 | Draft-pick records. |
| ftn_charting | 5 | 201,119 | 2022–2026 | 29 | 2,392,207 | Selected charted play attributes; availability and source attribution follow the manifest. |
| ngs_passing | 1 | 5,581 | 2016–2019, 2021–2026 | 29 | 683,292 | Weekly/season passing aggregates, not tracking frames. |
| ngs_receiving | 1 | 15,296 | 2016–2026 | 23 | 1,160,100 | Weekly/season receiving aggregates, not tracking frames. |
| ngs_rushing | 1 | 6,294 | 2016–2026 | 22 | 397,431 | Weekly/season rushing aggregates, not tracking frames. |
| participation | 10 | 478,989 | 2016–2025 | 20–26 | 34,817,744 | Published participation/player identifiers; not movement coordinates. |
| pbp | 28 | 1,296,008 | 1999–2026 | 372 | 495,007,941 | All retained source columns; administrative/nullified rows are retained. Earliest PBP is 1999. |
| player_stats | 28 | 482,647 | 1999–2026 | 150 | 20,652,254 | Weekly player statistics; no tracking trajectories. |
| players | 1 | 24,856 | not season-indexed | 39 | 3,394,308 | Player identity crosswalk and biographical records. |
| rosters | 107 | 142,732 | 1920–2026 | 30–36 | 17,053,792 | Season roster identities and biographical fields; early roster years do not extend PBP history. |
| schedule | 1 | 7,548 | 1999–2026 | 46 | 313,348 | Schedule/results; older schedule dates do not imply older PBP. |
| snap_counts | 15 | 333,283 | 2013–2026 | 16 | 3,024,903 | Player snap-count aggregates, not positions over time. |
| team_stats | 28 | 14,717 | 1999–2026 | 138 | 3,393,724 | Weekly team statistics. |
| trades | 1 | 4,975 | 2002–2026 | 11 | 107,779 | Published trade records. |
| weekly_rosters | 25 | 923,952 | 2002–2026 | 36 | 14,452,422 | Week-specific roster records. |

Retained empty source assets (file existence does not establish coverage): `snap_counts_2012.parquet`.

## Per-season PBP audit

| Season | Raw rows | Games | Unique play keys | Action proxy | No-play | Other/admin | Candidate-complete games | Incomplete games | Missing finished schedule games | Columns | Bytes | Last game date |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| [1999](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_1999.parquet) | 46,136 | 258 | 46,136 | 39,738 | 2,653 | 3,745 | 258 | 0 | 1 | 372 | 13,364,401 | 2000-01-30 |
| [2000](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2000.parquet) | 45,491 | 257 | 45,491 | 39,016 | 2,463 | 4,012 | 257 | 0 | 2 | 372 | 13,404,971 | 2001-01-28 |
| [2001](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2001.parquet) | 44,969 | 259 | 44,969 | 39,629 | 3,972 | 1,368 | 251 | 8 | 0 | 372 | 14,007,738 | 2002-02-03 |
| [2002](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2002.parquet) | 47,355 | 267 | 47,355 | 41,580 | 4,327 | 1,448 | 259 | 8 | 0 | 372 | 14,742,308 | 2003-01-26 |
| [2003](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2003.parquet) | 46,811 | 267 | 46,811 | 40,917 | 4,470 | 1,424 | 267 | 0 | 0 | 372 | 14,620,361 | 2004-02-01 |
| [2004](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2004.parquet) | 46,705 | 267 | 46,705 | 40,754 | 4,536 | 1,415 | 267 | 0 | 0 | 372 | 14,568,240 | 2005-02-06 |
| [2005](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2005.parquet) | 46,823 | 267 | 46,823 | 40,735 | 4,681 | 1,407 | 267 | 0 | 0 | 372 | 14,612,857 | 2006-02-05 |
| [2006](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2006.parquet) | 46,299 | 267 | 46,299 | 40,801 | 4,101 | 1,397 | 267 | 0 | 0 | 372 | 18,555,685 | 2007-02-04 |
| [2007](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2007.parquet) | 46,266 | 267 | 46,266 | 40,839 | 4,008 | 1,419 | 267 | 0 | 0 | 372 | 18,716,524 | 2008-02-03 |
| [2008](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2008.parquet) | 45,917 | 267 | 45,917 | 40,494 | 4,017 | 1,406 | 267 | 0 | 0 | 372 | 18,565,820 | 2009-02-01 |
| [2009](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2009.parquet) | 46,519 | 267 | 46,519 | 41,017 | 4,084 | 1,418 | 267 | 0 | 0 | 372 | 18,905,386 | 2010-02-07 |
| [2010](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2010.parquet) | 46,892 | 267 | 46,892 | 41,243 | 4,230 | 1,419 | 267 | 0 | 0 | 372 | 19,059,048 | 2011-02-06 |
| [2011](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2011.parquet) | 47,448 | 267 | 47,448 | 41,704 | 4,339 | 1,405 | 266 | 1 | 0 | 372 | 19,117,830 | 2012-02-05 |
| [2012](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2012.parquet) | 47,834 | 267 | 47,834 | 42,072 | 4,347 | 1,415 | 267 | 0 | 0 | 372 | 19,322,039 | 2013-02-03 |
| [2013](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2013.parquet) | 48,158 | 267 | 48,158 | 42,523 | 4,221 | 1,414 | 267 | 0 | 0 | 372 | 19,521,610 | 2014-02-02 |
| [2014](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2014.parquet) | 47,629 | 267 | 47,629 | 41,756 | 4,465 | 1,408 | 267 | 0 | 0 | 372 | 19,360,792 | 2015-02-01 |
| [2015](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2015.parquet) | 48,122 | 267 | 48,122 | 42,088 | 4,624 | 1,410 | 267 | 0 | 0 | 372 | 19,545,842 | 2016-02-07 |
| [2016](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2016.parquet) | 47,651 | 267 | 47,651 | 41,736 | 4,524 | 1,391 | 267 | 0 | 0 | 372 | 19,344,382 | 2017-02-05 |
| [2017](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2017.parquet) | 47,245 | 267 | 47,245 | 41,442 | 4,414 | 1,389 | 267 | 0 | 0 | 372 | 19,050,401 | 2018-02-04 |
| [2018](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2018.parquet) | 47,109 | 267 | 47,109 | 41,115 | 4,592 | 1,402 | 267 | 0 | 0 | 372 | 19,072,097 | 2019-02-03 |
| [2019](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2019.parquet) | 47,260 | 267 | 47,260 | 41,255 | 4,598 | 1,407 | 267 | 0 | 0 | 372 | 19,119,729 | 2020-02-02 |
| [2020](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2020.parquet) | 47,705 | 269 | 47,705 | 42,085 | 4,261 | 1,359 | 269 | 0 | 0 | 372 | 19,286,459 | 2021-02-07 |
| [2021](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2021.parquet) | 49,922 | 285 | 49,922 | 43,744 | 4,717 | 1,461 | 285 | 0 | 0 | 372 | 20,249,925 | 2022-02-13 |
| [2022](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2022.parquet) | 49,434 | 284 | 49,434 | 43,422 | 4,563 | 1,449 | 284 | 0 | 0 | 372 | 20,426,548 | 2023-02-12 |
| [2023](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2023.parquet) | 49,665 | 285 | 49,665 | 43,658 | 4,555 | 1,452 | 285 | 0 | 0 | 372 | 20,534,088 | 2024-02-11 |
| [2024](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2024.parquet) | 49,492 | 285 | 49,492 | 43,110 | 4,936 | 1,446 | 285 | 0 | 0 | 372 | 20,597,560 | 2025-02-09 |
| [2025](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2025.parquet) | 48,771 | 285 | 48,771 | 42,603 | 4,723 | 1,445 | 285 | 0 | 0 | 372 | 20,337,029 | 2026-02-08 |
| [2026](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2026.parquet) | 16,380 | 93 | 16,380 | 14,165 | 1,739 | 476 | 93 | 0 | 0 | 372 | 6,998,271 | 2026-10-19 |

Counts use the exact source edition. “Other/admin” includes null or non-action play types. Missing finished games are schedule games with final scores but no retained PBP rows.

### Retained gaps

- 1999 missing finished schedule games: `1999_01_BAL_STL`.
- 2000 missing finished schedule games: `2000_03_SD_KC`, `2000_06_BUF_MIA`.
- 2001 retained, candidate-incomplete: `2001_01_PIT_JAX`, `2001_02_TEN_JAX`, `2001_03_CLE_JAX`, `2001_06_BUF_JAX`, `2001_09_CIN_JAX`, `2001_11_BAL_JAX`, `2001_12_GB_JAX`, `2001_16_KC_JAX`.
- 2002 retained, candidate-incomplete: `2002_01_IND_JAX`, `2002_04_NYJ_JAX`, `2002_05_PHI_JAX`, `2002_08_HOU_JAX`, `2002_10_WAS_JAX`, `2002_13_PIT_JAX`, `2002_14_CLE_JAX`, `2002_16_TEN_JAX`.
- 2011 retained, candidate-incomplete: `2011_13_DET_NO`.

## Query proof

- [Latest persisted Jets game](examples/recent-jets-game.json): `2026_06_NYJ_NE`, 2026-10-18; 174 retained source rows. Candidate-complete audit: true.
- [Historical Film Room plays](examples/historical-film-room-plays.json): 4/4 uniquely matched source records.

| Film Room case | Game | Source play ID | Resolution |
| --- | --- | ---: | --- |
| Wilson’s winning touchdown | 2022_02_NYJ_CLE | 4199 | exact-play |
| Jumbo Elliott’s touchdown | 2000_08_MIA_NYJ | 4658 | exact-play |
| Hall’s winning field goal | 2000_08_MIA_NYJ | 5271 | exact-play |
| Sanchez’s Thanksgiving fumble | 2012_12_NE_NYJ | 1401 | exact-play |

Example shards contain an explicit 51-column projection, preserving original game/play IDs and descriptions. Every full source column remains in Parquet. Each shard is capped at 2,097,152 bytes.

- `examples/recent-jets-game.json`: 281,290 bytes.
- `examples/historical-film-room-plays.json`: 11,791 bytes.

## Analyst evidence

[Catalog](analyst-sources.json): 18 source records; 12 metadata-reviewed, 5 text-reviewed, 1 inaccessible. 10 attributed statements were verified in readable text.

15 catalog game references and 11 play candidates matched the corpus; 2 game references and 0 play candidates remain unresolved. Counts are catalog references and can repeat the same game/play across analysts.

Matching a metadata-described play to PBP verifies its identity only. No metadata source is upgraded to watched film, and no video timestamps, trajectories or assignments are invented. Written claims retain the named speaker, section locator, evidence kind and review state.

## Remaining limits and next evidence

- PBP starts in 1999. Earlier season rosters and schedule are not earlier PBP.
- Current-season feeds are incomplete and revisable.
- NGS aggregates and snap counts are not trajectories.
- No tracking coordinate time series acquired in this edition.
- Downloaded research corpus does not alter published-case eligibility or runtime editions.
- Earlier reusable PBP was not acquired; schedule/roster history must not be represented as earlier play-by-play.
- The source manifest is a finite dataset selection, not an inventory of all public football statistics online.
- No All-22 video, proprietary live tracking feed or complete 22-player tracking series was acquired. Aggregate NGS, participation and charting are different evidence families.
- Inaccessible social video remains a discovery pointer. Official publisher pages offer accessible metadata alternatives; equivalence to a social clip must be checked.
- An eventual 3D scene can join stable player IDs, canonical game/play keys, source events, reviewed analyst claims and separately labeled inferred intervals. Coordinates and unseen assignments still require evidence and review.

Source selection, content checksums, exact counts and these examples can be regenerated with the corpus/proof scripts. This proof step does not invoke the production refresh or change runtime delivery eligibility.
