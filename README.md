# The Back Page — a Jets fan

An independent Jets newspaper whose front page follows the latest confirmed result. This season's record, recent games, next scheduled matchup, and data timestamps sit beside the postgame analysis. A losing streak ages the paper; a win restores fresh stock. The historical Heartbreak & Miracles archive remains available below.

## Explore

- `/`: the latest result and current season, with a clearly labeled archive feature before the season begins.
- `/morgue`: Heartbreak & Miracles rankings and per-game probability curves.
- `/how-made`: the engineering case study, interactive paper comparison, source rules, and visible data exclusions.

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

Browser checks use system Google Chrome and a production server. They verify the current front page, case-study navigation, keyboard interaction, responsive reflow, and automated accessibility. Data tests cover parsing, season rollover, incomplete analysis, failed publication, and recovery. CI runs the same gates. Automated checks do not establish complete accessibility conformance.

## Data and decisions

The committed snapshot starts in 1999. Coverage and counts on the site come from the actual files. This is a periodically refreshed postgame publication. Schedule-confirmed results can appear while detailed play-by-play analysis is still pending; in-progress scores are not supported.

```sh
npm run data:refresh  # refresh the current NFL season; preserve historical games
npm run data:rebuild  # explicitly rebuild every available season since 1999
```

Both commands require network access. The season is inferred from the official schedule and calendar, including January/February belonging to the preceding NFL season. `scripts/build-data.mjs` reads official nflverse Parquet with DuckDB. The schedule and final scores come from [nfldata's games.csv](https://github.com/nflverse/nfldata/blob/master/data/games.csv).

`public/data/current.json` records the checked time, analysis update time, source URLs, and current-season fixtures/results. `games.json` and `curves/{game_id}.json` contain analyzed archive games. The refresher validates a complete staged directory before publishing it, keeps prior analysis while new analysis is pending, and restores the previous directory if publication fails. A process lock and recovery step handle overlapping runs and interrupted publication. Unexpected HTTP, schema, or validation failures exit nonzero and leave the last good snapshot intact.

The site uses a committed snapshot and static pages. Building the site does not fetch sports data. The visible edition date comes from the successful data check, rather than the current wall clock. A small reader-side clock displays an overdue warning when that check is more than 24 hours old, even if the deployed page has stopped updating.

## Scheduled publication

`.github/workflows/refresh-data.yml` checks three times daily, with extra hourly checks after Sunday afternoon and Sunday/Monday/Thursday night games. Times are UTC. The Thursday pass also picks up source corrections. The [nflverse update schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html) describes processed play-by-play updates after game days; actual availability can lag a final score.

The workflow activates after this change reaches the default branch. It also supports **Actions → Refresh Jets data → Run workflow** on that branch. It refreshes, runs data tests, lint, a production build, and browser checks before committing only `public/data`. A failed check publishes nothing; a concurrent default-branch update causes the ordinary push to fail safely. Failed runs appear in GitHub Actions with normal repository notification settings.

Vercel's Git integration should deploy the resulting bot push, but verify that the first automatic commit actually produces a successful deployment. For an explicit deployment request, create a Vercel deploy hook for the default branch and save its URL as the GitHub Actions secret `VERCEL_DEPLOY_HOOK`. The workflow requests that hook only after a validated push. The hook URL is a secret; do not commit it. A hook response confirms a request, so check Vercel for build completion. If no hook is configured, the workflow summary calls out the need to verify Git deployment. GitHub's `GITHUB_TOKEN` push does not trigger the separate Verify workflow, which is why refresh runs its own gates.

GitHub schedules can be delayed, and public-repository schedules may be disabled after prolonged inactivity. Check Actions if the visible checked time falls behind; a manual run restores the normal path. A successful check updates `checkedAt` even if football data is unchanged, so the publication timestamp remains honest. `analysisUpdatedAt` changes only when analysis changes.

Heartbreak ranks losses by peak second-half Jets win probability; Miracle ranks wins by the trough. Administrative rows with an empty or null possession team are excluded before reading probability. Kneels, spikes, and no-plays cannot supply the biggest turning point. Chart markers identify that same analyzed play. Games whose running scores do not reconcile with the recorded final are flagged and excluded from rankings, while retained for inspection. Current analysis must also agree with the schedule's final; a corrected score cannot reuse a stale curve.

The paper and editorial rules live in `src/lib/paper.ts`; ranking rules live in `src/lib/games.ts`. The case study derives counts and exclusions from the same snapshot as the product.

Source data: [nflverse](https://github.com/nflverse/nflverse-data). Not affiliated with the New York Jets or the NFL.
