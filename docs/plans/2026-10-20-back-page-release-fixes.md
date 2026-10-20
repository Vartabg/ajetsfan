# Back Page release fixes

Goal: repair the audited defects, publish current data, deploy the tested source and verify real production reader paths before drafting a LinkedIn post.

Approach: keep freshness validation intact while making test clocks independent of changing snapshots; repair puzzle stability and accessible game inspection; investigate playback from a fresh browser; make independently refreshed player coverage explicit and consistent. Use the existing Git/CI/Vercel release path and preserve unrelated unmerged work.

- [x] Repair `scripts/football-refresh-coordinator.test.mjs` fixture clocks; 416 data tests pass. Restore archive/player/trade publication after merging through the existing workflow.
- [x] Repair `src/app/api/puzzle/route.ts`, `src/lib/puzzle.ts`, `src/lib/load-puzzle.ts` and puzzle UI/tests for invalid input, stable daily selection, progress synchronization and equivalent chart clues.
- [x] Repair `src/components/QbCarousel.tsx` and its styles/tests with keyboard-operable game detail and semantic alternatives.
- [x] Repair player history coverage in `src/app/players/[id]/page.tsx` and relevant loader/helper/tests so snapshot charts never silently contradict separately refreshed totals.
- [x] Remove the stalled extra player-chunk load, prefer Jets home headlines and publish independent Next Gen seasons while preserving historical source-gap notices and dates.
- [ ] Run data, lint, production build, performance, browser and accessibility gates. Complete independent three-pass review and task lifecycle secret/history scans, commit and push.
- [ ] Merge through a reviewed PR, deploy the exact revision, refresh data and verify production reader paths plus public health and API error handling. Record real-game timing as unexercised if no game is underway.

Done means the intended source is live at the public domain, the audit reproductions are resolved or explicitly evidenced as external limitations, and all required release checks pass. No post is drafted or published in this task.
