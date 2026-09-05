import type { Metadata } from "next";
import { Anton, Archivo_Narrow, Source_Serif_4, Geist_Mono } from "next/font/google";
import { loadGames } from "@/lib/load-games";
import { currentStreak, wearLevel } from "@/lib/paper";
import Masthead from "@/components/Masthead";
import Colophon from "@/components/Colophon";
import "./globals.css";

const hed = Anton({ variable: "--font-hed", subsets: ["latin"], weight: "400" });
const narrow = Archivo_Narrow({ variable: "--font-sans-narrow", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-serif", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Back Page — a Jets fan",
  description:
    "A New York Jets tabloid that sets its own front page from the data, and yellows with the losing streak.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const games = await loadGames();
  const streak = currentStreak(games);
  const wear = wearLevel(streak);

  return (
    <html
      lang="en"
      data-wear={wear}
      className={`${hed.variable} ${narrow.variable} ${serif.variable} ${mono.variable}`}
    >
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <Masthead streak={streak} wear={wear} />
        {children}
        <Colophon />
      </body>
    </html>
  );
}
