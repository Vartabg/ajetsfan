# The Back Page — a Jets fan

An independent Jets newspaper whose front page is set by the archive. A losing streak ages the paper; a win restores fresh stock. Second-half win-probability extremes choose the lead and its headline scale.

## Explore

- `/`: the front page, selected from the archive.
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
npm run build
npx playwright install chrome
npm run test:a11y
```

Browser checks use system Google Chrome and a production server. They verify case-study navigation, keyboard interaction, responsive reflow, and automated accessibility. CI runs the same gates. Automated checks do not establish complete accessibility conformance.

## Data and decisions

The committed snapshot covers the 1999–2025 seasons. It is not a live scoreboard. `scripts/build-data.mjs` uses DuckDB to read nflverse Parquet and generate `public/data/games.json` plus per-play curves. Rebuilding data requires network access and is separate from building the website.

Heartbreak ranks losses by peak second-half Jets win probability; Miracle ranks wins by the trough. Administrative rows with an empty or null possession team are excluded before reading probability. Kneels, spikes, and no-plays cannot supply the decisive play. Games whose running scores do not reconcile with the recorded final are flagged and excluded from rankings, while retained for inspection.

The paper and editorial rules live in `src/lib/paper.ts`; ranking rules live in `src/lib/games.ts`. The case study derives counts and exclusions from the same snapshot as the product.

Source data: [nflverse](https://github.com/nflverse/nflverse-data). Not affiliated with the New York Jets or the NFL.
