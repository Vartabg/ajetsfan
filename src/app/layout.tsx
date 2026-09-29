import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
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
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });
const sans = Manrope({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Back Page — a Jets fan",
  description:
    "An independent Jets publication. Current results, team efficiency, every win-probability swing, and a searchable archive of Jets football.",
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
        <Analytics />
      </body>
    </html>
  );
}
