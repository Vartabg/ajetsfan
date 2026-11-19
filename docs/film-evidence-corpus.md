# Film Room evidence corpus

This is the offline data foundation for a future educational replay. It does not change the Film Room, publish new historical cases, or install a 3D renderer. The checked-in [coverage report](../data/film-evidence/coverage.md), [source manifest](../data/film-evidence/manifest.json), [game audit](../data/film-evidence/game-audit.json) and [analyst catalog](../data/film-evidence/analyst-sources.json) describe an actually acquired edition.

## Storage and operation

Run from the project checkout with Node and `npm ci`:

```sh
node scripts/film-evidence-corpus.mjs
node scripts/film-evidence-corpus.mjs --verify
node scripts/film-evidence-corpus.mjs --sql "SELECT season, count(*) AS rows, count(DISTINCT game_id) AS games FROM pbp GROUP BY season ORDER BY season"
node scripts/film-evidence-proof.mjs
```

Default durable storage is `~/.local/share/ajetsfan/film-evidence`, outside any disposable worktree and outside Git. `--root /absolute/path` selects another volume. `--report-dir /absolute/path` selects the small review-artifact destination. Querying supports `--manifest /path/to/edition.json` to select a retained edition; it otherwise uses `current.json`.

* `objects/<sha256>.parquet`: complete original release bytes, including all PBP columns, descriptions, raw identities, administrative and nullified rows. These are the canonical bulk data, queried directly with DuckDB.
* `objects/<sha256>.csv`: original schedule bytes. Its lossless column conversion to Parquet is a second object, with both references retained.
* `objects/<sha256>.json`: source API inventories, per-file schema descriptions, and game-coverage audit. Column types are recorded by season rather than assumed uniform.
* `editions/<editionId>.json`: immutable source/object manifest. `editionId` hashes the complete manifest except its own field. `current.json` is replaced atomically only after acquisition, schema checks, game audit and report writing succeed.

An exclusive `.ingest.lock` stops overlapping writers. A stopped process can leave that file; inspect its PID and confirm that writer stopped before removing it. Never clear a lock solely because it is old. The next build verifies exact provider digests before recovering any orphaned object; an unknown original fetch time remains null. Ordinary refreshes retain original successful fetch timestamps for reused objects and record a fresh inventory check separately. Byte size, SHA-256, provider asset ID/digest/update time, response ETag, successful-fetch time and source URL remain separate fields.

Source `inventoryCheckedAt` means local verification against the selected inventory. Provider inventory fetch times and retained/API/HTML modes live in `manifest.inventories`; a local check cannot establish fresh upstream coverage. `--refetch-unknown-times` reacquires any recovered objects whose original successful-fetch receipt is missing, rather than inventing that time.

Release downloads use bounded HTTP byte ranges, reject mismatched range boundaries or truncated bodies, and retain completed parts for retry. Final size and any published provider SHA-256 must match before a source receipt is trusted. A provider-digest mismatch invalidates suspect parts. Individual failures are recorded under `attempts/` while other independent downloads continue; any unresolved failure prevents promotion of a new current edition. Mutable URL-only inputs such as the schedule are fetched again rather than cached indefinitely. Queries and proof generation recheck object hashes before claiming provenance. For older assets without a provider digest, local hashes establish retained-byte integrity; size, Parquet/schema and semantic checks are additional safeguards, not an independent provider checksum.

The initial acquisition encountered slow/truncated release responses and exhausted the unauthenticated GitHub API quota. It continued from retained API inventories and publisher `expanded_assets` HTML for the three additional families; derived HTML inventories are explicitly labeled, with their source snapshots/hashes retained. Missing API asset IDs/digests stay absent. `--inventory-dir /path/to/saved/inventories` supports this reproducible route without pretending it was a fresh API check. The raw PBP schema has no `game_end` field in this edition; terminal descriptions supply the fallback rather than inventing a column.

The script discovers a finite set of exact filenames from release inventories. It imports every available PBP season beginning in 1999, refuses a season gap, and validates all files before promoting the research edition. Weekly statistics are selected once; season aggregates are not concatenated as extra games. All source columns survive; `union_by_name` supplies null for fields absent in an earlier schema. Views are `pbp`, `schedule`, `player_stats`, `team_stats`, `rosters`, `weekly_rosters`, `participation`, `ftn_charting`, `snap_counts`, `ngs_passing`, `ngs_receiving`, `ngs_rushing`, `players`, `draft_picks`, and `trades` when present in the edition.

Raw objects are not browser assets and are not copied into `public/`. There is no new production database, cron, credential requirement, or runtime native import. A later publisher can upload immutable objects to durable private object storage and expose validated, bounded per-game/per-play JSON through the existing Blob edition model. This task persists the bulk research corpus on this Mac; it does not claim those objects have been uploaded to Vercel. Back up the entire storage directory before deleting the Mac copy. Upstream release URLs can be replaced: rerunning acquisition reproduces the procedure against the current source, not a guarantee that an old upstream edition remains downloadable. Hashes reveal corrections; retained local objects/backup preserve exact old editions.

## What counts as coverage

[nflreadr documents PBP from 1999](https://nflreadr.nflverse.com/reference/load_pbp.html). A source row is not necessarily a physical snap. The audit retains and separately counts:

* all raw rows and distinct `(game_id, play_id)` identities;
* `actionRows`: published run/pass/punt/kickoff/field-goal/extra-point/kneel/spike rows, including special teams and clock management; this is an explicit reproducible proxy, not independent snap measurement;
* `no_play` rows and all other/null play types;
* games with terminal markers; games with reconciled running/final/schedule scores and probability evidence; missing schedule-confirmed finals; games that fail these checks.

The game audit's `candidateComplete` is an ingestion diagnostic. It does not replace `publishedGames`, the existing analysis integrity checks, or curated Film Room identity/description checks. In particular, raw retention keeps known problematic historical games available for investigation while publication continues to withhold them. Current-season coverage remains partial and source corrections can revise older seasons. A terminal marker alone does not establish every snap is present. The audit reports observable gaps, not a certification that the historical source omitted nothing.

There is credible earlier PBP: [PFR's coverage page](https://www.pro-football-reference.com/about/coverage.htm) describes coverage from 1977, and [Sports Reference's 1977 announcement](https://www.sports-reference.com/blog/2026/08/1977-play-by-play-and-associated-stats-added-to-pro-football-reference/) records historical gaps. This is not an open bulk release imported here. [Sports Reference's data-use policy](https://sportsreference.net/data_use.html) requires permission for scraped products; a documented bulk export/reuse arrangement is the concrete next step for 1977–1998. The acquired PBP corpus's true earliest season remains 1999. Older rosters, drafts and schedule records do not extend its PBP coverage.

## Source families and rights

The exact edition's dataset years, row counts, column counts, filenames and checksums are in the manifest and generated report. The selected families extend current app ingestion rather than claim to collect every public football statistic:

| Family | Existing app use | Research edition expansion |
| --- | --- | --- |
| PBP | Jets curves, drives and league analytics/rankings | League-wide complete release files, original fields and raw rows |
| Schedule/results | NFL fixtures; Jets archive | Complete nfldata source snapshot |
| Player/team statistics | Jets contributors and phase-specific league comparisons | Every inventoried weekly season, all teams and published fields |
| Rosters/players | Latest Jets membership and profile IDs | All inventoried season and weekly rosters plus cross-provider player identities |
| NGS | Jets season aggregates | All three combined weekly/season source files, all published teams and qualified players |
| Snap counts | Not a canonical bulk input | Every inventoried season, preserving empty files and actual coverage |
| Participation | Not a canonical bulk input | Published player/personnel evidence; source identifiers preserved |
| FTN charting | Not a canonical bulk input | Published play-action/motion/RPO and other charted fields; not coordinates |
| Drafts/trades | Jets draft trade history | Complete source release files |

Primary loader contracts: [weekly stats](https://nflreadr.nflverse.com/reference/load_player_stats.html), [team stats](https://nflreadr.nflverse.com/reference/load_team_stats.html), [rosters](https://nflreadr.nflverse.com/reference/load_rosters.html), [weekly rosters](https://nflreadr.nflverse.com/reference/load_rosters_weekly.html), [snap counts](https://nflreadr.nflverse.com/reference/load_snap_counts.html), [participation](https://nflreadr.nflverse.com/reference/load_participation.html), [FTN charting](https://nflreadr.nflverse.com/reference/load_ftn_charting.html), [NGS](https://nflreadr.nflverse.com/reference/load_nextgen_stats.html), [players](https://nflreadr.nflverse.com/reference/load_players.html). The [nflverse repository license](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md) is CC BY 4.0; participation and FTN charting have explicit CC BY-SA 4.0 contracts. Attribute FTN Data via nflverse for charting and the documented provider by participation year. Preserve these family-level terms when producing derivatives. This release does not license unrelated footage or tracking.

The actual combined NGS passing source has no 2020 rows. A [separate format check](../data/film-evidence/source-coverage-checks.json) downloaded the combined CSV and confirmed the same 5,581 rows and absent season; the original compressed bytes are retained under the local corpus's `checks/` directory. This diagnostic input is separate from the 253 canonical assets and is not concatenated into the statistics. The 2012 snap-count asset is also empty. Both gaps are visible rather than filled with estimates.

Not imported: paid PFF grades/API data; proprietary full NGS trajectories; historical PFR PBP; full videos/transcripts; injuries/depth charts/PFR advanced-stat extracts and other optional nflverse families. Some of those are public source candidates, but they are outside this finite edition. Participation is published after a season, so its absence for an in-progress season is expected. Snap counts and NGS qualification do not establish every player's participation in every game.

## Tracking and analyst evidence

No coordinate time series is in this edition. The [official Big Data Bowl repository](https://github.com/nfl-football-ops/Big-Data-Bowl) offers one 2017 tracking sample (`2017090700`, KC at NE, canonical `2017_01_KC_NE`), although its games metadata lists many games. The existence of metadata does not imply tracking files for all of them. The current repository has no explicit data redistribution license. Its invitation to try the tutorial supports evaluating that sample; durable archival/public redistribution terms remain to be clarified. Earlier contest restrictions were explicitly removed after the contest, so they should not be presented as current binding sample rules. [Current Big Data Bowl releases](https://operations.nfl.com/programs-initiatives/innovation/big-data-bowl) are selected themes and participants, not a complete recent-game feed. The acquisition gap is a documented suitable tracking release plus its use terms, not a visitor paywall.

The analyst catalog stores primary publisher links, identity/date metadata, discovery and inspection state, precise evidence locators, short attributed English paraphrases, concepts and unresolved/exact game/play matches. A video landing page can identify a game or a described return; it does not establish that we watched the video. `metadata-reviewed` entries have no verified video offsets or spoken tactical claims. A title is never converted into a coverage assignment. X sources returning 403 remain discoverable but uninspected. Source text hashes and retrieval timestamps bind inspected text to a dated edition where available. Linked material remains at its publisher.

Automatic play matching must use the named game, player, event, result and a unique source-row match. Ambiguous candidates remain unresolved. The proof builder records the actual matched PBP description and selectors. An exact match identifies the historical event described by the source; it does not upgrade metadata into inspected film. Firsthand recollections and analyst charting remain attributed reports, distinct from official results and measured coordinates. Human editorial/film review remains separate from an automated consistency check.

## Contract for a later replay

Keep these linked but separate:

1. **Game/play identity:** retain nflverse `game_id`, numeric `play_id`, original game/provider IDs, season/phase/week and source edition. A canonical key such as `nflverse:2022_02_NYJ_CLE:...` is a join key; it does not discard original IDs. Player GSIS IDs remain primary where supplied, with explicit provider mappings and unresolved identities.
2. **Published events:** original description, clock, down/distance, field position, named participants and result. A game clock is not a measured subsecond animation timeline. Keep raw source values alongside derived teaching labels.
3. **Participant/charting evidence:** join only through verified provider game/play/player IDs. Preserve source grain and field coverage. Being on the field is not proof of route geometry or an exact assignment.
4. **Measured trajectory, if later acquired:** provider identity, frame ID/timebase, units, coordinate origin/axes, direction of play, event markers, player/ball IDs, source license/edition, observed time range and missing frames. Preserve source coordinates; apply a documented transform for rendering. Do not invent an ID equivalence between nflverse and BDB.
5. **Analyst claim:** source ID, exact game/play relationship, locator or verified media offset, attribution, original language, paraphrase, inspection state and review state. Claims can conflict; retain both and the resolution evidence.
6. **Inferred interval:** actor, start/end, proposed movement/action, supporting evidence IDs, inference method/version, confidence and review state. Off-camera motion, blocking assignments and poses stay inferred unless separately supported. A route drawn by a user remains an authored study, with its own provenance.

Acquisition, schema/count audits, ID candidate matching, evidence lookup and bounded shard creation can be automated. AI can propose claim extraction, clip/frame candidates and explanations for review. Exact visual identity, off-camera actions, defensive calls, ambiguous joins, rights questions and publishable educational explanations still need appropriate review. A replay compiler can sample measured or explicitly inferred intervals deterministically, while a DOM evidence panel exposes what each interval rests on. Slow motion, rewind and camera movement should share the same timeline; camera pose cannot change the evidence.

## Existing work used

Read-only reference audit, October 20, 2026:

* `garovartabedian/scripts/scriptures/index-publication.mjs`, `scripts/early/import-library.mjs`, `scripts/scriptures/build-originals.mjs`, `src/lib/early/library-server.ts`, `src/lib/find-server/sources.ts`, `scripts/site/build-corpus-health.mjs`: immutable objects, source identities/roles, byte-bound evidence and bounded delivery. Its PostgreSQL assessment-job/cache store is not its canonical text corpus.
* `atxbrov3/scripts/space-weather/gfs.py`, `refresh.py`, `src/features/cosmic-explorer/radiance/weather-data.ts`: validate source shape/units, retain provenance and atomically publish immutable source assets; separate forecast input from reconstructed cloud appearance. Space Explorer's native WebGPU/WebGL2 observation deck is distinct from its R3F overview.
* `halaverga/src/world/clipSampler.ts`, `BlenderDistrict.tsx`, `src/game/CameraRig.tsx`, `src/world/Scene.tsx`, `docs/art/arm-cannon/asset.json`: later deterministic time sampling, asset provenance/ownership, one camera writer, reduced motion and canvas recovery.
* `/Users/vartny/Research-Vault/domains/04-product-3d-web/guidance/CURRENT_GUIDANCE.md`: **reviewed** baseline; trust audit passed. Provisional recipes are not performance evidence. No renderer or device performance claim was tested here.
