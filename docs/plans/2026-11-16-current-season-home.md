# Current-week and current-season homepage

Revision 3. Source baseline: `6f7c4af` (worktree branched from `origin/master` at `1411be7`, data-only commits since `6f7c4af`).

## Brief and decisions

Display only content relevant to **this week and this season** on `/`: live or just-finished current-season game (`#live`), latest current-season final (`#last`), next scheduled game (`#next`), current season week strip (`#season`), AFC East standings (`#division`), current-season player stat leaders (`#leaders`), current official team news (`#headlines`), and current Jets media coverage (`#media`), followed by `Everything else` (`#more`).

Historical and archive experiences (`JourneyHome` / `#miracle`, `LegendHomeFeature` / `#people`, *On this day* / `#today`, `FocusPlay` / `#film`, `Discovery` / `#discovery`, archive game fallbacks, and archive media) are kept off `/` and remain discoverable in their dedicated sections (`/stories`, `/history`, `/legends`, `/film-room`, `/discover`, `/morgue`, `/seasons`, `/puzzle`).

Visual and navigation fixes included in this pass:
- Tighten desktop `.rail` vertical spacing in `src/components/Focus.module.css` (`@media (min-width: 1024px)`) so 8–10 entries fit within an `800px`-tall viewport without clipping `Everything else`.
- Format `Next game` rail labels as `${home ? "Vs" : "At"} ${place}, ${weekday}` (e.g., `"At the Chargers, Sun"`) and capitalize sentence-initial `placeName()` output with `leadPlace()` when `FocusNext` leads a heading (`"The Chargers, Sunday..."`).
- Remove the mid-noun `<em>` weight split in `"The Monday Night Miracle."` on `JourneyHome` and `/stories/monday-night-miracle`.

## Contracts and boundaries

- `src/lib/home-media.ts`: `selectHomeMedia(items, season)` requires `item.context === "current"` and `(season == null || !item.seasons?.length || item.seasons.includes(season))`.
- `src/lib/focus.ts`: export `leadPlace(place)`; remove `archive` from `FocusData["last"]` and remove `film` and `discovery` from `FocusData`; add `id: string` to `FocusData["next"]`; populate `last` only when `lead.kind === "current"`.
- `src/lib/team-focus.ts`: gate `news.lead` and `news.more` on `coverage.news.status !== "unavailable"` and `season === null || coverage.season === season`.
- `src/lib/site-sections.ts`: order `SECTIONS` with current-season destinations first (`Game Day`, `Team`, `Media`, `Seasons`) followed by historical/escape destinations.
- `src/components/TeamMoments.tsx` + `src/components/TeamMoments.module.css`: shared Server Components `TeamLeadersMoment` (`#leaders`) and `TeamNewsMoment` (`#headlines`) used by both `/team` and `/` (`src/app/page.tsx`).
- `src/app/page.tsx` + `src/components/FocusHome.tsx`: compute active moment order and `firstId` deterministically on the server so server slots (`#live`, `#leaders`, `#headlines`) and client moments (`#last`, `#next`, `#season`, `#division`, `#media`) maintain exactly one `<h1>`; guard `liveMoment` against prior-season or older-week finals, and suppress `#next` whenever `liveMoment` already covers `data.next.id`.
- `src/app/stories/page.tsx`: host `<JourneyHome first />` above `#stories` (`first={false}`), removing the duplicate inline invitation.
- `src/components/OnThisDayMoment.tsx` + `src/app/history/page.tsx`: relocate `#today` to `/history` between `<FanStand />` and `<LegendHomeFeature />`, with `export const dynamic = "force-dynamic"`.
- `src/components/LegacyNavigation.tsx`: remove `"#season": "/game-day#season"` so `/#season` stays on Home; add redirects for `"#miracle"`, `"#people"`, `"#today"`, `"#film"`, and `"#discovery"`.

## Affected files and acceptance

- Code: `src/app/page.tsx`, `src/app/opengraph-image.tsx`, `src/app/team/page.tsx`, `src/app/team/overview.module.css`, `src/app/stories/page.tsx`, `src/app/stories/monday-night-miracle/page.tsx`, `src/app/history/page.tsx`, `src/app/game-day/page.tsx`, `src/components/FocusHome.tsx`, `src/components/FocusHome.module.css`, `src/components/Focus.module.css`, `src/components/FocusNext.tsx`, `src/components/JourneyHome.tsx`, `src/components/JourneyActions.tsx`, `src/components/LegacyNavigation.tsx`, `src/components/TeamMoments.tsx`, `src/components/TeamMoments.module.css`, `src/components/OnThisDayMoment.tsx`, `src/components/OnThisDayMoment.module.css`, `src/lib/focus.ts`, `src/lib/home-media.ts`, `src/lib/site-sections.ts`, `src/lib/team-focus.ts`.
- Docs: `docs/design-direction.md`, `docs/navigation.md`, `README.md`, this plan, and `docs/plans/2026-11-16-current-season-home-review.md`.
- Tests & gates: update `tests/homepage.spec.ts`, `tests/miracle-journey.spec.ts`, `tests/legends-entry.spec.ts`, `tests/deep-cuts.spec.ts`, `tests/on-this-day.spec.ts`, `tests/game-day-focus.spec.ts`, `tests/published-pages.spec.ts`; run `npm run lint`, `npm run test:data`, `npm run build`, `npm run test:performance`, and `npx playwright test`; visually inspect desktop `1280x800` and mobile `390x844` renders before finishing.
