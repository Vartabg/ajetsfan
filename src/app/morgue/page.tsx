import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { pageMetadata } from "@/lib/site";
import { publishedGames } from "@/lib/published-pages";
import { pct, rank, type Game } from "@/lib/games";
import { gameHref } from "@/lib/explorer";
import { selectFanMemories } from "@/lib/fan-memories";
import { loadGames, loadCurrent } from "@/lib/load-games";
import { archiveCoverage, formatDate } from "@/lib/current";
import { placeName } from "@/lib/focus";
import Boards from "@/components/Boards";
import MemoryWall from "@/components/MemoryWall";
import FocusMoment from "@/components/FocusMoment";
import FocusShell, { type FocusEntry } from "@/components/FocusShell";
import shared from "@/components/Focus.module.css";
import { focusFonts } from "../focus-fonts";
import styles from "./page.module.css";

export const metadata: Metadata = pageMetadata({
  path: "/morgue",
  title: "The Morgue — a Jets fan",
  description:
    "The Jets game archive. Explore confirmed scores, second-half model win probabilities, and recorded play-by-play.",
});

const final = (game: Game) => `${game.outcome === "win" ? "Won" : "Lost"} ${game.jetsScore}–${game.oppScore} ${game.atHome ? "vs" : "at"} ${placeName(game.opponentDisplay)}`;

export default async function Morgue() {
  const [games, current] = await Promise.all([loadGames(), loadCurrent()]);
  const coverage = archiveCoverage(games);
  const heartbreak = rank(games, "heartbreak");
  const miracle = rank(games, "miracle");
  const caseIds = publishedGames(games, current).map((game) => game.id);
  const classics = selectFanMemories(games).length;
  const [loss] = heartbreak;
  const [win] = miracle;
  const open = (game: Game, board: "heartbreak" | "miracle") => caseIds.includes(game.id) ? `/games/${game.id}` : gameHref(game.id, board);

  const entries: FocusEntry[] = [
    { id: "archive", title: "Game archive", answer: `${coverage.count} games` },
    ...(loss ? [{ id: "hardest-loss", title: "Hardest loss", answer: `${loss.season} · ${pct(loss.swing)}` }] : []),
    ...(win ? [{ id: "unlikeliest-win", title: "Unlikeliest win", answer: `${win.season} · ${pct(win.swing)}` }] : []),
    ...(classics ? [{ id: "classics", title: "Classic cases", answer: `${classics} games` }] : []),
    { id: "find", title: "Find a game", answer: "Search and rank" },
  ];

  return <FocusShell page="morgue" entries={entries} checkedAt={null} className={focusFonts}>
    <FocusMoment id="archive" first label={`Game archive · ${coverage.seasonLabel}`}
      heading={<>{coverage.count} Jets games, <em>on the record.</em></>}
      actions={heartbreak.length + miracle.length > 0 ? <nav aria-label="In the archive" className={shared.actions}>
        <Link href="#archive-filters" className={shared.go}>Find a game <span aria-hidden="true">↓</span></Link>
        {classics ? <Link href="#fan-memories" className={shared.go}>The classic cases <span aria-hidden="true">↓</span></Link> : null}
      </nav> : null}>
      <p className={shared.caption}>Each game has its final score and a model’s win probability before every recorded play. Compare the final with the probability path. Losses rank by their highest second-half estimate; wins rank by their lowest.</p>
      <p className={shared.note}>{coverage.lastDate ? <>Through <time dateTime={coverage.lastDate}>{formatDate(coverage.lastDate)}</time></> : "No analyzed games yet"}</p>
    </FocusMoment>

    {loss ? <FocusMoment id="hardest-loss" label={`Hardest loss · ${formatDate(loss.date)}`}
      heading={<>{final(loss)}. <em>The model had them as high as {pct(loss.swing)} after halftime.</em></>}
      actions={<Link href={open(loss, "heartbreak")} className={shared.go}>See this game <span aria-hidden="true">→</span></Link>}>
      <p className={shared.caption}>First of {heartbreak.length} ranked losses.</p>
    </FocusMoment> : null}

    {win ? <FocusMoment id="unlikeliest-win" label={`Unlikeliest win · ${formatDate(win.date)}`}
      heading={<>{final(win)}. <em>The model had them as low as {pct(win.swing)} after halftime.</em></>}
      actions={<Link href={open(win, "miracle")} className={shared.go}>See this game <span aria-hidden="true">→</span></Link>}>
      <p className={shared.caption}>First of {miracle.length} ranked wins.</p>
    </FocusMoment> : null}

    {classics ? <FocusMoment id="classics" hosts><MemoryWall games={games} /></FocusMoment> : null}

    <FocusMoment id="find" hosts>
      <div className={styles.tools} data-focus-tools>
        <Suspense fallback={<p className={shared.caption} role="status">Loading the game archive…</p>}><Boards heartbreak={heartbreak} miracle={miracle} caseIds={caseIds} /></Suspense>
      </div>
      <p className={shared.caption}>{heartbreak.length + miracle.length} wins and losses have usable second-half probability estimates and qualify for these rankings. Flagged scores and ties are excluded. Win probability is a model estimate from nflverse play-by-play; <Link href="/how-made">review the method and integrity checks</Link>.</p>
    </FocusMoment>
  </FocusShell>;
}
