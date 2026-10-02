# Advanced statistics source contract

Verified October 2, 2026. This document records the sources and limits for the Jets archive’s advanced-statistics panel. Public measurements, attributed public PFF excerpts, and subscription-only datasets are distinct sources.

## NFL Next Gen Stats via nflverse

[NFL Next Gen Stats](https://nextgenstats.nfl.com/) is the original provider. The public [nflverse nextgen_stats release](https://github.com/nflverse/nflverse-data/releases/tag/nextgen_stats) distributes season and weekly passing, receiving, and rushing CSV data. [nflreadr’s loader documentation](https://nflreadr.nflverse.com/reference/load_nextgen_stats.html) describes coverage from 2016, nightly updates, workload qualification, and week-zero season aggregates. The [data dictionary](https://nflreadr.nflverse.com/articles/dictionary_nextgen_stats.html) and [official NGS glossary](https://nextgenstats.nfl.com/glossary) define the measurements.

Use these combined compressed files, verified to include 2016–2026 on the check date:

| Dataset | Exact CSV URL |
| --- | --- |
| Passing | https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/ngs_passing.csv.gz |
| Receiving | https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/ngs_receiving.csv.gz |
| Rushing | https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/ngs_rushing.csv.gz |
| Source timestamp | https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/timestamp.json |

The release also contains some individually named season assets, but their inventory stopped at 2024 when checked. The combined files contain newer seasons. Do not guess a per-season download path. The provider timestamp was `2026-10-02 09:25:08 EDT`; preserve it separately from the application’s successful-fetch `checkedAt`. A published update timestamp does not establish that every scheduled game is covered.

`buildNextGenCollection` consumes decompressed UTF-8 CSV strings. Select exactly `season_type=REG`, `week=0`, and `team_abbr=NYJ`. Preserve the provider’s season aggregates; do not average weekly rates. Each dataset retains its own published sample: `attempts`, `targets`, or `rush_attempts`. Do not derive games played by counting qualified weekly rows.

Some season rows have an empty team tag. These are not assigned to the Jets from inference. Traded-player aggregates can include all clubs: the 2024 Jets-tagged Davante Adams row contains 141 targets, 85 receptions, and 1,063 yards, including his Raiders production. The optional `teams` field identifies additional published weekly team tags. That list is helpful evidence, not proof that every appearance has a qualified weekly row. Always explain the all-club aggregate scope.

## Measurement interpretation

| Display | CSV field | Interpretation |
| --- | --- | --- |
| Time to throw | `avg_time_to_throw` | Seconds from snap to release; excludes sacks. |
| Intended air yards / target depth | `avg_intended_air_yards` | Yards from the line of scrimmage to the target; distinct from the ball’s total air distance. |
| Completion over expected | `completion_percentage_above_expectation` | Percentage-point difference from the NGS completion model. |
| Tight-window throws | `aggressiveness` | Percent of attempts with a defender within one yard of the receiver at completion/incompletion. |
| Target separation | `avg_separation` | Yards to the nearest defender at completion/incompletion on targets, not every route. |
| Cushion at snap | `avg_cushion` | Yards to the aligned defender at the snap for targeted receivers. |
| YAC over expected | `avg_yac_above_expectation` | Average yards after catch above the NGS model. Can be negative. |
| Rush yards over expected / carry | `rush_yards_over_expected_per_att` | Rushing yards above the model per attempt. Can be negative. |
| Eight-plus defenders in box | `percent_attempts_gte_eight_defenders` | Percent of rushes facing at least eight defenders in the box. |
| Rushing efficiency | `efficiency` | Distance traveled divided by rushing yards gained. Lower indicates a more direct path. |
| Rushes over expected | `rush_pct_over_expected` | Source is a fraction from 0 to 1; multiply by 100 for a percent display. |

Most other percentage columns are already on a 0–100 scale. Never multiply those by 100. Keep unrounded values in the snapshot and round only in the UI. Empty, `NA`, `N/A`, `null`, and `NaN` cells are omitted; a measured zero remains zero. Invalid numeric values, malformed years, bad CSV shape, and duplicate player/season/type/week identities reject the candidate snapshot.

The loader confirms qualification exists but does not give a single universal numerical threshold. An official passing weekly page displayed a 15-attempt minimum; that cannot establish the season threshold or thresholds for other categories. Show actual sample counts and “NGS-qualified players.” Do not infer league ranks or percentiles, imply the panel is the whole roster, or claim exact unverified qualification thresholds. Earlier than 2016 has no NGS coverage in this feed. Current-season rows are season-to-date snapshots.

The [nflverse repository license](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md) is CC BY 4.0. Attribute NFL Next Gen Stats and nflverse, link the source and license, and identify filtering/formatting changes. This does not imply permission to redistribute unrelated NFL tracking trajectories, film, logos, or media.

## PFF public excerpts and access

The verified [PFF Jets team page](https://www.pff.com/nfl/teams/new-york-jets/22/stats) provides public analysis and access to the fuller grades product. [PFF’s grading explanation](https://www.pff.com/grades) describes film-based grades and positional facets. PFF grades are normalized 0–100 evaluations; they are not NGS measurements, EPA, or an arithmetic average of game grades.

Two limited public excerpt sources were verified directly:

* [Geno Smith’s public player page](https://www.pff.com/nfl/players/geno-smith/7820), explicitly 2026 Regular, updated October 2, 2026: overall 74.7, rank 15 of 36 qualified quarterbacks; passing 78.3, rank 10 of 36. It lists 119 dropbacks. The page’s qualification rule is 25% of the position’s maximum relevant workload. Display date, phase, rank denominator, and attribution with an excerpt.
* [2026 AFC East free-agency preview](https://www.pff.com/news/nfl-2026-nfl-free-agency-preview-afc-east), published March 5, 2026, discussing the **2025** season: Jets offense 62.6, rank 31; defense 56.8, rank 26; Breece Hall rushing 83.7, rank eighth among qualifiers. The article does not state that player-rank denominator. Preserve that unknown and do not label these as 2026 grades.

These dated public excerpts are not a complete historical grade feed. Full historical grades and richer facet datasets require the appropriate PFF product. PFF Pro advertises API access, but access alone does not establish public redistribution rights. The current [PFF terms](https://www.pff.com/terms), updated September 4, 2026, distinguish permitted consumer/API use from broader commercial use. Do not scrape a paid feed, bypass a paywall, assume credentials exist, or promise licensed integration before the agreement and data contract exist. Link readers to the verified public source and subscription information when additional coverage is unavailable.

## Implementation contract

`NextGenCollection` has `schemaVersion: 1`, `checkedAt`, the three source URLs, an optional original `sourceUpdatedAt`, and `seasons`. Each season has `year`, `phase: "regular"`, passing/receiving/rushing player arrays, and scope notes. Players have GSIS ID, name, Jets tag, position, actual published sample and label, optional additional teams, and finite typed metrics with explanatory notes. `games` remains absent unless separately established by an authoritative games source.

Source ingestion belongs in the refresh job. The pure builder and runtime guard reject invalid candidates; the fetch layer should retain a previously valid snapshot when upstream retrieval or validation fails. The archive should make unavailable coverage visible instead of filling it with estimates.
