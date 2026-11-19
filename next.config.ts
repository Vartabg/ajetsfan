import type { NextConfig } from "next";
import path from "node:path";
import { buildSecurityHeaders } from "./src/lib/security-headers.mjs";
// Editorial and roster images retain their fixed publisher paths. Media pictures use the local,
// versioned catalog route, so a feed can add any number of exact recorded pictures.
const publisherPatterns = [
  { protocol: "https" as const, hostname: "i.ytimg.com", port: "", pathname: "/vi/**", search: "" },
  { protocol: "https" as const, hostname: "static.clubs.nfl.com", port: "", pathname: "/image/upload/*/jets/**", search: "" },
  { protocol: "https" as const, hostname: "static.clubs.nfl.com", port: "", pathname: "/image/private/t_editorial_landscape_12_desktop_3x/f_auto/jets/zlqrkeixkuukaccd4ctj.jpg", search: "" },
  { protocol: "https" as const, hostname: "static.www.nfl.com", port: "", pathname: "/image/upload/**", search: "" },
  { protocol: "https" as const, hostname: "static.www.nfl.com", port: "", pathname: "/image/private/**", search: "" },
  { protocol: "https" as const, hostname: "a.espncdn.com", port: "", pathname: "/i/headshots/nfl/players/**", search: "" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return buildSecurityHeaders({
      isProduction: process.env.NODE_ENV === "production",
      isVercel: Boolean(process.env.VERCEL),
    });
  },
  // The public snapshot URL must use the same runtime edition as pages and health.
  rewrites: () => ({ beforeFiles: [
    { source: "/data/media.json", destination: "/api/media" },
    ...["current", "coverage", "live", "games", "analytics", "season-rankings", "nextgen-stats", "league-history"].map((dataset) => ({ source: `/data/${dataset}.json`, destination: `/api/football/${dataset}` })),
    { source: "/data/curves/:id.json", destination: "/api/football/curve/:id" },
    { source: "/data/drives/:season.json", destination: "/api/football/drives/:season" },
  ] }),
  // The home directory is itself a git repo with a stray package-lock.json.
  // Pin the root so Turbopack does not walk up into it.
  turbopack: { root: path.resolve(".") },
  // The native extractor runs only in the analysis timer, never in score or page handlers.
  serverExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings"],
  outputFileTracingIncludes: {
    "/*": ["./public/data/*.json", "./public/data/drives/*.json"],
    // Player pages read every season's player file (readdir), which tracing cannot follow on its own.
    "/players/*": ["./public/data/players/*.json"],
    "/replay": ["./public/data/snaps/*.json.gz"],
    "/replay/*": ["./public/data/snaps/*.json.gz"],
    "/plays": ["./public/data/snaps/*.json.gz"],
    "/plays/*": ["./public/data/snaps/*.json.gz"],
    "/games/*": ["./public/data/snaps/*.json.gz"],
    "/find": ["./public/data/snaps/*.json.gz"],
    "/stories": ["./public/data/snaps/*.json.gz"],
    "/api/cron/analysis": ["./node_modules/@duckdb/node-bindings-linux-x64/**/*", "./public/data/curves/*.json"],
  },
  // The generic football snapshot fallback also traces subdirectories. Only routes
  // that actually open a snap season need the compressed play-by-play archive.
  outputFileTracingExcludes: {
    "/{api,discover,film-room,game-day,history,how-made,legends,media,morgue,players,puzzle,seasons,team}{,/**}": ["./public/data/snaps/*.json.gz"],
    "/**/opengraph-image": ["./public/data/snaps/*.json.gz"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      ...publisherPatterns,
    ],
    maximumRedirects: 0,
  },
  experimental: {
    agentUpgrade: "security",
  },
};

export default nextConfig;
