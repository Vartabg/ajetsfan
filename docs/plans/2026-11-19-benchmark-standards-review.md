# Independent EGM Design Review Report — Benchmark Standards

- **Plan reviewed:** `docs/plans/2026-11-19-benchmark-standards.md` (Revision 1, baseline `origin/master` `a430ec0`)
- **Final plan revision:** Revision 2 (2026-11-19)
- **Reviewer:** Fresh-context read-only `research` subagent (`5a6f5551-5cab-4ece-82e3-33cd2363f22c`, independent conversation, no parent transcript or memory retrieval)
- **Completion evidence:** Completed with concrete source citations across 60+ project files, Next.js 16.4.6 docs, Three.js 0.186.1 `GLTFLoader.js`, and `@vercel/analytics` / `@vercel/speed-insights` packages.

## Findings and Dispositions

### Material Blockers (all 4 accepted & resolved in Revision 2)

| ID | Summary | Source evidence | Disposition |
| --- | --- | --- | --- |
| **MB-1** | CSP `connect-src` omitted `blob:`, which breaks Three.js `GLTFLoader` (`ImageBitmapLoader` fetches `blob:` URIs for embedded textures in `quaternius-football-body.glb`) on `/film-room/replay/wilson-cleveland`. | `src/lib/wilson-player-assets.ts:47-52`, `GLTFLoader.js:2654-2662, 3367-3398`, `three.core.js:50468` | **Accepted.** Added `blob:` to `connect-src` in `src/lib/security-headers.mjs`. |
| **MB-2** | Adding `<footer>` to `FocusShell` breaks `tests/deep-cuts.spec.ts:17` (`page.locator("#top, footer")`), which was omitted from Affected files. | `tests/deep-cuts.spec.ts:17`, `src/app/discover/page.tsx:41`, `tests/morgue-focus.spec.ts:33`, `tests/game-focus.spec.ts:37` | **Accepted.** Scoped `tests/deep-cuts.spec.ts:17` to `#top, body > header, body > footer` matching sibling tests and `docs/navigation.md:32`. |
| **MB-3** | Acceptance Check #5's HTTP `/sitemap.xml` assertion fails when `NEXT_PUBLIC_SITE_URL` is unset in local/CI Playwright runs, and local `next start` triggers `/_vercel/*` 404 + `nosniff` MIME console errors from `<Telemetry />`. | `src/app/sitemap.ts:10-12`, `tests/legends-entry.spec.ts:37-39`, `src/components/Telemetry.tsx:8-14` | **Accepted.** Added direct `sitemap()` test with `NEXT_PUBLIC_SITE_URL="https://ajetsfan.com"` alongside conditional HTTP check, and stubbed `**/_vercel/**` in `tests/site-standards.spec.ts` while still failing on any `securitypolicyviolation`, `pageerror`, or unexpected console error. |
| **MB-4** | Desktop `.app` CSS Grid without `grid-template-rows: minmax(0, 1fr) auto` splits excess `100svh` height across both rows on short pages (stretching `.foot`), and inline `<a>` ignores `min-height: 44px`. | `src/components/Focus.module.css:26, 58, 131-144`, `src/app/not-found.tsx:8-13` | **Accepted.** Added `grid-template-rows: minmax(0, 1fr) auto;` on desktop `.app`, `grid-column: 1; grid-row: 1 / span 2;` on `.rail`, and `display: inline-flex; align-items: center; min-height: 44px; min-width: 44px;` on `.foot` links inside a wrapping flex container. |

### Optional Improvements (all 4 accepted & resolved in Revision 2)

| ID | Summary | Disposition |
| --- | --- | --- |
| **OI-1** | Explicitly export `alt`, `size`, and `contentType` on `wilson-cleveland/opengraph-image.tsx` and add the route to `tests/release.spec.ts:155`. | **Accepted.** Included in Section 2 and `tests/release.spec.ts`. |
| **OI-2** | Extract pure `buildSecurityHeaders({ isProduction, isVercel })` helper for unit testing Vercel-only headers (`HSTS`, `upgrade-insecure-requests`); note post-deploy live embed CSP smoke check limit. | **Accepted.** Added `src/lib/security-headers.mjs`, `scripts/security-headers.test.mjs`, and explicit post-deploy live-embed smoke caveat. |
| **OI-3** | Document expected 2–5 min Vercel Blob self-healing transition window on `MEDIA_POLICY_FINGERPRINT` rotation, correct module citation, and expand NY Post section allowlist (`world-news`, `health`, `podcasts`). | **Accepted.** Updated Section 5 and Failure behavior. |
| **OI-4** | Specify `WebSite` JSON-LD fields and `<body>` placement per Next.js 16 docs; remove redundant `/opengraph-image` header rule; correct `icon.svg` mark description. | **Accepted.** Updated Sections 1 and 4. |

## Remaining Limitations

- Live third-party embed SDK runtime sub-requests (X `widgets.js`, Audacy/Amperwave, SNY JW Player, YouTube player internals) are mocked in Playwright tests and require a quick DevTools CSP smoke check after production deployment.
- Post-change gzip HTML/JS budget headroom (`npm run test:performance`) and rendered visual layout across desktop/mobile/dark/short-page states will be verified against the actual production build before finishing.
