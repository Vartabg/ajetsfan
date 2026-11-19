# Benchmark standards, security headers, discovery parity, and NY Post media feed fix

Revision: 2 (2026-11-19; incorporates independent EGM review blockers `MB-1`–`MB-4` and improvements `OI-1`–`OI-4`; see `docs/plans/2026-11-19-benchmark-standards-review.md`). Source baseline: `origin/master` at `a430ec0`.

## Goal

Bring `ajetsfan.com` up to the established workspace shipping standards across five concrete gaps measured against live production and sibling sites (`garovartabedian.com`, `atxbro.com`, `nemerte.com`):

1. **HTTP security headers:** Production currently sends only Vercel's default HSTS header—no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, or `Cross-Origin-*` headers, and leaves `X-Powered-By` enabled.
2. **Per-page OpenGraph coverage & sitemap:** 26 of 27 public routes ship `opengraph-image.tsx`, but `/film-room/replay/wilson-cleveland` returns `404` on `/opengraph-image`, emits no `og:image`/`twitter:image`, and is omitted from `src/app/sitemap.ts`.
3. **Landmark & legal-disclaimer parity:** `FocusShell` renders `<header>`, `<aside>`, and `<main>`, with no top-level `<footer>` (`contentinfo`) landmark and no persistent "unofficial / not affiliated with the New York Jets or the NFL" disclaimer on public routes.
4. **Head metadata, icons, manifest, JSON-LD, `security.txt`, and public hygiene:** Missing `/favicon.ico`, `apple-touch-icon`, web manifest, `<meta name="color-scheme">`, light/dark `<meta name="theme-color">`, `WebSite` JSON-LD, and RFC 9116 `/.well-known/security.txt`, while unused create-next-app starter SVGs (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`) remain in `public/`.
5. **Live `new-york-post` media cron failure:** `/api/health` is currently `degraded` (`feeds.media` overdue >3.7 days since `2026-11-16`) and the daily `Refresh Jets data` workflow has failed 3 consecutive runs because `https://nypost.com/tag/new-york-jets/feed/` included a Jets-tagged `/2026/11/17/real-estate/...` article, which fails `parseMediaSource` because `excludedPathname` only allows `/betting/`.

Out of scope for this task: renaming `/morgue` or `/how-made` (undecided in `docs/design-direction.md`), subpage micro-typography redesigns, and adding an interactive font/theme switcher UI.

## Consequential decisions and contracts

### 1. HTTP security headers (`src/lib/security-headers.mjs`, `next.config.ts`)
- Set `poweredByHeader: false` in `next.config.ts`.
- Extract pure builder `buildSecurityHeaders({ isProduction, isVercel })` + `buildCsp({ isProduction, isVercel })` in `src/lib/security-headers.mjs` so both `next.config.ts` and deterministic Node unit tests (`scripts/security-headers.test.mjs`) test local/CI and Vercel HTTPS production modes (`OI-2`).
- Headers returned on `/:path*`:
  - `Content-Security-Policy`:
    - `default-src 'self'`
    - `script-src 'self' 'unsafe-inline'` (+ `'unsafe-eval'` only when `!isProduction`) `https://www.youtube.com https://s.ytimg.com https://platform.twitter.com https://va.vercel-scripts.com`
    - `style-src 'self' 'unsafe-inline'`
    - `img-src 'self' data: blob:`
    - `font-src 'self' data:`
    - `connect-src 'self' blob: https://vitals.vercel-insights.com` (+ `ws: wss:` only when `!isProduction`) — `blob:` is required because `three@0.186.1` `GLTFLoader` (`ImageBitmapLoader`) fetches `URL.createObjectURL(blob)` embedded GLB textures on `/film-room/replay/wilson-cleveland` (`MB-1`).
    - `frame-src 'self' https://www.youtube-nocookie.com https://embed.podcasts.apple.com https://player.amperwavepodcasting.com https://platform.twitter.com https://syndication.twitter.com`
    - `media-src 'self' https://cdn.jwplayer.com`
    - `worker-src 'self' blob:`
    - `object-src 'none'`
    - `base-uri 'self'`
    - `form-action 'self'`
    - `frame-ancestors 'none'`
    - Append `upgrade-insecure-requests` and `Strict-Transport-Security: max-age=63072000; includeSubDomains` **only** when `isVercel` (`Boolean(process.env.VERCEL)`), so local `http://127.0.0.1` production-build Playwright runs (`next start`) never fail under HTTP→HTTPS upgrade while every Vercel HTTPS deployment enforces both.
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Resource-Policy: same-origin`
- Override `Cross-Origin-Resource-Policy: cross-origin` on share-card and public icon/discovery routes (`/:path*/opengraph-image`, `/favicon.ico`, `/icon.svg`, `/apple-icon.png`, `/icon-192.png`, `/icon-512.png`, `/manifest.webmanifest`, `/.well-known/security.txt`) so social crawlers and cross-origin clients are never blocked (`OI-4`).
- Set explicit `Content-Type: text/plain; charset=utf-8` on `/.well-known/security.txt`.
- **Rationale for `'unsafe-inline'` in `script-src`:** Matches `garovartabedian.com` and `atxbro.com` for Next.js App Router hydration scripts without forcing dynamic nonce plumbing into static routes or breaking Playwright's `axe-core` script injection.
- **Rationale for `COEP` omission:** `/media` embeds YouTube, Apple Podcasts, Audacy/Amperwave, and X iframes, and the site does not use `SharedArrayBuffer`; omitting `COEP` avoids breaking third-party embeds lacking CORP headers.

### 2. Wilson 3D replay OG image and sitemap
- Add `src/app/film-room/replay/wilson-cleveland/opengraph-image.tsx` using the shared `ShareImage` helper (`src/lib/share-image.tsx`) with explicit Next.js 16 metadata exports (`OI-1`):
  - `export const alt = "Wilson’s winning touchdown — 3D Film Room on ajetsfan";`
  - `export const size = { width: 1200, height: 630 };`
  - `export const contentType = "image/png";`
  - `ShareImage` props: `eyebrow: "Film Room · 3D replay"`, `title: "Wilson’s winning touchdown."`, `detail: "September 18, 2022 at Cleveland. Move the camera, scrub slow motion, and inspect what is recorded versus inferred."`, `score: "31–30"`.
- Add `"/film-room/replay/wilson-cleveland"` to `src/app/sitemap.ts` and to the desk share-card verification matrix in `tests/release.spec.ts` (`OI-1`).

### 3. Top-level `<footer>` landmark & persistent disclaimer (`FocusShell.tsx`, `Focus.module.css`)
- Add a single `<footer className={styles.foot}>` as a direct child of `<div className={styles.app}>` after `</main>` in `src/components/FocusShell.tsx` (zero new module imports, preserving `tests/focus-runtime.spec.ts` module-mock compatibility).
- Footer copy (plain, sentence case, ≥14px Lexend, using `--quiet` / `--ink` / `--faint` tokens):
  - `"ajetsfan is an independent, unofficial New York Jets fan publication. Not affiliated with or endorsed by the New York Jets or the NFL."`
  - Quiet link container (`display: flex; flex-wrap: wrap; gap: 4px 18px`) with links styled `display: inline-flex; align-items: center; min-height: 44px; min-width: 44px` (`MB-4`): `Methods & sources` (`/how-made`) and `Security` (`/.well-known/security.txt`, plain `<a>` to static file).
- Layout in `src/components/Focus.module.css` (`MB-4`):
  - Base / mobile (`<1024px`) and `.studioShell` (`display: block`): full-width block footer separated by `border-top: 1px solid var(--faint)`, with `padding: 20px 16px calc(28px + env(safe-area-inset-bottom, 0px))`.
  - Desktop (`min-width: 1024px`): `.app` sets `grid-template-rows: minmax(0, 1fr) auto;`, `.rail` sets `grid-column: 1; grid-row: 1 / span 2;`, `.stack` sets `grid-column: 2; grid-row: 1;`, and `.foot` sets `grid-column: 2; grid-row: 2;` with horizontal padding `clamp(32px, 5vw, 88px)` matching `.moment`. This keeps short desktop pages (`/not-found`, `/error`, `/puzzle`) from stretching `.foot`.
- Update `tests/deep-cuts.spec.ts:17` from `page.locator("#top, footer")` to `page.locator("#top, body > header, body > footer")` (`MB-2`), matching `tests/morgue-focus.spec.ts:33` and `tests/game-focus.spec.ts:37` (which verify the `docs/navigation.md:32` rule that root layout mounts no legacy masthead or footer).
- Budget check: Confirm every route remains within `scripts/check-performance-budget.mjs` HTML and JS gzip limits without relaxing budgets.

### 4. Head metadata, favicons, manifest, JSON-LD, `security.txt`, and public cleanup
- `src/app/layout.tsx`:
  - Export static `viewport: Viewport`:
    - `width: "device-width"`, `initialScale: 1`, `viewportFit: "cover"`
    - `colorScheme: "light dark"`
    - `themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f2f4f0" }, { media: "(prefers-color-scheme: dark)", color: "#0e2a20" }]`
  - Render one static `WebSite` JSON-LD `<script type="application/ld+json">` inside `<body>` (`OI-4`, per Next.js 16 JSON-LD guidance) with fields `{ "@context": "https://schema.org", "@type": "WebSite", name: "ajetsfan", url: siteOrigin()?.origin ?? "https://ajetsfan.com", description: metadata.description, inLanguage: "en-US" }`, serialized with `JSON.stringify(...).replace(/</g, "\\u003c")`.
- Brand icons rasterized directly from the existing `src/app/icon.svg` mark (`OI-4`):
  - `src/app/favicon.ico` (16×16 + 32×32 PNG-in-ICO)
  - `src/app/apple-icon.png` (180×180 PNG)
  - `public/icon-192.png` (192×192 PNG) and `public/icon-512.png` (512×512 PNG)
  - Keep `src/app/icon.svg` intact.
- Add `src/app/manifest.ts` returning `MetadataRoute.Manifest` (`name: "ajetsfan"`, `short_name: "ajetsfan"`, `description`, `start_url: "/"`, `display: "standalone"`, `background_color: "#f2f4f0"`, `theme_color: "#125740"`, icons `/icon-192.png` and `/icon-512.png`).
- Add `public/.well-known/security.txt` (RFC 9116) listing only public contact channels:
  - `Contact: https://garovartabedian.com/contact`
  - `Contact: https://www.linkedin.com/in/garovartabedian/`
  - `Expires: 2027-11-01T00:00:00.000Z`
  - `Preferred-Languages: en`
  - `Canonical: https://ajetsfan.com/.well-known/security.txt`
- Delete unused create-next-app starter files from `public/`: `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`.

### 5. NY Post RSS non-sports section exclusion (`scripts/refresh-media.mjs`)
- Root cause: `https://nypost.com/tag/new-york-jets/feed/` returned HTTP 200 with a Jets-tagged item at `/2026/11/17/real-estate/ken-griffin-sells-nyc-duplex-to-jets-owner-woody-johnson-...`. `parseMediaSource` only excludes `excludedPathname: /^\/\d{4}\/\d{2}\/\d{2}\/betting\//`, so any dated non-sports NY Post section tagged with Jets throws `RSS destination publisher mismatch`, fails `new-york-post`, marks `feeds.media` overdue, and breaks `Refresh Jets data`.
- Fix: Keep the fail-closed explicit allowlist pattern (preserving the contract that `/2026/10/09/unknown/...` and `/private/...` still throw), and expand `new-york-post`'s `excludedPathname` to known NY Post non-sports dated sections (`OI-3`):
  `/^\/\d{4}\/\d{2}\/\d{2}\/(?:betting|real-estate|business|metro|us-news|world-news|news|entertainment|lifestyle|living|media|opinion|tech|fashion|shopping|health|podcasts)\//`
- Because `MEDIA_POLICY_FINGERPRINT` (`src/lib/hosted-media-refresh.ts`, computed by `mediaPolicyFingerprint` in `src/lib/media-live-envelope.mjs`) hashes `MEDIA_SOURCES`, updating `excludedPathname` cleanly moves live media storage to a fresh Blob key on production deploy.
- Add unit tests in `scripts/refresh-media.test.mjs` verifying `/real-estate/` and other known non-sports NY Post sections are excluded cleanly while `/unknown/`, `/private/`, wrong hosts, HTTP, and malformed URLs continue to throw.

## Failure behavior

- **CSP violation risk on 3D & embeds:** `connect-src` includes `blob:` for Three.js `GLTFLoader` (`MB-1`). Automated Playwright suites verify 3D replay loading, mocked media embeds, and zero `securitypolicyviolation` events. Note limitation (`OI-2`): Playwright stubs third-party embed scripts (`youtube.com/iframe_api`, `platform.twitter.com/widgets.js`, Apple embed), so a brief post-deploy DevTools smoke check on live `/media` playback is recommended after production rollout.
- **Post-deploy Vercel Blob transition window (`OI-3`):** When `MEDIA_POLICY_FINGERPRINT` rotates on deploy, `loadLiveMediaState()` falls back to baked `public/data/media.json` and `/api/health` reports `mediaScheduler.status: "unavailable"` (`503`) briefly until the first `/api/cron/media` tick or `scheduleStaleMediaRecovery()` background refresh writes `media/editions/<new-hash>.json` (expected self-healing window ~2–5 minutes).
- **Performance budget regression:** `npm run test:performance` fails closed if adding JSON-LD, viewport meta, or `FocusShell` footer exceeds any route's gzip HTML or initial JS ceiling. Any exceedance must be reduced in markup/CSS before shipping, not papered over.
- **NY Post future section additions:** Explicit non-sports allowlist preserves strict publisher-path integrity; `parseMediaSource` retains the last good NY Post snapshot on unexpected paths rather than publishing unvetted URLs.

## Affected files

- `src/lib/security-headers.mjs` (new)
- `scripts/security-headers.test.mjs` (new)
- `next.config.ts`
- `src/app/layout.tsx`
- `src/app/sitemap.ts`
- `src/lib/sitemap-paths.ts` (new)
- `src/app/manifest.ts` (new)
- `src/app/favicon.ico` (new)
- `src/app/apple-icon.png` (new)
- `src/app/film-room/replay/wilson-cleveland/opengraph-image.tsx` (new)
- `src/components/FocusShell.tsx`
- `src/components/Focus.module.css`
- `public/icon-192.png`, `public/icon-512.png` (new)
- `public/.well-known/security.txt` (new)
- `public/{file,globe,next,vercel,window}.svg` (deleted)
- `scripts/refresh-media.mjs`
- `scripts/refresh-media.test.mjs`
- `tests/deep-cuts.spec.ts` (`MB-2`)
- `tests/release.spec.ts` (`OI-1`)
- `tests/site-standards.spec.ts` (new)
- `docs/plans/2026-11-19-benchmark-standards.md` and `docs/plans/2026-11-19-benchmark-standards-review.md`

## Observable acceptance checks

1. `npm run test:data` passes (including `scripts/security-headers.test.mjs` covering local vs. Vercel HTTPS header outputs and updated NY Post exclusion + fail-closed tests) and live dry-run parse of `https://nypost.com/tag/new-york-jets/feed/` succeeds cleanly, excluding `/real-estate/` and `/betting/`.
2. `npm run lint` passes with zero warnings/errors.
3. `npm run build` succeeds cleanly.
4. `npm run test:performance` passes all route HTML and JS gzip budgets without raising limits.
5. Full `npm run test:a11y` (`npx playwright test`) passes, including `tests/site-standards.spec.ts`, `tests/deep-cuts.spec.ts`, `tests/release.spec.ts`, `tests/wilson-replay.spec.ts`, `tests/homepage.spec.ts`, `tests/focus-rail.spec.ts`, `tests/focus-runtime.spec.ts`, `tests/published-pages.spec.ts`, `tests/inline-media.spec.ts`, `tests/media-playback.spec.ts`, and `tests/responsive.spec.ts`:
   - Security headers present on `/` and subpages (`CSP` with `blob:` in `connect-src`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, `CORP`, no `X-Powered-By`), and `CORP: cross-origin` on OG images and icons.
   - `/film-room/replay/wilson-cleveland/opengraph-image` returns `200 image/png` at `1200×630` with `og:image`, `og:image:width`, `og:image:height`, and `og:image:alt` present in HTML; `sitemap()` invoked with `NEXT_PUBLIC_SITE_URL="https://ajetsfan.com"` includes `/film-room/replay/wilson-cleveland` (and HTTP `/sitemap.xml` checked when `siteOrigin()` is configured, `MB-3`).
   - `/favicon.ico`, `/apple-icon.png`, `/manifest.webmanifest`, `/icon-192.png`, `/icon-512.png`, and `/.well-known/security.txt` (`text/plain; charset=utf-8`) all return `200`.
   - Every audited route exposes `<meta name="color-scheme" content="light dark">`, light/dark `<meta name="theme-color">`, valid `WebSite` JSON-LD, a single top-level `<footer>` (`contentinfo`) landmark containing the unofficial Jets disclaimer with ≥44×44 link targets, zero `securitypolicyviolation` or `pageerror` events, and zero console errors (stubbing `**/_vercel/**` locally per `MB-3`).
6. Rendered screenshots of desktop (`1440×900` light/dark, including a short page `/not-found`), mobile (`390×844`), Wilson replay (`studioShell` with 3D loaded), and generated Wilson OG card + raster icons visually inspected for layout, contrast, and zero clipping/overflow.
