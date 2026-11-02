# Monday Night Miracle journey

Revision 2. Source baseline: e6f851d (origin/master at task start).

## Brief and decisions

For a Jets fan who enjoys revisiting a game: turn curiosity about Miami in 2000 into an explorable sequence, then a meaningful comparison with Cleveland in 2022. The fan chooses a recorded moment, runs Elliott's illustrated play, compares the comeback paths, and can save their place or share it.

Accepted: the existing focused Jets publication, checked evidence, and the user's November 1 approval of the proposed first journey (homepage invitation → Monday Night Miracle → Film Room → Cleveland comparison → save/share). Existing green/light/dark palette and Lexend typography remain. The score progression and football diagrams provide the imagery; no new decorative assets are needed.

Not decided: accounts, public memories, community moderation, all-site favorites, more journeys, paid services. Those are outside this change. No rejected direction is being reopened. Engagement improvements are hypotheses, not measured outcomes.

## Smallest proof and implementation

- Add a dedicated `/stories/monday-night-miracle` route with three ordinary URL-addressable steps: `step=story`, `step=film`, `step=compare`. An HTML step navigation and explicit next action join them. Invalid steps fall back to story. Keep only the selected interactive stage mounted. Render title, source, step links and next action without JavaScript.
- Story: load the checked Miami fixture via publishedGames/buildVisualStory and reuse VisualGameStory with that one story. Its existing `story`/`moment` URL state remains valid. Do not alter the shared player contract.
- Film: reuse FocusPlay with the existing Elliott JetsPlay and study design. Keep its illustration disclaimer and offer the exact `/film-room#play-elliott-miami` destination for deeper tools. Never call the diagram actual replay footage.
- Compare: use the two checked story sequences, show their confirmed finals and different comeback situations, and reuse DeepCutPaths with one accessible 0–100% progress input. Both paths use the same probability scale and normalized recorded-play order, explicitly not elapsed time or equivalent situations. URL `progress` is finite/clamped. Link to each complete game and its source. Missing one sequence withholds the interactive pair and gives honest recovery links.
- Homepage: a prominent first moment for this journey (one headline, the sourced 30–7 after three quarters → 40–37 OT result, one main action and today's puzzle link). The existing last-result heading becomes h2; the journey supplies the page h1. All current coverage remains. Add a journey entry to `/stories` and the sitemap so the saved destination can be found again.
- Save controls: a tiny client island stores one versioned record under a journey-specific localStorage key, only after the reader explicitly saves. Save the validated step and bounded moment/progress; subsequent explicit navigation/selection updates this place while saved. A homepage control resumes that record. Nothing personal or saved is sent to telemetry. Validate types, version and allowlisted steps; never store/restore arbitrary URLs. Corrupt/unknown records are ignored. Failed storage operations show an honest status and leave navigation working. Removal must not claim success on write failure. Synchronize same-page and cross-tab changes.
- Share controls: copy the canonical journey path and validated selected state, excluding unrelated query parameters. Clipboard rejection provides a selectable readonly URL. Sharing requires an explicit click. No automatic external posting.

## Files and boundaries

New route and share image, JourneyHome, JourneyActions, JourneyComparison, journey data/state helpers and a CSS module. Small integration edits in FocusHome, stories/page and sitemap. No media/data refresh, authentication, database, shared-player rewrites or changes to global focus styling. Source instructions: AGENTS.md, docs/product-vision.md, docs/navigation.md; read the installed Next server/client and route docs before code.

Review clarifications: register the home invitation first in FocusShell's entries and keep every later home heading at h2, including the live/next-game fallback. Render each journey stage as one registered moment (FocusPlay already owns its moment). The comparison explicitly starts Miami at its published second-half low and Cleveland at the final 1:55; do not invent the score at Miami's model low. DeepCutPaths labels include “comeback sequence.” Resume reads use useSyncExternalStore with a null server snapshot. Missing/invalid step consistently means story. Existing VisualGameStory writeSelection preserves other parameters; its own legacy Copy this moment behavior remains unchanged, while the new journey share control uses an allowlisted URL. Register the nested route classifier, metadata checks and measured route budget.

## Acceptance

1. Follow the homepage invitation through all three steps, next/back, browser Back, and direct query links. Miami is the selected story even though the global story list begins with Cleveland.
2. Existing story scrubbing and Elliott animation work; comparison controls update both paths coherently and retain their URL selection.
3. Save a later moment, return home, resume and reload. Remove it. Try corrupt storage and storage/clipboard denial without crashes or false success.
4. Essential story context, sources and navigation work with JS off; missing story data has a useful explanation and recovery links.
5. Inspect actual rendered desktop and 390/320px mobile views, light/dark, keyboard focus and reduced motion; no horizontal page overflow. Automated accessibility on the new route.
6. Run lint, build, data tests, performance budget and relevant browser regressions plus the new journey tests. Review the final diff independently, then agent-task finish through commit/secret-scan/push gates. No automatic merge/deploy.

The desktop app created the isolated linked worktree at its required managed location; it is on `codex/miracle-journey`. This replaces the start command's worktree-creation operation; finish uses the normal task-lifecycle gates.
