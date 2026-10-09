import type { Metadata } from "next";
import type { ReactNode } from "react";
import Telemetry from "@/components/Telemetry";
import { indexableSite, siteOrigin } from "@/lib/site";
import { Anton, Archivo_Narrow, Source_Serif_4, Geist_Mono, Manrope } from "next/font/google";
import { loadGames, loadCurrent } from "@/lib/load-games";
import { mergeResults, selectLead } from "@/lib/current";
import { currentStreak, wearLevel } from "@/lib/paper";
import LegacyNavigation from "@/components/LegacyNavigation";
import { publishedGames } from "@/lib/published-pages";
import "./globals.css";

const hed = Anton({ variable: "--font-hed", subsets: ["latin"], weight: "400" });
const narrow = Archivo_Narrow({ variable: "--font-sans-narrow", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-serif", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"], preload: false });
const sans = Manrope({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: siteOrigin(),
  applicationName: "The Back Page",
  title: "The Back Page — Jets football, on the record",
  description:
    "Checked Jets results, sourced team news, player statistics, and game-by-game win-probability charts. Independent coverage with visible dates, samples, and methods.",
  robots: { index: indexableSite(), follow: indexableSite() },
  openGraph: { siteName: "The Back Page", locale: "en_US", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [games, snapshot] = await Promise.all([loadGames(), loadCurrent()]);
  const streak = currentStreak(mergeResults(games, snapshot));
  const wear = wearLevel(streak);
  const result = selectLead(games, snapshot).result;
  const latestReport = result && publishedGames(games, snapshot).some((game) => game.id === result.id) ? `/games/${encodeURIComponent(result.id)}` : `/seasons/${snapshot?.season ?? result?.season ?? 2026}`;

  return (
    <html
      lang="en"
      data-wear={wear}
      className={`${hed.variable} ${narrow.variable} ${serif.variable} ${mono.variable} ${sans.variable}`}
    >
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <LegacyNavigation latestReport={latestReport} />
        {children}
        <Telemetry />
      </body>
    </html>
  );
}
