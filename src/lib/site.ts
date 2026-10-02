import type { Metadata } from "next";

type SiteEnvironment = { NEXT_PUBLIC_SITE_URL?: string; VERCEL_PROJECT_PRODUCTION_URL?: string; VERCEL_ENV?: string; NODE_ENV?: string };

/** Never turn an arbitrary preview address into the publication's canonical home. */
export function siteOrigin(env: SiteEnvironment = process.env): URL | undefined {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim();
  const value = configured || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.pathname !== "/" || url.search || url.hash || !url.hostname.includes(".") ||
      url.hostname.endsWith(".localhost") || /^[\d.]+$/.test(url.hostname)) return undefined;
    return url;
  } catch { return undefined; }
}

export function indexableSite(env: SiteEnvironment = process.env): boolean {
  return !!siteOrigin(env) && (env.VERCEL_ENV ? env.VERCEL_ENV === "production" : env.NODE_ENV === "production");
}

export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const url = siteOrigin() ? path : undefined;
  return {
    title, description,
    alternates: url ? { canonical: url } : undefined,
    openGraph: { title, description, url, siteName: "The Back Page", locale: "en_US", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}
