import type { Metadata } from "next";
import type { ReactNode } from "react";
import Telemetry from "@/components/Telemetry";
import { indexableSite, siteOrigin } from "@/lib/site";
import { Anton, Archivo_Narrow, Source_Serif_4, Geist_Mono, Manrope } from "next/font/google";
import { loadGames, loadCurrent } from "@/lib/load-games";
import { mergeResults } from "@/lib/current";
import { currentStreak, wearLevel } from "@/lib/paper";
import Masthead from "@/components/Masthead";
import Colophon from "@/components/Colophon";
import "./globals.css";

const hed = Anton({ variable: "--font-hed", subsets: ["latin"], weight: "400" });
const narrow = Archivo_Narrow({ variable: "--font-sans-narrow", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-serif", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"], preload: false });
const sans = Manrope({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: siteOrigin(),
  applicationName: "The Back Page",
  title: "The Back Page — a Jets fan",
  description:
    "Jets football for those of us still watching. Sunday stories, the players in our jerseys, current news, and The Morgue: a shrine to lost leads and improbable wins.",
  robots: { index: indexableSite(), follow: indexableSite() },
  openGraph: { siteName: "The Back Page", locale: "en_US", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [games, snapshot] = await Promise.all([loadGames(), loadCurrent()]);
  const streak = currentStreak(mergeResults(games, snapshot));
  const wear = wearLevel(streak);

  return (
    <html
      lang="en"
      data-wear={wear}
      className={`${hed.variable} ${narrow.variable} ${serif.variable} ${mono.variable} ${sans.variable}`}
    >
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <Masthead streak={streak} wear={wear} checkedAt={snapshot?.checkedAt ?? null} />
        {children}
        <Colophon games={games} snapshot={snapshot} />
        <Telemetry />
      </body>
    </html>
  );
}
