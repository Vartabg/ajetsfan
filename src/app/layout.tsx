import type { Metadata } from "next";
import type { ReactNode } from "react";
import Telemetry from "@/components/Telemetry";
import { indexableSite, siteOrigin } from "@/lib/site";
import { loadGames, loadCurrent } from "@/lib/load-games";
import { mergeResults, selectLead } from "@/lib/current";
import { currentStreak, wearLevel } from "@/lib/paper";
import LegacyNavigation from "@/components/LegacyNavigation";
import FootballRefresh from "@/components/football-refresh";
import { loadFootballViewerStatus } from "@/lib/football-viewer-status";
import { publishedGames } from "@/lib/published-pages";
import { focusFonts } from "./focus-fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: siteOrigin(),
  applicationName: "ajetsfan",
  title: "ajetsfan · the Jets, one thing at a time",
  description:
    "Checked Jets results, sourced team news, player statistics, and game-by-game win-probability charts. Independent coverage with visible dates, samples, and methods.",
  robots: { index: indexableSite(), follow: indexableSite() },
  openGraph: { siteName: "ajetsfan", locale: "en_US", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [games, snapshot, football] = await Promise.all([loadGames(), loadCurrent(), loadFootballViewerStatus()]);
  const streak = currentStreak(mergeResults(games, snapshot));
  const wear = wearLevel(streak);
  const result = selectLead(games, snapshot).result;
  const latestReport = result && publishedGames(games, snapshot).some((game) => game.id === result.id) ? `/games/${encodeURIComponent(result.id)}` : `/seasons/${snapshot?.season ?? result?.season ?? 2026}`;

  return (
    <html
      lang="en"
      data-wear={wear}
      className={focusFonts}
    >
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <LegacyNavigation latestReport={latestReport} />
        {children}
        <Telemetry />
        <FootballRefresh initialRevision={football.revision} />
      </body>
    </html>
  );
}
