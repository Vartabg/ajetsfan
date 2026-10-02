# AJetsFan product vision

Accepted direction, October 1, 2026. This document guides future product work. Features in the delivery sequence below are proposals, not a list of shipped capabilities.

## The experience

AJetsFan is an original Jets football publication where a surprising fact opens into an explorable story. Readers can relive a game, investigate a player, trace a transaction, compare evidence and discover something worth sharing.

Advanced models help us research, connect and explain the record. The product earns trust through checked sources, reproducible calculations, purposeful visuals and a distinctive football identity.

## Principles for every pass

- Begin with a football question and a useful first view. Let readers explore further without requiring them to understand a statistical method first.
- Connect the fact to the game, play, player, season and source it describes. A selection should update related views coherently and support a shareable link.
- Keep confirmed results, recorded events, calculated statistics, model estimates, editorial connections and user predictions distinguishable.
- Use direct reporting. Do not imitate personalities or invent fan/player feelings, reactions or dialogue. Attribute historical statements.
- Keep the newspaper and case-file identity, authentic attributed photography and original art direction. Choose each chart, field diagram, animation or graph for the football question it explains.
- Give every rate its denominator, every ranking its scope and every historical record its cutoff. Missing information stays missing.
- Make essential content work as HTML, with keyboard access and usable phone layouts. Motion and heavier experiences respect reduced-motion preferences and have a useful alternative.
- Give fans a reason to return through checked current coverage, curated discoveries and football puzzles derived from real records.

## What transfers from garovartabedian.com

The review examined the public home, Find interface and cross-reference graph, plus current source code. These are observed product and engineering patterns; visitor growth, conversion and performance improvements were not measured in this review.

| Personal-site capability | Football application | Technical approach |
| --- | --- | --- |
| Unified Find with navigation, source-text matches, previews and retained context | Discover a game, player, play or historical account from one entry point | Use stable IDs, a shared catalog, exact matching and typed numerical filters first; isolate retrieval failures and preserve the reader's destination. |
| Guided reading paths with checked destinations | Short journeys through a comeback, a rivalry or one game from final score to play evidence | Generate and validate ordered links to existing pages. Render a useful path on the server. |
| One selected event driving a timeline, controls and evidence detail | A comeback explorer whose selected play synchronizes probability, period/clock, description and recorded score where available | Keep one selection owner, accessible controls and URL state. Provide a readable ordered transcript. |
| Relationship diagrams paired with semantic ledgers | A draft trade tree showing documented assets becoming picks and players | Build a structured transaction dataset; each edge has a date, exchanged assets and a source. Render both diagram and table from the same records. |
| Source notes, separate evidence categories and preserved reading position | Inspect a claim or play without losing the game/story being read | Attach provenance and scope to the underlying record. Restore focus and context when closing an inspector. |
| Generated graph, coverage and AI-readable artifacts | Reproducible discoveries, inspectable football coverage and evidence-linked exports | Compute validated artifacts before publication. Use shared data for the page, index, counts and downloadable evidence. |
| Optional meaning search in a browser worker | Find related play descriptions or accounts using ordinary football language | Load only when requested; support cancellation and recovery. Treat semantic similarity as relevance, not factual support or proof that games are equivalent. |
| Progressively loaded map experiences with fallback views | Later stadium/history geography or tracking-based field experiences | Begin with an accessible diagram/list. Load heavier rendering explicitly when it helps answer the question. |

Public references: [home and guided paths](https://garovartabedian.com/), [cross-reference graph](https://garovartabedian.com/scriptures/graph), [search](https://garovartabedian.com/scriptures/search), [church tree](https://garovartabedian.com/church/tree), [life map](https://garovartabedian.com/jesus/life).

Relevant personal-site source patterns include `ReadingPaths.tsx`, `FindOverlay.tsx`, `find-query.ts`, `ScripturePathTracer.tsx`, `LifeMapExperience.tsx`, `Tree.tsx`, `ReadingSurface.tsx`, `claims.ts`, `semantic.ts` and `build-ai-legibility.ts`.

Important distinctions from the inspection:

- Most reviewed diagrams use SVG/HTML. MapLibre terrain is a separate, heavier WebGL experience. AJetsFan should choose rendering by the task rather than transplant an entire visual stack.
- The meaning-search implementation advertises an initial download of about 47 MB for its model/runtime, plus corpus data. That is an opt-in candidate, not a homepage dependency or a performance target for Jets search.
- The full personal-site `/scriptures/find` Evidence Explorer is restricted to development/loopback. Public model assessments are separately gated by configuration. These are engineering references, not evidence that every AI service is publicly enabled.
- A source identity or content hash establishes provenance/integrity, not the truth of a claim. Editorial checks and correct calculations still matter.

## Delivery sequence

### 1. Comeback explorer and discovery paths

The homepage now includes a visual story explorer for the 2022 Cleveland and 2000 Miami comebacks. It connects recorded play selection to a clock, original description, probability path and source-grounded chapters, with optional chapter playback and shareable moment URLs. The next phase adds cross-game comparison and broader discovery paths.

Give fans a focused way to revisit an improbable win or compare two games. One play selection controls the probability curve, period, available clock and original description. Add meaningful entry points such as the 2000 Miami and 2022 Cleveland wins, with direct links to their cases and tape.

Use the existing archive and curve loaders. Exclude flagged games from rankings. Keep the time sequence within each game; comparisons can align quarters or play progress, but must identify their alignment method. Show pre-play model estimates separately from the confirmed final. Where overtime clock metadata is unreliable, show the period without inventing a clock.

Completion evidence: keyboard and touch scrubbing, coherent selected state, source-visible details, comparison scales, shareable URLs, readable fallbacks and narrow-screen reflow.

### 2. Unified Jets discovery

Connect games, current player profiles, historical accounts and source evidence through one catalog. Exact names, IDs, opponents, dates and supported numerical filters should work without a model. A question such as "Jets wins below 1%" must resolve to a defined threshold over a stated archive sample.

Use AI to interpret supported questions and explain verified results when it adds value. Typed requests go to a calculation/retrieval layer; the interface renders structured results. A language model does not supply the authoritative count, execute arbitrary generated code or invent records when retrieval is empty. Unsupported requests receive a clear scope explanation and useful related entry points.

Completion evidence: exact result sets, explicit sample/cutoff, source links, recoverable errors, stable result URLs and no compulsory large model download.

### 3. Draft trade tree

Begin with a researched case such as the four first-round selections in 2000. Let readers follow each asset through dated transactions into a pick and player. An inspector opens the source for each connection; an equivalent ledger makes the sequence readable independently of the diagram.

This requires a new validated draft/transaction dataset. A headline or semantic match cannot establish a transaction edge. Account for pick ownership changes and package trades explicitly; do not infer a player's value from graph centrality.

Completion evidence: reconciled exchanged assets, stable IDs, sourced edges, visible date order, an equivalent table and clear limits when the researched chain ends.

### 4. Daily football puzzle and current lab

Build puzzles from checked historical records: identify the game, predict the next recorded event or compare a stat before revealing the actual answer. Keep editorial selection and the answer reproducible; do not manufacture difficulty ratings, participation counts or fan sentiment.

Let a current lab expose the same analyzed/pending coverage, denominators, definitions and source times already used by the publication, with useful visual comparisons. Keep it connected to the football stories it helps explain.

## Data and capability boundaries

The existing archive begins in 1999, so numerical archive answers must state that boundary. Earlier history uses separately sourced accounts. Published curves supply probability, period, descriptions and limited clock/type metadata; they do not supply a complete field-position, down/distance or personnel dataset.

A fourth-down decision lab needs additional structured play-by-play fields and an evaluated model. Its comparisons are estimates under stated assumptions. Full player movement, exact routes and separation require suitable permitted tracking data; descriptions and probability curves cannot reconstruct them.

Keep the current Next.js/React/TypeScript publication and validated DuckDB/snapshot pipeline as the foundation. Add workers, structured indexes, graph records and model services as the corresponding experience earns its infrastructure. Queues and a runtime database become candidates when durable generated jobs, shared budgets or persistent research require them.

## How we will assess the result

- Can a first-time visitor reach a worthwhile discovery and then inspect the supporting evidence?
- Do searches resolve to the intended game/player/record, and can readers recover from empty or failed retrieval?
- Do fans use play scrubbing, comparisons and connected case pages, and return to the publication?
- Does the experience remain readable and responsive on phones, with enlarged text and reduced motion?
- Do provenance, sample scope, freshness and model labels survive every new view and shareable URL?

Collect only appropriate aggregate interaction measurements; keep search text, ticket choices and private predictions out of telemetry. Establish baselines before claiming engagement or speed gains. Measure visual workloads on recorded devices and browsers before making frame-rate or optimization claims.

Reviewed rendering guidance: the Research Vault's `04-product-3d-web/guidance/CURRENT_GUIDANCE.md` (reviewed July 30, 2026) supports purposeful rendering, one interaction/camera owner, accessible alternatives, reduced motion and measured performance. It is guidance for implementation, not proof of performance on this site.
