# Wilson Film Room handoff

The implementation, runtime assets, source provenance and regression tests are saved on `codex/wilson-3d-replay`, reviewed through [PR 49](https://github.com/Vartabg/ajetsfan/pull/49). The skinned-player/motion revision is `6067987`; cleanup integrates `origin/master` at `3d8c93f` through merge `f2aa9df`. The replay source and runtime art are unchanged by that integration.

## Local directories

| Contents | Location |
| --- | --- |
| Canonical task branch, checkout attached to this chat and preview workspace | `/Users/vartny/.codex/worktrees/cee1/ajetsfan` |
| Earlier isolated build workspace, now a clean checkout of the repository base | `/Users/vartny/.codex/worktrees/wilson-3d-replay/ajetsfan` |
| Tracked runtime assets and CC0 license | `public/film-room/art/` |
| Evidence, motion, implementation and verification notes | [wilson-3d-replay.md](wilson-3d-replay.md) |
| Asset origins, selected derivatives, licenses and hashes | [wilson-art-assets.md](wilson-art-assets.md) |
| Full playback, startup, native review and rejected-baseline proof | `/Users/vartny/.codex/visualizations/2026/10/20/01a15a57-eeff-7850-a7ed-365d695547a4/wilson-football/` |
| Durable original acquisitions, packaging scripts and CPU audits | The same artifact directory's `source-assets/` folder |

`source-assets/README.md`, `inventory.json` and `SHA256SUMS` index the preserved source material. All 174 copied files, totaling 396,850,151 bytes, were verified against their originals by size and SHA-256. The inventory hash is `beb867554b09c4349fab576ff06e3f25394e91a50af01a2b6766eb5a280cac3b`. The unused optional HDRI has its own `unused/` folder. These original archives and review media stay outside the application payload and Git; the compact runtime derivatives and license are tracked.

The earlier `/tmp/ajetsfan-quaternius-assets/` and `/tmp/wilson-grass005-assets/` paths in acquisition notes describe the original working locations. Their durable copies above preserve the complete sources and reproduction scripts after temporary storage is cleared.

The named replay branch is checked out in the canonical directory above. The earlier build workspace keeps a clean base checkout, so two worktrees do not claim the same task changes. Previous proof records retain their original build paths and IDs.

## Working with the replay

```sh
npm ci
npm run test:data
npm run lint
npm run build
preview run --cwd "$PWD" --port 3118 -- npm run start -- --hostname 127.0.0.1 --port 3118
```

With that managed local preview running, the replay is at `http://127.0.0.1:3118/film-room/replay/wilson-cleveland`.

```sh
PORT=3118 npx playwright test tests/wilson-replay.spec.ts --workers=1
PERFORMANCE_BASE_URL=http://127.0.0.1:3118 npm run test:performance
```

Generated `node_modules/`, `.next/`, `test-results/`, `next-env.d.ts` and TypeScript build caches follow the repository's ignore rules. Git cleanliness is checked on tracked and untracked task source; dependency/build caches remain available for local use.

## Integration checks

The cleanup uses Next 16.4.2 from the current repository base. All 466 data tests, ESLint, TypeScript and the production build pass. Integration build `XoPTBE_klFM-qTyLFkOCV` passes the replay browser and current 20-route budget checks; its logs and strict native-body metrics are preserved in the artifact directory's `cleanup-XoPTBE_klFM-qTyLFkOCV/` folder. The original bounded motion/startup recordings remain associated with their explicitly named `Gnih_O_b0-aHSWhs9jXYn` build.

Two cleanup fixes preserve the existing requirements: source citations have a minimum 24px target after the site's font update; and the controlled-clock test freezes beyond its wall-time budget before playback, preventing a delayed CI roundtrip from overtaking a one-second timestamp. A 1.3-second injected-delay reproduction makes the old setup fail and the corrected setup pass with the same quarter-speed/reverse assertions. CI runs browser tests with one worker to prevent shared rendering contention; the local default and all motion/elapsed-time limits remain unchanged. The delayed-clock reproduction, previous CI logs and fresh local browser reports are preserved beside the integration checks. Fresh GitHub verification runs after the branch push.

The release follow-up integrates `origin/master` at `c7b1464`. Ubuntu verification exposed an additional software-rendering bottleneck: HTML transport, lesson and reduced-motion assertions were also paying for repeated full WebGL frames. Those cases now exercise the supported HTML fallback, with real 3D Play/Pause progression checked explicitly in the rendered-scene case. The full continuity grid still reads every actual imported-bone sample after UI seeks, using the same geometric limits. Representative poses and each batch's final pose also wait for a submitted WebGL frame. Intermediate dense samples validate applied bone transforms rather than rasterizing hundreds of redundant shadow passes. Failed CI browser traces are retained for seven days.

The inherited development-only glob-parser advisory is already tracked in [TECH_DEBT.md](TECH_DEBT.md). Its captured install audit is included with the cleanup logs; no breaking dependency downgrade was applied.
