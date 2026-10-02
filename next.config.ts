import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The home directory is itself a git repo with a stray package-lock.json.
  // Pin the root so Turbopack does not walk up into it.
  turbopack: { root: path.resolve(".") },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com", port: "", pathname: "/vi/**", search: "" },
      { protocol: "https", hostname: "static.clubs.nfl.com", port: "", pathname: "/image/upload/*/jets/**", search: "" },
      { protocol: "https", hostname: "static.clubs.nfl.com", port: "", pathname: "/image/private/t_editorial_landscape_12_desktop_3x/f_auto/jets/zlqrkeixkuukaccd4ctj.jpg", search: "" },
      { protocol: "https", hostname: "static.www.nfl.com", port: "", pathname: "/image/upload/**", search: "" },
      { protocol: "https", hostname: "static.www.nfl.com", port: "", pathname: "/image/private/**", search: "" },
      { protocol: "https", hostname: "a.espncdn.com", port: "", pathname: "/i/headshots/nfl/players/**", search: "" },
    ],
    maximumRedirects: 0,
  },
};

export default nextConfig;
