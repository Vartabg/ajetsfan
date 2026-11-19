import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ajetsfan",
    short_name: "ajetsfan",
    description: "Checked Jets results, sourced team news, player statistics, and game-by-game win-probability charts.",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f4f0",
    theme_color: "#125740",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
