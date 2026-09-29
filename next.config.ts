import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The home directory is itself a git repo with a stray package-lock.json.
  // Pin the root so Turbopack does not walk up into it.
  turbopack: { root: path.resolve(".") },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "static.www.nfl.com", port: "", pathname: "/image/upload/**", search: "" },
      { protocol: "https", hostname: "static.www.nfl.com", port: "", pathname: "/image/private/**", search: "" },
      { protocol: "https", hostname: "a.espncdn.com", port: "", pathname: "/i/headshots/nfl/players/**", search: "" },
    ],
    maximumRedirects: 0,
  },
};

export default nextConfig;
