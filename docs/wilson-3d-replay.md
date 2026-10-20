# Wilson at Cleveland: evidence and 3D replay

The dedicated study at `/film-room/replay/wilson-cleveland` explains Garrett Wilson’s winning touchdown on September 18, 2022. Fans can move around the field, focus on a player, pause, slow the replay, scrub in either direction and return to the snap. The movement is an educational reconstruction anchored to collected evidence and a later bounded review of official footage. Its coordinates, body motion and teaching clock remain authored; it is not recovered player tracking or a synchronized reproduction of the video.

## What the labels mean

| Label | Supported content | Limits |
| --- | --- | --- |
| **Recorded** | Canonical play `2022_02_NYJ_CLE:4199`; third-and-10 at the Cleveland 15, fourth quarter, :25 before the play; Flacco’s shotgun pass short middle to Wilson for a 15-yard touchdown. The gamebook records :22 after the score; the extra point produced the 31–30 final. An inspected Jets photograph supports Wilson’s #17, green helmet, white jersey and white pants. | The game clock does not measure the animation’s subsecond events. The touchdown tied the score before the extra point. A still establishes appearance in that frame, not movement or the other players’ identities. |
| **Observed** | Four paused frames from the official Jets highlight show the pre-snap shotgun alignment, Flacco upright in the pocket, an airborne ball and the finish near the goal line. | The locators identify inspected source frames, not model offsets. The exact catch instant, complete routes, individual assignments and measured trajectories are not established. |
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
* Later footage review: the official Jets YouTube video [New York Jets Top Plays vs. Cleveland Browns | 2022 Regular Season Week 2](https://www.youtube.com/watch?v=LR1zPFNjOMM), inspected at the four bounded locators below. This review occurred after the collected corpus edition and is not covered by its immutable hash.

The collected corpus uniquely matched the article’s described event to the persisted PBP row. That exact-play join establishes event identity. The separate bounded review inspected four paused frames from the official highlight; no captions or transcript were acquired. Baldinger and Quincy Enunwa landing pages remain useful further-viewing links, with their video inspection pending. Their titles and descriptions do not supply timed route or assignment claims in this replay. The [official winning-drive replay](https://www.newyorkjets.com/video/highlights-every-jets-play-during-the-game-winning-drive-vs-the-browns) stays at its publisher.

The observed-frame ledger is deliberately narrow:

| Source locator | Visible evidence | Remaining limits |
| --- | --- | --- |
| [4:11 / 251 seconds](https://www.youtube.com/watch?v=LR1zPFNjOMM&t=251s) | Shotgun before the snap; receivers on both sides. Score graphic reads NYJ 24, CLE 30, Q4 :25, third-and-10. | A paused broadcast view does not establish every eligible player, exact spacing or the complete play call. |
| [4:13 / 253 seconds](https://www.youtube.com/watch?v=LR1zPFNjOMM&t=253s) | Flacco #19 is upright in the pocket behind line engagements. | No individual protection or blocking assignment is asserted. |
| [4:14 / 254 seconds](https://www.youtube.com/watch?v=LR1zPFNjOMM&t=254s) | The ball is airborne; the intended target is not fully in view. | This frame does not verify the ball’s position beyond the line of scrimmage or the exact release/catch instant. |
| [4:15 / 255 seconds](https://www.youtube.com/watch?v=LR1zPFNjOMM&t=255s) | The ball carrier is upright near the goal line with a defender on the turf behind; the score graphic shows :22. | The exact catch instant, defender identity and complete route are not established. |

The player’s integer source locators are provided for review. Local capture filenames include fractional suffixes from acquisition; those are not claimed as frame-accurate timecodes. No reviewed frames, video or transcript are distributed with the application. Related-frame links beside teaching moments provide context and preserve the source clock separately from the authored 0–4.5 second timeline. They do not synchronize the model to the footage or validate its paths, poses, ball trajectory or defensive assignments.

The scene uses a small checked-in evidence package; it does not expose the 597 MB research corpus as a browser payload or import DuckDB into page serving. Existing Film Room case eligibility remains separate from this bounded reconstruction.

## Playback and camera contract

One shared time value drives player positions, ball position, labels and teaching moments. Sampling a time must produce the same scene whether reached by playback, rewind or a direct scrub. Playback starts paused. Choosing a camera or player does not change the play’s evidence or jump its timeline. Slow motion changes playback rate, not the historical game clock.

Camera presets provide keyboard-accessible framing alongside direct field manipulation. One camera controller owns the view; presets and pointer input request changes through that controller. Reduced-motion preferences keep the initial view static. Hiding the document pauses playback. The HTML timeline, source record and teaching notes remain usable after graphics failure.

The renderer is loaded only after an explicit action. The field and player figures are original procedural geometry rather than redistributed game/video assets. Repeated static field geometry and articulated player parts use instanced rendering. A hand-to-ball constraint keeps the authored release and catch connected to the figures; that visual continuity does not establish historical body mechanics. The renderer owns and cleans up its graphics resources; the React shell owns the controls and evidence. No production deployment is part of this change.

## Existing work used

The references were inspected read-only. They informed bounded implementation choices:

* **ATX bro Space Explorer:** its native observation deck and R3F universe are separate pipelines. The useful patterns here are a semantic control shell, one camera owner, explicit graphics lifetime and a useful failure state. The replay does not copy the observation deck’s native WebGPU architecture or scientific rendering workload.
* **Halaverga:** `src/game/CameraRig.tsx` coordinates camera motion and reduced-motion snapping; `src/world/clipSampler.ts` illustrates sampling a deterministic time rather than accumulating irreversible animation state.
* **Garo’s text corpora:** the prior ingestion audit supplies immutable source identities, provenance and bounded delivery as the data pattern. A small replay evidence package is an edition-bound derivative, not a replacement for the canonical source objects.
* **Research Vault:** `domains/04-product-3d-web/guidance/CURRENT_GUIDANCE.md` is the reviewed operating baseline. The trust audit passed for this task. The accessibility/recovery and Space Explorer recipes are provisional implementation references, not device-performance evidence.

## Verification

The project checks used for this change are:

```sh
npm run test:data
npm run lint
npx tsc --noEmit --pretty false
npm run build
```

Run the browser suite against a managed local preview; the repository Playwright configuration reuses an existing server. With the preview on port 3118:

```sh
PORT=3118 npx playwright test tests/wilson-replay.spec.ts --workers=1
PERFORMANCE_BASE_URL=http://127.0.0.1:3118 npm run test:performance
```

The suite covers the unloaded evidence path, all four evidence labels, the official source-context link and its separate clock, JavaScript-disabled source content, playback and keyboard scrubbing, quarter-speed elapsed time and reverse playback under a controlled clock, preset/focus controls, unavailable WebGL, reduced motion, visibility-change pausing, 390 CSS-pixel reflow and serious/critical axe findings. It also renders the real WebGL scene, checks that pointer drag, keyboard camera presets and a keyboard movement button move the camera, verifies rendering stops at rest and invokes the browser’s `WEBGL_lose_context` extension. A separate failure test permits WebGL allocation and then rejects the 2D context needed for labels; it verifies the failed initialization removes its canvas and a clean retry restores one canvas with the sought time preserved. The ordinary unavailable-WebGL test leaves 2D contexts functional and verifies the fallback message does not obscure the teaching diagram.

The twelve focused browser tests passed in 25.8 seconds on October 20, 2026 against the managed Next **production build** on port 3118, build ID `kK9K2An-A1l3EL7nV24aT`, using installed system Chrome 155.0.8059.85 in headless mode, macOS 27.0.1 (26A434), arm64, Node 22.23.2, Next 16.3.7, React 19.2.8 and Three 0.186.1. There were no skips. `WEBGL_lose_context` was available and exercised. The hidden-tab test dispatches a controlled visibility change. Desktop, quarterback and narrow screenshots were visually inspected. Power state is unknown.

The complete data-test run passed all 410 tests, and the existing Film Room browser regression selection passed all 31 tests. The repository’s production performance-budget check passed all 18 existing route budgets; `/film-room` used 21.2/24 KiB HTML and 218.0/220 KiB initial gzip JavaScript. That route budget is separate from the new replay route’s request-body measurement below.

At the authored release (1.7 seconds) and catch (2.4 seconds), the browser test waits for a new rendered frame and compares the actual posed right-hand and ball world positions, requiring less than 0.15 yards separation. The final capture measured 0.00000 yards at both points. This checks internal scene continuity, not documentary accuracy or measured tracking.

An illustrative snapshot of the paused sideline scene, without post-processing:

| Viewport | Canvas drawing buffer | DPR | Last rendered draw calls | Last rendered triangles |
| --- | --- | --- | --- | --- |
| 1440×1050 desktop | 1118×560 | 1 | 82 | 34,606 |
| 390×844 narrow viewport | 356×360 | 1 | 76 | 34,594 |

Chrome reported `ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)`. These are scene counts from one static camera position, not frame-rate or GPU-time benchmarks. The idle scene retained one rendered frame until interaction; the browser test also verified the render counter stayed fixed at rest. The quarterback view at release used 68 draw calls and 34,578 triangles. The narrow loaded scene had no horizontal overflow. The renderer caps DPR at 1.5; this test device used DPR 1. The scene uses PCF shadows and no post-processing.

In a fresh browser context, same-origin JavaScript resource response bodies measured:

| Stage | Encoded body bytes | Decoded body bytes |
| --- | --- | --- |
| Initial route, before requesting 3D | 163,085 | 537,406 |
| Additional four chunks after Load 3D replay | 200,928 | 802,955 |
| Total after loading 3D | 364,013 | 1,340,361 |

These are browser Resource Timing `encodedBodySize`/`decodedBodySize` values for this local production build’s `.js` resources. They exclude HTML, CSS, fonts, response headers and later navigation. Two local Vercel telemetry script attempts returned no body and contributed zero bytes. The separate body sizes show the renderer cost is deferred until requested; they are not a network-speed benchmark or a guarantee about public hosting compression.

A desktop headless run and a narrow viewport do not establish physical-phone performance or VoiceOver usability. Sustained frame-time distributions, GPU timing, battery/thermal behavior and real touch-device testing remain unmeasured. Compare representative phone workloads before making performance claims or increasing scene complexity.
