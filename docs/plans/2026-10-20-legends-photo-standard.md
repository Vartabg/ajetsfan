# Legends photography standard

Goal: replace the uneven profile images with a cohesive, carefully reviewed set of AI-enhanced photographs while preserving identity and source access.

## Acceptance

- Every published image fills a 4:5 frame, delivered at 960×1200 as WebP.
- The named person is the clear subject; the face or helmet and meaningful action stay visible with safe margins. No arbitrary face-only thumbnails, obituary graphics or unidentifiable group scenes.
- Photographic contrast, natural texture, restrained Jets green and uncluttered backgrounds remain consistent. Historic monochrome sources remain monochrome unless color is independently established.
- Edits preserve the real subject, uniform, number, age, pose and historical context. No invented honors, busts, trophies, game results or ceremonial appearances.
- AI treatment is disclosed next to each image. The original local photograph and publisher credit remain available.
- Review every image for likeness, anatomy, composition and factual details before including it. Reject any derivative that fails.

## Work

- [x] Audit all 34 people and select positively identified source references.
- [x] Produce and visually review each derivative with the built-in image tool; preserve prompts and source records.
- [x] Update the catalog, shared image frame, alternative text and treatment/source captions.
- [x] Check asset dimensions, source access, failure handling, page weight, keyboard/reflow and representative real browser paths.
- [ ] Complete independent review, lifecycle commit/push, deploy and public user-path checks.

Files: `public/legends/enhanced/*`, `src/lib/legends-data.json`, `src/lib/legends.ts`, `src/components/LegendPortrait.tsx`, `src/components/Legends.module.css`, `tests/legends*.spec.ts`, `docs/legends-sources.md`, and this plan.

## Review and verification

All 34 source/derivative pairs reviewed. No blocking findings; Philbin's raised fingertips retain the source's top-edge crop, and Toon's trailing fingertips approach the frame edge. Faces, helmets and core actions remain clear. Edits reconstruct fine detail and expanded framing; the visible AI label and exact originals preserve that distinction.

Local lint, TypeScript, production build, all page-weight budgets and 11 focused Legends tests passed. Browser review covered directory-to-profile navigation, original/source link names, 320px reflow, 44px credit targets, reduced motion and forced colors. No new interaction pattern was added. Production completion is recorded in the task's release receipt after merge and public verification.
