# Independent EGM design review

Plan revision 2, source baseline `6f7c4af`; reviewed by `EGM Plan Reviewer R2` (`research` subagent, conversation `4505c333-218f-4c0d-ae98-fe6cd94d6a29`, isolated from parent transcript and `~/.claude/projects/*/memory/`). Completed normally on `2026-11-16T20:41:30Z`. Reading list covered `docs/design-direction.md`, `docs/navigation.md`, `src/app/page.tsx`, `src/app/opengraph-image.tsx`, `src/app/team/*`, `src/app/stories/page.tsx`, `src/app/history/page.tsx`, `src/app/game-day/page.tsx`, `src/components/*`, `src/lib/*`, and affected `tests/*.spec.ts`.

## Findings and dispositions for revision 3

### Material blockers (all accepted)
1. **Server-rendered `ReactNode` slots (`#live`, `#leaders`, `#headlines`) vs. dynamic `first` (`<h1>`) and `stale` `status` in `FocusHome`**: Accepted. Because rendered home moments are deterministic on the server, `src/app/page.tsx` computes `firstId` and passes `first={firstId === "..."}` to both server slots and `FocusHome`. Client `stale` status renders in a stage-padded `.staleWrap` container at the top of `<FocusShell>` children so it aligns cleanly regardless of which moment is first and never affects `[data-focus-moment]` slack checks.
2. **`#live` / `#next` state transitions and prior-season / older-week leaks**: Accepted. Gated `loadCurve` on `lead.kind === "current"`; renamed `liveMoment`'s `<FocusMoment>` ID from `"next"` to `"live"`; added `id` to `FocusData["next"]` and `FocusNextGame`; gated `liveMoment` on `live.featured.season === snapshot.season` and week progression vs. `data.last`; suppressed `#next` whenever `live.featured.gameId === data.next.id` (whether in progress or recently final).
3. **`LegacyNavigation` hijacking `/#season`**: Accepted. Removed `"#season": "/game-day#season"` from `LegacyNavigation.tsx` `home` map while adding `"#miracle"`, `"#people"`, `"#today"`, `"#film"`, and `"#discovery"`; guarded `/#today` -> `/history#today` redirect checks against non-game dates.
4. **`/stories` and `/history` relocation `<h1>`, `entries`, and duplicate-intro invariants**: Accepted. On `/stories`, registered `miracle` then `stories` in `entries`, removed `first` from `#stories`, and removed the duplicate `.invitation` div. On `/history`, mounted `<OnThisDayMoment />` between `<FanStand />` (`<h1>`) and `<LegendHomeFeature />` with matching `entries` order so `tests/navigation.spec.ts` keeps passing.

### Optional improvements (all accepted)
1. **Season guard on `buildTeamFocus().news`**: Accepted. Gated `newsReady` on `coverage.news.status !== "unavailable"` and `season === null || coverage.season === season`, and passed `snapshot?.season ?? null` from `src/app/page.tsx`.
2. **Explicit string contracts (`leadPlace`, `TeamLeadersMoment` roster CTA, rail entries)**: Accepted and specified in Revision 3.
3. **`tests/published-pages.spec.ts` and selector/casing fixes**: Accepted (`lead.kind === "current"` skip guard in `tests/published-pages.spec.ts`, `#last-heading` selector and `leadPlace` assertions in `tests/homepage.spec.ts` and `tests/game-day-focus.spec.ts`, `/stories` updates in `tests/miracle-journey.spec.ts`).
4. **Heading consistency on `/stories/monday-night-miracle` and dead CSS/import cleanup**: Accepted (`heading="The Monday Night Miracle."` on `src/app/stories/monday-night-miracle/page.tsx:40`; pruned unused components and `.discovery`/`.years`/`.dated` rules from `FocusHome`).

## Validation

- `npm run lint`: passed (`eslint`, exit 0).
- `npm run test:data`: 480 passed, 0 failed.
- `npm run build` + `npm run test:performance`: production build succeeded (`657/657` static pages; retry after Next.js 16.4.2 security advisory notice); all 21 route budgets passed (`/` measured 10.9/14 KiB HTML and 197.6/203 KiB initial JS gzip; `/history` measured 9.2/14 KiB HTML and 187.3/195 KiB initial JS gzip).
- Playwright browser & accessibility suite (`PORT=3117 npx playwright test`): 73/73 passed across the 10 directly affected specs (`homepage`, `miracle-journey`, `legends-entry`, `deep-cuts`, `on-this-day`, `game-day-focus`, `published-pages`, `navigation`, `focus-rail`, `mobile-scroll`); full suite ran 647 checks with 643 passed, 3 skipped, and 1 failure (`tests/wilson-replay.spec.ts:385` `document.fullscreenElement !== null`, known local-only macOS fullscreen flake).
- Rendered visual inspection (`http://127.0.0.1:3117` production server): inspected `/stories` (`1280x800`, uniform `"The Monday Night Miracle."` `<h1>` weight), `/history` (`1280x800`, `#fan-stand` → `#rivals` → `#today` → `#people`), and `/` (`390x844` mobile and `1280x800` desktop: `#last` leads as `<h1>`, `"At the Chargers, Sun"` in rail, `#leaders` and `#headlines` present, zero historical sections, rail items fit within `800px` with zero clipping or horizontal overflow).
