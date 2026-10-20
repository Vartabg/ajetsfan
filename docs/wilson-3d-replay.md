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

The complete all-22 diagram is rendered in the initial HTML. Its timeline and player lessons become interactive on hydration while the 3D renderer starts automatically in a separate route-specific chunk. Time, selection, camera, follow mode and layers are seeded before the first visible 3D frame; navigating away during import avoids constructing a discarded scene. There is no Load 3D gate or blocking overlay; a graphics failure leaves the diagram usable. Three.js and camera controls are static dependencies of that deferred module so they can load together, instead of waiting for a second import waterfall. Playback remains an explicit action, including with reduced motion enabled. The field and player figures use original procedural geometry; two optional CC0 turf maps refine its surface without redistributing game/video assets. Repeated static field geometry and articulated player parts use instanced rendering. A hand-to-ball constraint keeps the authored release and catch connected to the figures; that visual continuity does not establish historical body mechanics. The renderer owns and cleans up its graphics resources; the React shell owns the controls and evidence. No production deployment is part of this change.

## Learning every position

`src/lib/wilson-teaching.mjs` supplies a bounded teaching catalog for the same canonical play: 11 offensive and 11 defensive roles, a position name and code, a job in the authored scene, source-supported actions where available, and a separate assessment boundary. The roster and native player selector both reach every role. Position labels use team colors; the selected player receives a yellow label and ground ring. On narrow screens, a direct lesson link reaches the selected player’s explanation.

The selected-player panel leads with a concise football lesson, the selected role’s current authored action, and a short reported concept where one is supported. Expanded **Evidence for this player** retains the full teaching explanation, original qualifications and attributed reported account. **Assessment evidence** retains the detailed limits on performance judgments. Source-frame and timing details likewise remain available without overwhelming the main lesson.

Only Flacco and Wilson are identified at named 3D figures. The later exact-play participation/weekly-roster join identifies all 22 on-field players separately. It does not map the other 20 names to reconstructed coordinates or establish individual assignments. The recorded completion and touchdown do not grade technique or execution. PFF's published coverage-unit criticism is attributed separately and is not projected onto three chosen players. Scrubbing an authored defender does not produce a performance grade.

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

## Football motion and tactical study revision

The current revision compares the official clip again through the first steps, contact, pocket, delivery and finish. Procedural players now have a separate pelvis, torso and head, lower staggered contact bases, shoulder/pelvis counterrotation, distinct hand strikes/retraction, speed-dependent running recovery and continuous eye targets. All 22 accelerate from a stance; Wilson gathers into the break and accelerates out; defenders open their hips and brake at different times. This is authored procedural motion, not motion capture or recovered mechanics.

Wilson now starts outside, with the complementary receiver inside/off the line and seven offensive players on the line. [Michael Renner's PFF recap](https://www.pff.com/news/nfl-week-2-game-recap-new-york-jets-31-cleveland-browns-30) attributes both Wilson touchdowns to outside alignments. The chosen lateral coordinate and side remain inferred. The authored catch is near the one-yard line, consistent with PBP's 14 air yards and one YAC; it is not acquired tracking. An anonymous eligible role now settles underneath through delivery without being identified as Conklin.

`src/lib/wilson-analysis.mjs` is a small immutable exact-play derivative. PBP, participation and FTN each match one row at `2022_02_NYJ_CLE:4199`. Their participant IDs join uniquely to 2022 Week 2 REG rosters for NYJ/CLE. All four local objects were independently SHA-256 checked before extraction. Source hashes, raw fields and the corpus edition remain inspectable in the UI; no bulk corpus or DuckDB query enters page serving.

| Source object | SHA-256 | Exact-play content |
| --- | --- | --- |
| PBP 2022 | `931121d8897779d7944e2a293e92ed8799c8e5cceef84096ac42339003fedc09` | 14 air yards, 1 YAC; EPA `3.933165545167867`; Jets WP `0.26075977087020874` to `0.572494227650942`; WPA `0.3117344567807333`; nflfastR CP `0.4148028492927551`; CPOE `58.51971507072449` percentage points. |
| Participation 2022 | `5f8d349316bf68de487ee0eb926706e65f5a8e37078c1faa37cb07cda2bf9e5e` | Shotgun, 11 personnel vs 4 DL/2 LB/5 DB, four rushers, `POST`, zone/`COVER_6`, `time_to_throw=2.036`, pressure false, all 22 participant IDs. |
| FTN 2022 | `2846ef9bcc5f7298a5c783fb9a5edc85b3820c0b4943bf60a1217398e412985b` | Four rushers, zero blitzers, no motion/play action/RPO, in pocket, catchable/uncontested. Raw `read_thrown=1` has unconfirmed historical encoding. |
| Weekly roster 2022 | `063c0da93f612811e1c4a4c12727a56fd2716197864795f15aa2f10a591b00c0` | Unique exact-week GSIS join for 22 names, jersey numbers and listed positions; no coordinate/assignment mapping. |

2022 participation is NFL NextGenStats via nflverse; separate charting is FTN Data via nflverse. These derivatives retain CC BY-SA 4.0 attribution. The [participation loader's provider note](https://raw.githubusercontent.com/nflverse/nflreadr/main/R/load_participation.R) and dictionaries distinguish providers. CP/CPOE are nflfastR estimates, not NGS completion probability or separation. EPA/WPA describe the play's modelled value and do not allocate individual credit. The touchdown ties 30–30; the extra point is separate.

The central lesson is [Rivka Boord's attributed film interpretation](https://jetsxfactor.com/2022/09/21/zach-wilson-weeks-1-2-jets/): Conklin's stop occupies Owusu-Koramoah underneath long enough for Wilson to enter behind him, with a decisive throw through that corridor. The concept board isolates this interaction. Flacco's firsthand accounts add intended-window context without measuring his eyes. [Haley English's PFF analysis](https://www.pff.com/news/week-2-coverage-update) gives negative coverage assessments to three unnamed defenders, without names or numeric grades. Ward criticism from Davis's earlier touchdown and preceding second-down pressure are not transferred here.

Jets reporting calls the route a slant; participation and Boord call it a post. Main navigation therefore uses an inward-break description. FTN's historical 2022 read encoding remains unconfirmed, so no ordinal progression is taught from raw `1`. Cover 6 is a provider charting family, not proof of Cleveland's side, variation, matching rules or each reconstructed defender's job. The concept board is a window interaction rather than an invented symmetric coverage map.

Selected-role cards lead with a football key/read and conditional technique, with an assignment hypothesis, observable test and alternative available in a disclosure. Their 22 roles/four authored phases do not imply 22 verified assignments. Role basics are folded away. The semantic study, participant table, metrics and provenance remain readable without JavaScript. Longer static sections update only at phase changes rather than every animation tick.

Local artifacts under `wilson-football/` include the independent raw-row audit, protection comparison, study screenshot and substantive review note. The older tactical-search ledger predates the joined charting; its earlier missing-data findings are superseded by this consolidated evidence package. A later bounded review of the publicly playable Jets X-Factor winning-play embed adds a wider elevated sideline view: https://player.vimeo.com/video/752328113?dnt=1&app_id=122963 . Setup, first steps, developing pocket and finish were inspected directly. Separate source locators around 2.48, 5.29 and 6.22–6.73 seconds show a deeper outside route and a receiver staying underneath with a defender between their depths. This supports the spatial relationship in the attributed analysis; no three-player jersey identification or measured coordinate map is claimed. The clip stays at its publisher, with a link beside the concept board. Current production verification and fresh recordings follow after the build is frozen.

### Larger replay stage

The replay route now uses the full page width with a slim navigation bar. The former 272-pixel navigation rail and 300-pixel lesson column no longer subtract from the field. A compact title/score strip, shorter visible timeline bookmarks and transport labels, and one row of layer switches surround a viewport-height viewer. Full descriptive accessible labels remain unchanged. Camera/focus controls follow immediately below; the 22-position browser starts collapsed, with the selected lesson and longer study below the stage. The route disables section snapping so the sticky navigation cannot cover its title.

Actual WebGL layout checks at 610×760 and 1440×1050 require the field to occupy at least half the viewport height and start within its first 170 pixels. They also verify horizontal reflow and reachable playback, timeline and focus controls. These are desktop viewport checks, not physical-device claims.

### Free visual revision

The user selected free assets only. The incorporated third-party assets are ambientCG Grass 005 base color and OpenGL normal maps: 429,254 bytes combined. They load after the first configured 3D frame, retain the working field during a held or failed request, and preserve the current clock and selection when they arrive. Original source/derivative hashes, CC0 terms, resolution and conversion details are in [wilson-art-assets.md](wilson-art-assets.md). The optional Poly Haven HDRI and the Quaternius body/animation candidates are not incorporated.

The current players remain stylized procedural artwork. Tapered fitted jerseys, covered upper-arm sleeves, integrated pants, shaped cleats, open-face helmet shells, facemasks/chinstraps and original uniform striping replace the segmented round appearance. Only the recorded Flacco/Wilson figures carry numbers/names. A winding error that hid descending sleeve/limb surfaces was corrected. The changes retain the same joint pivots, limb lengths, sampled poses and hand/ball constraints. They do not establish photoreal anatomy or motion-captured mechanics.

The original stadium now contains a rounded seating bowl, 13,058 seats, 11,522 deterministic spectators, aisle breaks, concourses, railings and fascia. The background adds six draws and 274,762 triangles; crowd and seats do not cast shadows. It is Cleveland-inspired artwork, not recovered stadium architecture. Original generated daylight/sky reflections, restrained fill and a directional shadow provide material separation without an HDRI download or post-processing stack. Owned environment render targets, sky textures and stadium instances are disposed with the scene.

The default elevated diagonal sideline view focuses on the formation and goal line. A dense mathematical projection check of every player's foot/head positions across the full six-second model retains them inside the view at canvas aspects 0.65, 1.36, 1.96 and 3.15. Follow/zoom remains the close technique view; **Show everyone** restores the overhead overview.

### Current visual-build measurement conditions

The final production visual build is `gNYINQKh4Rr-0FLnrTZVF`. Helmet materials use standard PBR shading and fabric retains its color weave without bump sampling. This bounded simplification keeps the new geometry, equipment, uniform artwork, lighting and stadium. The earlier clearcoat/fabric-bump experiment remains outside Git in `wilson-football/art-before-shader-simplification/`; its cold first-frame observations ranged from 1.869 to 4.094 seconds during substantial unrelated host activity. Those observations are retained rather than discarded, and do not isolate a shader effect.

Final browser verification, route budgets, startup sampling and video recording run sequentially against the frozen production build. The controlled elapsed-time test explicitly pauses Playwright's clock after loading, so browser click/actionability time cannot add unintended playback time to `runFor()`. Its original quarter-speed and reverse-playback assertions remain unchanged. The earlier naturally advancing test-clock failure and trace are retained in the local review artifacts.

All 19 final production browser cases pass in 81.0 seconds, with no retries, unexpected failures, flaky cases or skipped cases. This includes delayed/failed turf maps, the enlarged field, camera movement/follow, source/evidence content, native keyboard transport, actual WebGL recovery and light/dark accessibility checks. The final dense rendered-rig observations contain 2,874 planted references, all at the authored 0.07-yard reference height, and 10,560 body-joint intervals with a maximum 0.395111 radians per 50 ms against the unchanged 0.45 limit. The quarterback's 150 ten-millisecond intervals peak at 0.032688 yards foot travel and 0.144325 radians limb travel. Deterministic seek restoration and hand/ball contact pass. These are mechanical bounds, not measurements of the real athletes.

Startup measurements use installed Chrome 155.0.8059.85, macOS 27.0.1 (26A434), Apple M2 Max / ANGLE Metal and Node 22.23.2 at 1440×1050, DPR 1, reduced motion enabled, with no CPU/network throttling. Power state is unknown. Cold means a fresh browser-context HTTP cache; server, OS and GPU caches are warm, and browser launch is excluded. The first submitted 3D frame is not GPU completion and may precede the optional turf-map arrival. The local samples do not establish public-host or physical-device speed.

Two final cold-context/warm-reload pairs produced these ranges, in milliseconds from navigation start. No browser tests or video captures ran alongside the sample.

| Milestone | Cold browser context | Warm reload |
| --- | ---: | ---: |
| Navigation TTFB | 117–180 | 31–34 |
| First contentful paint | 360–364 | 100–116 |
| First submitted 3D frame | 943–1,061 | 389–440 |
| Scene ready state | 961–1,100 | 409–460 |
| First successful playback-control probe | 1,152–1,226 | 572–636 |
| Actual click-to-UI response | 7–79 | 5–10 |

Control-probe time includes Playwright actionability/scroll waiting. The richer artwork adds work relative to the earlier minimal stadium, and the samples occurred under variable host conditions; these are current delivered-view observations rather than an isolated optimization claim. All 18 existing route budgets also pass, including `/film-room` at 21.3/24 KiB HTML and 218.0/220 KiB initial JavaScript gzip.

Four final recordings preserve the complete six-second teaching snap: overview, close protection, coverage reaction and Wilson's finish. Each records 362 animation-frame observations over approximately 6.033 seconds, with 95th-percentile browser frame intervals of 16.7–16.8 ms and none above 50 ms. Submitted-render intervals peak at 33.4 ms. These counters do not measure GPU completion. The inferred-position banner and teaching clock remain visible throughout. Videos, metadata, final screenshots, the 19-case browser report, strict rig metrics, startup raw observations and route-budget output remain outside Git in `/Users/vartny/.codex/visualizations/2026/10/20/01a15a57-eeff-7850-a7ed-365d695547a4/wilson-football/`. Earlier baseline and pre-simplification observations are separated into named subfolders.

Project validation also passes all 430 data tests, 32 focused replay/teaching/analysis tests, ESLint, TypeScript and the production build. The final lifecycle gate repeats the focused tests, lint and TypeScript before committing and pushing the isolated task branch.

## Verification

The project checks used for this change are:

```sh
npm run test:data
node --test scripts/wilson-replay.test.mjs scripts/wilson-teaching.test.mjs
node --test scripts/wilson-analysis.test.mjs
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

### Earlier all-22 revision and startup baseline

The prior studio pass was rejected because many supporting players reached the end of a short linear path and froze, while the remaining figures shared generic oscillating limbs. The revised model treats the whole snap as one coordinated teaching sequence. Protection pairs retreat, engage, recover and release; rushers use different edge/interior paths; receivers release and continue their concepts; underneath defenders and defensive backs transition from depth/coverage to pursuit. The quarterback drops, sets, throws and recovers; Wilson plants, breaks, reaches, secures and runs through the finish. One anonymous defender’s authored dive and recovery follow the observed qualitative sequence without assigning blame or claiming an established identity.

Position, facing, limb pose, contact, foot cadence and the ball all sample the same absolute time. Engaged players face their opponent while giving ground, rather than turning their backs because they are moving backward. A purposeful set or hold can retain planted feet and weight activity; the model does not add arbitrary translation merely to satisfy a movement count. Rewind and direct seeking must reproduce the same poses. The teaching duration is extended to include pursuit and controlled deceleration instead of freezing the supporting cast at the catch.

The additional source review supports qualitative phase ordering only: visible units start together, the pocket changes shape through contact, the upper-screen edge engagement is deeper than the interior, eligibles and defenders react differently, the receiver continues upright into the end zone, and the trailing defender progresses from outstretched to prone. The broadcast pans away from the pocket and crops players. It supplies no complete all-22 paths, joint angles, play-call assignment map or synchronized 3D tracking.

The earlier all-22 revision was rebuilt as `JFpLweH9vwGrR-WXk9aC3`. The independent mechanical review and comparable startup sample below were collected on `2VPswUknMBRaYgcg8P__I` before the reverted experiment. Actual browser resource timing from the final build loads the same 12 content-hashed JavaScript chunk URLs as that measured build, with no added or removed script URLs, including the deferred 3D module. This supports runtime bundle equivalence; startup was not profiled again on the final build. All 420 data tests, the 22 focused replay/teaching tests, ESLint, TypeScript and the production build passed. The build retains the repository's existing unrelated dynamic-filesystem tracing warning in `scripts/league-history.mjs`.

All 17 production browser cases were validated on the delivered build: 16 passed in the full invocation, and the dense motion case passed a clean targeted rerun in 31.4 seconds. That case originally exceeded its 30-second deadline on the busy machine without a numeric motion assertion failing. Its deadline is now 60 seconds and its observations are aggregated to avoid thousands of trace events; the 151 quarterback times, 121 all-player times, 2,724 planted observations and strict motion tolerances are unchanged. All 18 existing route budgets passed, including the Film Room landing page at 21.2/24 KiB HTML and 218.0/220 KiB initial JavaScript gzip.

Independent mechanical review sampled all 22 rendered rigs at 601 teaching times, in 10 ms increments. The former 1.14-yard coverage-transition foot jump and 0.47-yard quarterback plant reset are removed. The largest sampled foot travel over 10 ms was 0.150 yards during a continuous receiver swing. Only two planted reference points differed by more than 0.015 yards from their authored ground height; the largest discrepancy was approximately 2.2 cm. Seven arbitrary seek-order comparisons reproduced the same actual rig diagnostics. A second browser regression samples 2,724 planted reference points and 150 quarterback intervals, plus the specifically failing handoffs. These checks establish bounded scene mechanics and determinism, not documentary accuracy or athlete-technique validation.

Actual running playback was inspected at normal and half speed in Sideline and close protection views, including pocket retreat/contact, distinct route/coverage reactions, catch/carry, dive/recovery and continued post-catch motion. Full-cycle recordings below preserve the inferred banner and teaching clock. Still screenshots and nonzero path-distance tests are not used alone as evidence of motion quality.

Recordings from that earlier build live outside Git under the task's visualization artifact directory, in `wilson-final/`: `wilson-full-snap.webm`, `wilson-protection.webm`, `wilson-finish.webm`, plus MP4 viewing copies and frame-review sequences. Each records the complete six-second snap with a short setup prefix and finish hold. The 1440×1050 desktop capture uses a 1440×779 canvas at DPR 1. Each playback sampled 362 animation frames, with 95th-percentile browser frame intervals of approximately 16.7–16.8 ms and none above 50 ms. Browser frame callbacks and submitted frames do not measure GPU completion or establish performance on other devices. Metadata, the dense rig report, browser results, route budgets and the loaded-script comparison are saved alongside the recordings.

Reproduce the current four local captures with the existing managed production preview:

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
