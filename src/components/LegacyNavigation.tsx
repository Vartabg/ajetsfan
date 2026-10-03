"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Keep previously shared section links working after their content moves to a page. */
export default function LegacyNavigation({ latestReport }: { latestReport: string }) {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const redirect = () => {
      const url = new URL(window.location.href);
      const home: Record<string, string> = {
        "#postgame": `${latestReport}#${latestReport.startsWith("/games/") ? "game-report-heading" : "season-results-heading"}`,
        "#game-evidence": `${latestReport}#${latestReport.startsWith("/games/") ? "game-evidence" : "season-results-heading"}`,
        "#season": "/game-day#season", "#season-trend": "/game-day#season-trend",
        "#sunday-briefing": "/game-day#sunday-briefing", "#game-day-ticket": "/game-day#game-day-ticket",
        "#visual-story": "/stories#visual-story", "#fan-stand": "/history#fan-stand",
        "#fan-memories": "/history#remembered-cases", "#remembered-cases": "/history#remembered-cases",
        "#rivalries": "/history#rivalry-desk", "#rivalry-desk": "/history#rivalry-desk",
        "#archive-stories": "/morgue", "#around-jets": "/team/news",
      };
      const team: Record<string, string> = { "#roster": "/team/roster#roster", "#news": "/team/news#news-desk-heading", "#season-leaders": "/team/stats#leaders-heading" };
      const target = url.pathname === "/" ? home[url.hash] ?? (url.searchParams.has("story") ? "/stories#visual-story" : null)
        : url.pathname === "/team" ? team[url.hash] ?? (["player", "q", "unit", "position", "status"].some((key) => url.searchParams.has(key)) ? "/team/roster#roster" : null) : null;
      if (!target) return;
      const destination = new URL(target, url.origin);
      destination.search = url.search;
      router.replace(`${destination.pathname}${destination.search}${destination.hash}`);
    };
    redirect();
    window.addEventListener("hashchange", redirect);
    window.addEventListener("popstate", redirect);
    return () => {
      window.removeEventListener("hashchange", redirect);
      window.removeEventListener("popstate", redirect);
    };
  }, [pathname, latestReport, router]);
  return null;
}
