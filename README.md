# The Back Page — a Jets fan

An independent Jets publication built around checked final scores, recorded play descriptions, recorded player production, and visual football evidence. The Morgue keeps its newspaper case-file identity while presenting second-half probability rankings and sourced historical context. Every displayed rate carries its unit and sample; deeper statistical analysis opens in league and unit comparisons. A subtle paper tint follows the recorded streak, with the full paper conditions available as an interactive specimen.

Published copy describes verifiable results, dates, play descriptions, counts, and rates. It does not assign feelings or invented dialogue to fans or players. Historical statements link to their sources; probability and efficiency estimates remain distinct from confirmed results and matchup predictions.

The accepted [product vision](docs/product-vision.md) guides future passes: every surprising Jets fact should open into an explorable football story. It maps the discovery, connected-data and evidence patterns from garovartabedian.com to a comeback explorer, unified Jets discovery, a sourced draft trade tree and football puzzles, with explicit delivery and data requirements.

## Explore

- `/film-room`: an editable playbook lab with six source-backed Jets study diagrams: Wilson and Davis in Cleveland, Jumbo Elliott, Wesley Walker, the Butt Fumble and the Fake Spike. Full-snap studies animate all 22 positions with assignment notes and path isolation, while a separate source-action mode limits motion to documented actors. Staged movement, possession changes, timeline moments and explicit evidence limits accompany the formation/concept editor, local saves, validated play files and share links. Four detailed historical notebooks and an independent coverage/pressure board remain available below. See [playbook behavior and limits](docs/playbook-lab.md).
- `/`: the focus view, one thing per screen, built from the same data as the rest of the site: the latest final as its play-by-play win-chance line, the next game in its week, the season as one mark per week, the AFC East as bars, a Film Room play that runs on request, the newest Media Room item, then every section. Each moment has one plain sentence, one shape and one action that opens detail in place. Phones get full-height moments under a slim bar; screens 1024px and wider get an index beside one large stage; short landscape screens put the words beside the shape. The home page has no site masthead or footer (`SiteChrome`); every other page keeps them for now. Interactive experiences still live on their own pages (see [docs/navigation.md](docs/navigation.md)).
- `/#visual-story`: an original visual comeback explorer for Cleveland in 2022 and Miami in 2000. Recorded clocks, source descriptions, a probability path and curated chapters share one selected moment. Readers can scrub, play/pause chapters and share a moment URL; motion respects reader preferences and pauses when the story is out of view.
- `/team`: dated official headlines, passing/rushing/receiving leaders, and roster search by name, jersey, position, unit, and source status. Player selections and filters use shareable URLs, such as `/team?player=00-0033106#roster`.
- `/morgue`: Heartbreak & Miracles rankings with season/opponent filters, search, sorting, shareable selected-game URLs, and keyboard/pointer play scrubbing. Example: `/morgue?game=2026_03_NYJ_DET&board=heartbreak`.
- `/games/{game_id}`: a server-rendered final, sourced game context and measured play change, and a probability chart when usable source points exist, with a dedicated share card and a link to the matching interactive tape. A case also lists verified replay links attached to that exact game in the media catalog, and an official photograph when one is selected for it. Unreliable or unknown cases return HTTP 404.
- `/puzzle`: one published game case per New York day, chosen by a stable hash of the date. Six guesses of opponent and season; each miss opens another recorded clue (when, conditions, margin, score, opponent colours, season). The page revalidates every five minutes; progress and the solved tally stay in the reader's browser.
- `/history/trades`: every Jets trade in the nflverse trade record (2002 onward), each pick followed to the selection made with it or to the later trade that moved it. A later deal's return is printed once and described as what the deal returned; no valuation is applied.
- `/players/{gsis_id}`: current source roster profiles, guarded recorded statistics, source check times and dedicated share cards. Historical or unknown player identities return HTTP 404.
- `/how-made`: the engineering case study, interactive paper comparison, source rules, and visible data exclusions.

Every route generates its own 1200×630 share image through `src/lib/share-image.tsx`; the release spec requests each one.

## Run locally

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev -- --hostname 127.0.0.1
```

## Verify

```sh
npm run lint
npm run test:data
npm run build
npx playwright install chrome
npm run test:a11y
```

Browser checks use system Google Chrome and a production server. They verify the current front page, news links, roster filters and player profiles, matchup numbers, full schedule, archive filters and shareable links, play scrubbing, case-study navigation, editable play diagrams and playback, responsive reflow, and automated accessibility at 1280, 390, and 320px. Data tests cover parsing, source URL validation, season rollover, incomplete analysis, independent feed failure, failed publication, and recovery. CI runs the same gates. Automated checks do not establish complete accessibility conformance.

## Data and decisions

The committed snapshot starts in 1999. Coverage and counts on the site come from the actual files. This is a periodically refreshed postgame publication. Schedule-confirmed results can appear while detailed play-by-play analysis is still pending; in-progress scores are not supported.

```sh
npm run data:refresh  # refresh the current NFL season; preserve historical games
npm run data:rebuild  # explicitly rebuild every available season since 1999
```

Both commands require network access. The season is inferred from the official schedule and calendar, including January/February belonging to the preceding NFL season. `scripts/build-data.mjs` reads official nflverse Parquet with DuckDB. The schedule and final scores come from [nfldata's games.csv](https://github.com/nflverse/nfldata/blob/master/data/games.csv).

`public/data/analytics.json` contains pooled current-season team and per-game EPA/success rates, dropback/rush splits, league ranks, analyzed/pending game IDs, definitions, and an independent analysis cutoff. Only schedule-confirmed regular-season finals with terminal game evidence and reconciled scores enter the sample. Clean plays require down 1–4, run/pass type, valid teams, and finite EPA; no-plays, kneels, spikes, and two-point attempts are excluded. Dropbacks include passes, sacks, and scrambles. Empty denominators produce null; defense EPA allowed ranks lower values first. Missing or regressed play-by-play preserves the last complete analytics snapshot. Early-season samples are descriptive, rather than forecasts.

`public/data/current.json` records the checked time, analysis update time, source URLs, current-season fixtures/results, and AFC East standings computed from the league schedule's confirmed regular-season finals dated on or before the check (ordered by win percentage, division record and point differential, not the NFL tiebreaking procedure; the pages say so). Its optional `analysisCheck` distinguishes the latest attempt, last successful PBP check and retained/unavailable analysis. A missing successful-check time stays unknown. `games.json` and `curves/{game_id}.json` contain analyzed archive games. The refresher validates a complete staged directory before publishing it, keeps prior analysis while new analysis is pending, and restores the previous directory if publication fails. A process lock and recovery step handle overlapping runs and interrupted publication. Current-season PBP transport failures (including HTTP 503, timeouts and interrupted downloads) retain valid analysis while independently validated results and team feeds publish. Confirmed new finals are added to pending analytics coverage without advancing retained rates or cutoffs. Malformed Parquet, schema/curve/analytics integrity failures, and historical backfill outages still fail safely before publication.

`public/data/coverage.json` contains independently checked news, roster, and weekly player-stat snapshots. Headlines and publication times come from the [official Jets RSS feed](https://www.newyorkjets.com/rss/news); bodies stay at the original articles. The latest NYJ regular-season roster week comes from [nflverse roster releases](https://github.com/nflverse/nflverse-data/releases/tag/rosters). Source membership labels do not establish injury status or game-day availability. Profiles use GSIS IDs with validated ESPN IDs as a fallback. Source entries missing both identifiers are counted visibly and await a searchable profile. Vetted source headshots fall back to initials when unavailable.

Passing, rushing, and receiving totals use [nflverse player-stat releases](https://github.com/nflverse/nflverse-data/releases/tag/stats_player), restricted to matching schedule-confirmed Jets regular-season finals. Each game's passing completions, yards, and touchdowns must match its receiving totals. Leaders rank by yards. Recorded-game counts describe source statistics rows; defensive/special-teams production is not shown. Missing data remains missing. A failed coverage feed preserves its previous data and successful-check time with `retained` status, or publishes an `unavailable` empty state if no prior data exists. Other valid feeds and results can still update. Earlier-week roster regressions and lost player-game rows retain the previous feed. Source seasons remain visible after rollover, and player statistics must match the current edition season before they are displayed.

The site uses a committed snapshot and static pages. Building the site does not fetch sports data. The visible edition date comes from the successful data check, rather than the current wall clock. A small reader-side clock displays an overdue warning when that check is more than 24 hours old, even if the deployed page has stopped updating.

`npm run data:trades` rebuilds `public/data/draft-trades.json` from nflverse [`trades.csv`](https://github.com/nflverse/nflverse-data/releases/tag/trades) and [`draft_picks.csv`](https://github.com/nflverse/nflverse-data/releases/tag/draft_picks). Draft club codes are mapped from Pro-Football-Reference to nflverse codes. A malformed row in another club's trade is reported and skipped; one in a Jets trade fails the run. The scheduled refresh does not run it: the record changes a few times a year.

## Scheduled publication

`.github/workflows/refresh-data.yml` checks three times daily, with extra hourly checks after Sunday afternoon and Sunday/Monday/Thursday night games. Times are UTC. The Thursday pass also picks up source corrections. The [nflverse update schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html) describes processed play-by-play updates after game days; actual availability can lag a final score.

The workflow activates after this change reaches the default branch. It also supports **Actions → Refresh Jets data → Run workflow** on that branch. It refreshes, runs data tests, lint, a production build, and browser checks before committing only `public/data`. A failed check publishes nothing; a concurrent default-branch update causes the ordinary push to fail safely. Failed runs appear in GitHub Actions with normal repository notification settings.

Vercel's Git integration should deploy the resulting bot push. For an explicit deployment request, create a Vercel deploy hook for the default branch and save its URL as the GitHub Actions secret `VERCEL_DEPLOY_HOOK`. The workflow requests that hook only after a validated push. The hook URL is a secret; do not commit it. GitHub's `GITHUB_TOKEN` push does not trigger the separate Verify workflow, which is why refresh runs its own gates.

Set the GitHub Actions repository variable `PUBLIC_SITE_URL` to the production HTTPS origin. After publishing, `scripts/verify-published-data.mjs` polls `/api/health` within a bounded retry window and requires the exact new season/check time, rather than accepting an older successful deployment. A correct retained-source edition is reported as deployed with degraded feeds; an old, unavailable or overdue results edition fails verification. Without the variable, the workflow explicitly reports **Deployment unverified**. A commit or deploy-hook response alone never establishes what readers received.

## Public launch configuration

Set Vercel's `NEXT_PUBLIC_SITE_URL` to the chosen permanent HTTPS origin, without a path/query/fragment. Otherwise canonical URLs use Vercel's production project host when available. Without either configured origin, canonicals are omitted and the sitemap is empty. Preview and development deployments emit `noindex` and disallow crawling. The sitemap includes the season directory, available season pages, Media Room, eligible game cases and current player profiles; source-check timestamps are not fabricated as content modification dates. Rebuild after changing the public origin.

The favicon uses the publication's original football crest. Share images use its newspaper colors and self-hosted Anton type, including the [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/anton) and bundled SIL Open Font License in `public/fonts/OFL-Anton.txt`. Card rendering needs no external font or photograph request.

`/api/health` checks the deployed edition against the runtime clock, returns independent source ages/statuses, and is never cached. HTTP 200 means all source checks are ready and less than 24 hours old; HTTP 503 signals degraded/unavailable data, including a stopped updater. It is suitable for an external uptime check, but no external alert service is configured by this repository. The endpoint exposes no stack traces, private paths or credentials.

Vercel Web Analytics and Speed Insights are integrated. Enable them for the project in Vercel to collect audience and real-user performance data. Query strings and fragments are removed before events are sent; ticket choices and rituals are never submitted as analytics events. Speed Insights metrics depend on the configured Vercel plan. These integrations do not constitute a separate client-error reporting service. The existing Next.js/React/TypeScript/Vercel/DuckDB stack remains in place; publishing still deploys a validated committed snapshot, without a runtime database or CMS.

GitHub schedules can be delayed, and public-repository schedules may be disabled after prolonged inactivity. Check Actions if the visible checked time falls behind; a manual run restores the normal path. A successful check updates `checkedAt` even if football data is unchanged, so the publication timestamp remains honest. `analysisUpdatedAt` changes only when analysis changes. Coverage sources each retain their own `checkedAt`, `attemptedAt`, status, and source update metadata; building or deploying the site cannot advance those checks.

Heartbreak ranks losses by peak second-half Jets win probability; Miracle ranks wins by the trough. Administrative rows with an empty or null possession team are excluded before reading probability. Kneels, spikes, and no-plays cannot supply the biggest turning point. Chart markers identify that same analyzed play. Games whose running scores do not reconcile with the recorded final are flagged and excluded from rankings, while retained for inspection. Current analysis must also agree with the schedule's final; a corrected score cannot reuse a stale curve.

Featured photography comes from official Jets game and player coverage, with source links, descriptive alternatives, and game/practice/archive captions. The editorial selections and provenance are documented in [docs/editorial-photos.md](docs/editorial-photos.md). The game cover is keyed to its actual fixture; a later game without an editorial selection keeps the score and typography rather than inheriting an older game's photograph. Featured players use action or candid imagery; compact headshots remain in the roster for identification. Failed editorial images retain a visible link to the source coverage. The retired generated illustration is documented in [docs/stadium-image.md](docs/stadium-image.md).

Opponent names and the small colour cues beside fixtures come from `src/lib/teams.ts`, keyed by the historical code the archive records (Oakland, San Diego and St. Louis stay with the city that played; Washington keeps its city because the nickname changed across the archive). The colours approximate each club's published uniform colours and are decorative identity cues; no team or league logo is reproduced. Game cases show the venue, roof and kickoff weather recorded in the nflverse schedule for that game when present; older snapshots without a stadium field show only the recorded conditions. Season directory strips draw one square per recorded final in date order (green win, rust loss, ringed playoff) from the same results the season pages count.

The paper and editorial rules live in `src/lib/paper.ts`; ranking rules live in `src/lib/games.ts`. The case study derives counts and exclusions from the same snapshot as the product.

Source data: [nflverse](https://github.com/nflverse/nflverse-data). Not affiliated with the New York Jets or the NFL.

## Seasons and Media Room

`/seasons` lists only years with available results or explicitly sourced material. `/seasons/[year]` separates regular-season and playoff samples, calculates score-based records/margins, links eligible game cases, and brings together tagged memories and media. Search narrows displayed content without changing the selected phase's totals. January playoffs stay with the preceding football season. The score archive starts in 1999; selected earlier years contain sources rather than invented complete results. Team and individual league comparisons are provided where complete weekly sources pass the checks; historical EPA splits are not included.

`src/lib/media-catalog.json` is a manually reviewed collection, separate from the automatically refreshed official news desk. Verified authors, publication dates, source URLs, video/post identities and football-season tags are documented in `docs/media-sources.md`. Validation fails a build for invalid or conflicting entries. `/media` stores source/topic/format/season/search/selection in the URL, compares up to two items, and counts actual selections by outlet. Cards are grouped by format (watch, posts, read, listen), current coverage first, and each shows its publisher's own preview picture or none; there is no stand-in artwork. Pictures are optimized by Next Image, which admits only the exact URLs recorded in the catalog. Supported YouTube and native X embeds load on explicit request, with bounded X failure handling and original-source fallbacks. Third-party availability is never guaranteed. Curated media requires another editorial review to become newer; data refresh does not update its check time.

The official RSS parser validates every entry and then withholds future publication dates, preserving valid already-published items. An entirely future-dated feed retains the last verified edition. No publication date is altered.


## League ranks, NFL tracking and PFF

`npm run data:rankings` refreshes current-season league comparisons and the public Next Gen source. `npm run data:rankings -- --full` rechecks every available league season from 1999. The scheduled default-branch refresh runs this step after the score/coverage update. Checked static snapshots keep network traffic out of readers’ page requests; compressed weekly CSV mirrors reduce preparation downloads. Source failures retain the prior season’s successful-check timestamp.

`public/data/season-rankings.json` contains phase-specific scoring and yardage team ranks plus Jets contributors’ individual volume ranks against their explicit league populations. Exact competition ties, actual participant counts, confirmed games, source gaps and all-club versus Jets totals are visible. Invalid or unassigned credits withhold affected metrics.

`public/data/nextgen-stats.json` contains published Jets-tagged regular-season player aggregates from 2016 onward: time to throw, completion over expected, separation/cushion, rushing over expected and related measurements. Missing fields remain absent; NGS thresholds are not invented, and traded-player totals carry their all-club scope. `src/lib/pff-public.ts` holds five small dated public-source grade excerpts for 2025/2026. It is manually reviewed, not an API feed or comprehensive historical PFF dataset. A full grades integration requires appropriate API access and display rights. Provenance and definitions: [advanced statistics sources](docs/advanced-stats-sources.md).
