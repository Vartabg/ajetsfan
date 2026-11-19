/**
 * Build HTTP security headers for ajetsfan.com.
 *
 * Every external origin allowed in Content-Security-Policy corresponds to a
 * verified runtime dependency:
 * - YouTube IFrame API & privacy-enhanced embeds (src/components/YouTubePlayer.tsx)
 * - X/Twitter widgets & post embeds (src/components/InlineMediaPlayer.tsx)
 * - Apple Podcasts & Audacy/Amperwave embeds (src/lib/media-playback.ts, media-playback-validation.mjs)
 * - SNY JW Player MP4 playback (src/lib/media-playback-validation.mjs)
 * - Three.js GLTFLoader blob: texture fetches (src/lib/wilson-player-assets.ts)
 * - Vercel Analytics & Speed Insights (src/components/Telemetry.tsx)
 */

/**
 * @param {{ isProduction?: boolean, isVercel?: boolean }} [options]
 * @returns {string}
 */
export function buildCsp({ isProduction = true, isVercel = false } = {}) {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"} https://www.youtube.com https://s.ytimg.com https://platform.twitter.com https://va.vercel-scripts.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' blob: https://vitals.vercel-insights.com${isProduction ? "" : " ws: wss:"}`,
    "frame-src 'self' https://www.youtube-nocookie.com https://embed.podcasts.apple.com https://player.amperwavepodcasting.com https://platform.twitter.com https://syndication.twitter.com",
    "media-src 'self' https://cdn.jwplayer.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (isVercel) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

const CROSS_ORIGIN_PUBLIC_ASSETS = [
  "/:path*/opengraph-image",
  "/favicon.ico",
  "/icon.svg",
  "/apple-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
  "/.well-known/security.txt",
];

/**
 * @param {{ isProduction?: boolean, isVercel?: boolean }} [options]
 * @returns {Array<{ source: string, headers: Array<{ key: string, value: string }> }>}
 */
export function buildSecurityHeaders({ isProduction = true, isVercel = false } = {}) {
  /** @type {Array<{ key: string, value: string }>} */
  const globalHeaders = [
    { key: "Content-Security-Policy", value: buildCsp({ isProduction, isVercel }) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ];
  if (isVercel) {
    globalHeaders.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  }

  return [
    { source: "/:path*", headers: globalHeaders },
    ...CROSS_ORIGIN_PUBLIC_ASSETS.map((source) => ({
      source,
      headers: [
        { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ...(source === "/.well-known/security.txt"
          ? [{ key: "Content-Type", value: "text/plain; charset=utf-8" }]
          : []),
      ],
    })),
  ];
}
