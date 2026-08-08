import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The home directory is itself a git repo with a stray package-lock.json.
  // Pin the root so Turbopack does not walk up into it.
  turbopack: { root: path.resolve(".") },
};

export default nextConfig;
