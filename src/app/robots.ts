import type { MetadataRoute } from "next";
import { indexableSite, siteOrigin } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  if (!indexableSite()) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: "/api/" }, sitemap: new URL("/sitemap.xml", origin!).href };
}
