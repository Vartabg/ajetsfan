# Wilson at Cleveland: evidence and 3D replay

The dedicated study at `/film-room/replay/wilson-cleveland` explains Garrett Wilson’s winning touchdown on September 18, 2022. Fans can choose any of the 22 players, read the position’s teaching job, follow the selected player, move around the field, pause, slow the replay, scrub in either direction and return to the snap. The movement is an educational reconstruction anchored to collected evidence and a later bounded review of official footage. Its coordinates, body motion and teaching clock remain authored; it is not recovered player tracking or a synchronized reproduction of the video.

## What the labels mean

| Label | Supported content | Limits |
| --- | --- | --- |
| **Recorded** | Canonical play `2022_02_NYJ_CLE:4199`; third-and-10 at the Cleveland 15, fourth quarter, :25 before the play; Flacco’s shotgun pass short middle to Wilson for a 15-yard touchdown. The gamebook records :22 after the score; the extra point produced the 31–30 final. An inspected Jets photograph supports Wilson’s #17, green helmet, white jersey and white pants. | The game clock does not measure the animation’s subsecond events. The touchdown tied the score before the extra point. A still establishes appearance in that frame, not movement or the other players’ identities. |
| **Observed** | Paused frames and a frame-by-frame review of the official Jets highlight show coordinated releases, the pocket developing through the throw, an airborne pass, and an outstretched defender falling behind the receiving player through the end-zone finish. | The locators identify inspected source frames, not model offsets. The exact catch instant, complete routes, individual assignments and measured trajectories are not established. |
| **Reported** | Jack Bell’s Jets account calls Wilson’s route a slant. Joe Flacco’s quoted recollection describes looking behind the linebackers against relatively soft safeties for a small throwing window. | These are attributed written accounts. They do not independently identify the defensive call, every player’s assignment or exact positions. |
| **Inferred** | Player starting locations, paths, separation, ball flight, poses and the teaching timeline. Supporting players show one plausible arrangement for explaining the slant and window. | No measured coordinates, All-22 verification, synchronized model/video event offsets or complete blocking/coverage assignments have been acquired for this snap. Camera movement cannot upgrade this evidence. |

Source links and evidence text remain in semantic HTML before loading 3D, when JavaScript is disabled and when graphics initialization fails. Inferred routes can be hidden; the underlying players and ball still use inferred positions. Hiding a visual overlay does not turn the scene into a measured replay.

## Source binding

The original PBP identity is preserved rather than assigned a new scene-only identity:

* nflverse game `2022_02_NYJ_CLE`, play `4199`.
* Joe Flacco GSIS `00-0026158`; Garrett Wilson GSIS `00-0037740`.
* Original description: `(:25) (Shotgun) 19-J.Flacco pass short middle to 17-G.Wilson for 15 yards, TOUCHDOWN.`
* Source: [nflverse’s 2022 Parquet release](https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2022.parquet), SHA-256 `931121d8897779d7944e2a293e92ed8799c8e5cceef84096ac42339003fedc09`, successfully fetched October 20, 2026 at 17:40:02 UTC by the corpus collection.
* Collected corpus edition: `3487ecae1418953352a56fb6c08db56bb1f44a3de171897c60132eae2eb4f8fc`.
* Text claim source: [Jack Bell’s account and Flacco’s explanation](https://www.newyorkjets.com/news/jets-joe-cool-puts-cleveland-in-the-deep-freeze-with-a-stirring-comeback-victory). The collected claim IDs are `wilson-slant` and `flacco-window`; their locators are the opening winning-score account and Flacco’s final answer about the call.
* Existing Film Room gamebook reference: [NFL Jets at Browns gamebook](https://static.www.nfl.com/image/upload/v1677628106/gamecenter/7ae81ee8-d24c-11ec-b23d-d15a91047884.pdf), used by the separately curated case for the before/after clocks and result context.
* Appearance source: [official Jets comeback recap and original lead photograph](https://www.newyorkjets.com/news/jets-shock-browns-with-13-point-comeback-in-last-2-minutes-for-31-30-win). The inspected image supports Wilson’s jersey number and uniform colors. It supplies no route geometry, pose sequence, time offsets, assignments or additional player identities. The original photograph is not bundled into the 3D assets.
* Later footage review: the official Jets YouTube video [New York Jets Top Plays vs. Cleveland Browns | 2022 Regular Season Week 2](https://www.youtube.com/watch?v=LR1zPFNjOMM), initially inspected at the four bounded locators below, followed by a frame-by-frame review of the snap through the finish at approximately 4:12–4:15. This review occurred after the collected corpus edition and is not covered by its immutable hash.

The collected corpus uniquely matched the article’s described event to the persisted PBP row. That exact-play join establishes event identity. The bounded review initially inspected four paused frames, then compared the developing snap, first contact, pocket, throw, reception window and finish through normal public playback and frame advance. No transcript was ingested. Baldinger and Quincy Enunwa landing pages remain useful further-viewing links, with their video inspection pending. Their titles and descriptions do not supply timed route or assignment claims in this replay. The [official winning-drive replay](https://www.newyorkjets.com/video/highlights-every-jets-play-during-the-game-winning-drive-vs-the-browns) stays at its publisher.

The initial observed-frame ledger is deliberately narrow:

| Source locator | Visible evidence | Remaining limits |
| --- | --- | --- |
| [4:11 / 251 seconds](https://www.youtube.com/watch?v=LR1zPFNjOMM&t=251s) | Shotgun before the snap; receivers on both sides. Score graphic reads NYJ 24, CLE 30, Q4 :25, third-and-10. | A paused broadcast view does not establish every eligible player, exact spacing or the complete play call. |
| [4:13 / 253 seconds](https://www.youtube.com/watch?v=LR1zPFNjOMM&t=253s) | Flacco #19 is upright in the pocket behind line engagements. | No individual protection or blocking assignment is asserted. |
| [4:14 / 254 seconds](https://www.youtube.com/watch?v=LR1zPFNjOMM&t=254s) | The ball is airborne; the intended target is not fully in view. | This frame does not verify the ball’s position beyond the line of scrimmage or the exact release/catch instant. |
| [4:15 / 255 seconds](https://www.youtube.com/watch?v=LR1zPFNjOMM&t=255s) | The ball carrier is upright near the goal line with a defender on the turf behind; the score graphic shows :22. | The exact catch instant, defender identity and complete route are not established. |

The player’s integer source locators are provided for review. Local capture filenames include fractional suffixes from acquisition; those are not claimed as frame-accurate timecodes. No reviewed frames, video or transcript are distributed with the application. Related-frame links beside teaching moments provide context and preserve the source clock separately from the authored teaching timeline. They do not synchronize the model to the footage or validate its paths, poses, ball trajectory or defensive assignments.

A bounded tracking-source check preserved a precise acquisition target: prospective Big Data Bowl `gameId=2022091801`, `playId=4199`, corroborated through the PBP's `old_game_id` and play identity. Membership of this snap in the [2025 competition data](https://www.kaggle.com/competitions/nfl-big-data-bowl-2025/data?select=games.csv) remains unknown: official file listing access required authentication and no matching tracking row was inspected. GSIS identifiers above are not tracking `nflId` values. No competition dataset, terms acceptance or redistribution permission is assumed; no third-party mirror was used to fill the gap. Any later authorized acquisition must verify the exact play, 22 player identities plus the ball, and snap-through-touchdown coverage before replacing the authored paths.

The scene uses a small checked-in evidence package; it does not expose the 597 MB research corpus as a browser payload or import DuckDB into page serving. Existing Film Room case eligibility remains separate from this bounded reconstruction.

## Playback and camera contract

One shared time value drives player positions, ball position, labels and teaching moments. Sampling a time must produce the same scene whether reached by playback, rewind or a direct scrub. Playback starts paused. Choosing a camera or player does not change the play’s evidence or jump its timeline. Slow motion changes playback rate, not the historical game clock.

Camera presets provide keyboard-accessible framing alongside direct field manipulation. One camera controller owns the view; presets and pointer input request changes through that controller. Reduced-motion preferences keep the initial view static. Hiding the document pauses playback. The HTML timeline, source record and teaching notes remain usable after graphics failure.

The complete all-22 diagram is rendered in the initial HTML. Its timeline and player lessons become interactive on hydration while the 3D renderer starts automatically in a separate route-specific chunk. Time, selection, camera, follow mode and layers are seeded before the first visible 3D frame; navigating away during import avoids constructing a discarded scene. There is no Load 3D gate or blocking overlay; a graphics failure leaves the diagram usable. Three.js and camera controls are static dependencies of that deferred module so they can load together, instead of waiting for a second import waterfall. Playback remains an explicit action, including with reduced motion enabled. The field and player figures are original procedural geometry rather than redistributed game/video assets. Repeated static field geometry and articulated player parts use instanced rendering. A hand-to-ball constraint keeps the authored release and catch connected to the figures; that visual continuity does not establish historical body mechanics. The renderer owns and cleans up its graphics resources; the React shell owns the controls and evidence. No production deployment is part of this change.

## Learning every position

`src/lib/wilson-teaching.mjs` supplies a bounded teaching catalog for the same canonical play: 11 offensive and 11 defensive roles, a position name and code, a job in the authored scene, source-supported actions where available, and a separate assessment boundary. The roster and native player selector both reach every role. Position labels use team colors; the selected player receives a yellow label and ground ring. On narrow screens, a direct lesson link reaches the selected player’s explanation.

The selected-player panel leads with a concise football lesson, the selected role’s current authored action, and a short reported concept where one is supported. Expanded **Evidence for this player** retains the full teaching explanation, original qualifications and attributed reported account. **Assessment evidence** retains the detailed limits on performance judgments. Source-frame and timing details likewise remain available without overwhelming the main lesson.

Only Flacco and Wilson have established identities here. Their completed pass and touchdown reception can be stated as recorded contributions. Those results do not grade their technique, read order, separation or execution. Each of the other 20 roles has an unknown individual assessment: actual identity, assignment and outcome remain unestablished. Scrubbing a defender’s authored movement through the touchdown does not produce a missed-assignment claim, loss or performance grade.

Three layers work independently:

* **Show inferred routes:** the teaching model’s five eligible receiver/backfield paths and the selected actor’s path when distinct. Solid trail segments show movement so far; dashed segments show authored movement. All 22 figures continue to use the same inferred motion model.
* **Position labels:** screen-space role codes, with names and full position explanations available in semantic HTML. They can be hidden without removing movement, selection or the teaching panel.
* **Teaching responsibilities:** 14 faint authored relationship lines supply context. The selected actor and connected roles receive stronger highlights. Protection, coverage and pass geometry are inferred, including the geometry of the recorded Flacco-to-Wilson connection. They do not identify actual blocking matchups or Cleveland’s call.

**Follow player** frames the selected actor, then keeps the view with that actor while seeking, playing, resizing or changing selection. **Show everyone** exits follow mode and restores the overhead view. The browser tests exercise keyboard activation, a real canvas raycast selection, and a resize across the renderer’s portrait threshold. The HTML roster, teaching jobs and evidence remain available before the renderer is ready and after a graphics failure. **Expand field** uses the browser’s fullscreen view for a larger field and keeps the timeline, slow motion and rewind controls visible; Escape or **Exit expanded field** returns to the studio. The initial view leaves labels and route overlays off so they do not cover the figures. Each layer remains available for analysis.

## Existing work used

The references were inspected read-only. They informed bounded implementation choices:

* **ATX bro Space Explorer:** its native observation deck and R3F universe are separate pipelines. The useful patterns here are a semantic control shell, one camera owner, explicit graphics lifetime and a useful failure state. The replay does not copy the observation deck’s native WebGPU architecture or scientific rendering workload.
* **Halaverga:** `src/game/CameraRig.tsx` coordinates camera motion and reduced-motion snapping; `src/world/clipSampler.ts` illustrates sampling a deterministic time rather than accumulating irreversible animation state.
* **Garo’s text corpora:** the prior ingestion audit supplies immutable source identities, provenance and bounded delivery as the data pattern. A small replay evidence package is an edition-bound derivative, not a replacement for the canonical source objects.
* **Research Vault:** `domains/04-product-3d-web/guidance/CURRENT_GUIDANCE.md` is the reviewed operating baseline. The trust audit passed for this task. The accessibility/recovery and Space Explorer recipes are provisional implementation references, not device-performance evidence.

The interaction references were also read directly: [EA’s gameplay explanation](https://www.ea.com/games/madden-nfl/madden-nfl-26/news/madden-26-gridiron-notes-gameplay-deep-dive) describes coach-camera play art for protection and defensive responsibilities. This replay uses original geometry and teaching data; no Madden assets, mechanics or ratings were imported. [NFL’s Coaches Film overview](https://www.nfl.com/news/nfl-com-to-offer-fans-coaches-film-with-nfl-game-rewind-09000d5d82ac698a) describes elevated framing that keeps all 22 players visible.

## Verification

The project checks used for this change are:

```sh
npm run test:data
node --test scripts/wilson-replay.test.mjs scripts/wilson-teaching.test.mjs
npm run lint
npx tsc --noEmit --pretty false
npm run build
```

Run the browser suite against the managed local production preview; the repository Playwright configuration reuses an existing server. Port 3118 follows the normal idle-cleanup policy; it is a local review view, not a production deployment. With that preview available:

```sh
PORT=3118 npx playwright test tests/wilson-replay.spec.ts --workers=1
PORT=3118 npx playwright test tests/wilson-replay.spec.ts --workers=1 --grep 'source record|all 22|light and dark'
PORT=3118 npx playwright test tests/film-room-data.spec.ts tests/film-workspace.spec.ts tests/film-room-interactions.spec.ts --workers=2
PERFORMANCE_BASE_URL=http://127.0.0.1:3118 npm run test:performance
```

The suite covers the unloaded evidence path, all four evidence labels, the official source-context link and its separate clock, JavaScript-disabled source content, playback and keyboard scrubbing, quarter-speed elapsed time and reverse playback under a controlled clock, preset/focus controls, unavailable WebGL, reduced motion, visibility-change pausing, 390 CSS-pixel reflow and serious/critical axe findings. It also renders the real WebGL scene, checks that pointer drag, keyboard camera presets and a keyboard movement button move the camera, verifies rendering stops at rest and invokes the browser’s `WEBGL_lose_context` extension. A separate failure test permits WebGL allocation and then rejects the 2D context needed for labels; it verifies the failed initialization removes its canvas and a clean retry restores one canvas with the sought time preserved. The ordinary unavailable-WebGL test leaves 2D contexts functional and verifies the fallback message does not obscure the teaching diagram.

### Motion revision after playback review

The prior studio pass was rejected because many supporting players reached the end of a short linear path and froze, while the remaining figures shared generic oscillating limbs. The revised model treats the whole snap as one coordinated teaching sequence. Protection pairs retreat, engage, recover and release; rushers use different edge/interior paths; receivers release and continue their concepts; underneath defenders and defensive backs transition from depth/coverage to pursuit. The quarterback drops, sets, throws and recovers; Wilson plants, breaks, reaches, secures and runs through the finish. One anonymous defender’s authored dive and recovery follow the observed qualitative sequence without assigning blame or claiming an established identity.

Position, facing, limb pose, contact, foot cadence and the ball all sample the same absolute time. Engaged players face their opponent while giving ground, rather than turning their backs because they are moving backward. A purposeful set or hold can retain planted feet and weight activity; the model does not add arbitrary translation merely to satisfy a movement count. Rewind and direct seeking must reproduce the same poses. The teaching duration is extended to include pursuit and controlled deceleration instead of freezing the supporting cast at the catch.

The additional source review supports qualitative phase ordering only: visible units start together, the pocket changes shape through contact, the upper-screen edge engagement is deeper than the interior, eligibles and defenders react differently, the receiver continues upright into the end zone, and the trailing defender progresses from outstretched to prone. The broadcast pans away from the pocket and crops players. It supplies no complete all-22 paths, joint angles, play-call assignment map or synchronized 3D tracking.

The delivered production preview was rebuilt as `JFpLweH9vwGrR-WXk9aC3`. The independent mechanical review and comparable startup sample below were collected on `2VPswUknMBRaYgcg8P__I` before the reverted experiment. Actual browser resource timing from the final build loads the same 12 content-hashed JavaScript chunk URLs as that measured build, with no added or removed script URLs, including the deferred 3D module. This supports runtime bundle equivalence; startup was not profiled again on the final build. All 420 data tests, the 22 focused replay/teaching tests, ESLint, TypeScript and the production build passed. The build retains the repository's existing unrelated dynamic-filesystem tracing warning in `scripts/league-history.mjs`.

All 17 production browser cases were validated on the delivered build: 16 passed in the full invocation, and the dense motion case passed a clean targeted rerun in 31.4 seconds. That case originally exceeded its 30-second deadline on the busy machine without a numeric motion assertion failing. Its deadline is now 60 seconds and its observations are aggregated to avoid thousands of trace events; the 151 quarterback times, 121 all-player times, 2,724 planted observations and strict motion tolerances are unchanged. All 18 existing route budgets passed, including the Film Room landing page at 21.2/24 KiB HTML and 218.0/220 KiB initial JavaScript gzip.

Independent mechanical review sampled all 22 rendered rigs at 601 teaching times, in 10 ms increments. The former 1.14-yard coverage-transition foot jump and 0.47-yard quarterback plant reset are removed. The largest sampled foot travel over 10 ms was 0.150 yards during a continuous receiver swing. Only two planted reference points differed by more than 0.015 yards from their authored ground height; the largest discrepancy was approximately 2.2 cm. Seven arbitrary seek-order comparisons reproduced the same actual rig diagnostics. A second browser regression samples 2,724 planted reference points and 150 quarterback intervals, plus the specifically failing handoffs. These checks establish bounded scene mechanics and determinism, not documentary accuracy or athlete-technique validation.

Actual running playback was inspected at normal and half speed in Sideline and close protection views, including pocket retreat/contact, distinct route/coverage reactions, catch/carry, dive/recovery and continued post-catch motion. Full-cycle recordings below preserve the inferred banner and teaching clock. Still screenshots and nonzero path-distance tests are not used alone as evidence of motion quality.

Fresh recordings from the delivered build live outside Git under the task's visualization artifact directory, in `wilson-final/`: `wilson-full-snap.webm`, `wilson-protection.webm`, `wilson-finish.webm`, plus MP4 viewing copies and frame-review sequences. Each records the complete six-second snap with a short setup prefix and finish hold. The 1440×1050 desktop capture uses a 1440×779 canvas at DPR 1. Each playback sampled 362 animation frames, with 95th-percentile browser frame intervals of approximately 16.7–16.8 ms and none above 50 ms. Browser frame callbacks and submitted frames do not measure GPU completion or establish performance on other devices. Metadata, the dense rig report, browser results, route budgets and the loaded-script comparison are saved alongside the recordings.

Reproduce the three local captures with the existing managed production preview:

```sh
node scripts/capture-wilson-motion.mjs --url http://127.0.0.1:3118/film-room/replay/wilson-cleveland --output /tmp/wilson-motion
```

The reproducible local startup probe is:

```sh
node scripts/profile-wilson-startup.mjs --url http://127.0.0.1:3118/film-room/replay/wilson-cleveland --output /tmp/wilson-startup-profile.json --pairs 2
```

Cold means a fresh browser context HTTP cache; server, OS and GPU caches are warm. Warm means a reload in that same context. The probe records navigation TTFB, first contentful paint, field visibility/paint proxy, a working playback-control response, 3D render submission, resource timings and long tasks. DOM visibility and animation-frame paint proxies do not establish GPU completion. The manual baseline gate is clicked promptly after the same control probe/reset; a human could wait indefinitely longer. No percentage or physical-phone claim follows from these local runs.


### Comparable startup sample

Measured October 20, 2026 with installed system Chrome 155.0.8059.85 in headless mode on macOS 27.0.1 (26A434), Apple M2 Max / ANGLE Metal, Node 22.23.2, viewport 1440×1050, DPR 1, reduced motion enabled, and no CPU or network throttling. Power state is unknown. Both builds used the same managed Next production server command on port 3118. Two fresh-context/warm-reload pairs were collected sequentially per build without browser tests or video recording in parallel. Server/OS/GPU caches were warm in the comparable sample. The baseline is build `ESLldiqBZNTXeIUsLHSYK`; the revision is `2VPswUknMBRaYgcg8P__I`.

Values are ranges of two observations per cache state, in milliseconds from navigation start:

| Milestone | Previous cold browser cache | Revised cold browser cache | Previous warm reload | Revised warm reload |
| --- | ---: | ---: | ---: | ---: |
| Navigation TTFB | 14–35 | 18–19 | 11–13 | 10–16 |
| First contentful paint | 156–168 | 112–116 | 60–64 | 52–68 |
| First submitted 3D frame | 569–711 | 309–311 | 427–430 | 148–168 |
| Scene visible-ready state | 569–711 | 321–323 | 427–430 | 158–179 |
| First successful playback-control probe | 280–348 | 361–375 | 153–162 | 253–280 |

The revised renderer starts automatically; the baseline still requires the scripted Load 3D click after the same control probe/reset. This removes an indefinitely delayed human action and the second serial dependency import. The before/after defaults also differ deliberately: the prior view opens with labels/routes, while the revised view opens unobscured. These are complete delivered-view measurements, not an isolated shader or renderer optimization experiment.

Eager scene initialization has a tradeoff: the first successful playback-control probe was later, because module/graphics work and Playwright's scroll/actionability waits compete before the click. Actual revised click-to-UI response was 24–50 ms. The positive held-chunk test separately proves playback works while deferred code is pending. No claim is made that every responsiveness milestone improved. Revised explicit import-to-module-ready was 36–44 ms cold / 2.9–4.1 ms warm; module-ready-to-scene-ready was 113–126 / 90–103 ms. Those intervals include CPU setup and render submission, not GPU completion.

The first request after restarting the revised server was retained separately: TTFB 148 ms and first submitted 3D frame 552 ms. It is excluded from the warmed-server comparison above. A DOM/two-RAF field-paint proxy is also in the raw reports, but can be delayed by synchronous setup and is not asserted as exact field-paint timing. The field is server-rendered and unobscured from the start; its playability during a held renderer request is tested directly.

The raw reports are review artifacts outside Git: `wilson-startup-baseline.json`, `wilson-startup-after.json` (includes the server-first-request sample), and `wilson-startup-after-warm-server.json`. These local samples do not establish public-host network speed, physical-phone performance, battery/thermal behavior or VoiceOver usability.


A bounded attempt to prepare shaders asynchronously did not establish a readiness improvement and was reverted. Its two raw reports (`wilson-startup-async-warm-server.json` and `wilson-startup-async-repeat.json`) are retained outside Git. They ran during higher background system load and slower server responses, so they do not isolate a shader-preparation effect. The delivered implementation keeps the measured synchronous first configured frame and explicitly retains the control-readiness tradeoff above; it does not claim an unmeasured shader speedup.
