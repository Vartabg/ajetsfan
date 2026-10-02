import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCurve } from "@/lib/load-games";
import { loadPublishedGame, loadPublishedGames } from "@/lib/load-published-pages";
import { formatDate } from "@/lib/current";
import { clockLabel, pct } from "@/lib/games";
import { gameHref } from "@/lib/explorer";
import { fanMemoryForGame } from "@/lib/fan-memories";
import { keyPlayEvidenceLabel } from "@/lib/morgue";
import { wpaLabel } from "@/lib/analytics-context";
import { pageMetadata } from "@/lib/site";
import PressChart from "@/components/PressChart";
import styles from "./page.module.css";

type Props = { params: Promise<{ id: string }> };
async function getCase(id: string) {
  const game = await loadPublishedGame(id);
  if (!game) notFound();
  return game;
}

export const dynamicParams = false;
export async function generateStaticParams() {
  return (await loadPublishedGames()).map((game) => ({ id: game.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const game = await getCase((await params).id);
  const title = `Jets ${game.jetsScore}–${game.oppScore} ${game.opponentDisplay} · ${formatDate(game.date)}`;
  const description = `The Jets ${game.outcome === "win" ? "beat" : "lost to"} ${game.opponentDisplay} ${game.jetsScore}–${game.oppScore}${game.wentToOt ? " in overtime" : ""}. ${game.season} ${game.seasonType === "POST" ? "postseason" : "regular season"}, Week ${game.week}. Final score, model win-probability curve and recorded play evidence.`;
  return pageMetadata({ title, description, path: `/games/${game.id}` });
}

export default async function GamePage({ params }: Props) {
  const game = await getCase((await params).id);
  const memory = fanMemoryForGame(game);
  const board = game.outcome === "win" ? "miracle" : "heartbreak";
  const differential = game.jetsScore - game.oppScore;
  const points = (await loadCurve(game.id)).filter((point) => Number.isFinite(point.wp) && point.wp >= 0 && point.wp <= 1);
  const tapeHref = `${gameHref(game.id, board)}#game-case-heading`;
  return <main id="main" className={styles.main}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">The Back Page</Link><span aria-hidden="true">/</span><Link href="/morgue">The Morgue</Link><span aria-hidden="true">/</span><span>Game case</span></nav>
    <article>
      <header className={styles.header}>
        <div className={styles.folio}><span>{game.season} {game.seasonType === "POST" ? "postseason" : "regular season"} · Week {game.week}</span><time dateTime={game.date}>{formatDate(game.date)}</time></div>
        <div className={styles.headline}><div><p className={styles.kicker}>The final is on the record</p><h1 className="hed">Jets {game.atHome ? "vs" : "at"}<br />{game.opponentDisplay}<span className={styles.period} aria-hidden="true">.</span></h1><p className={styles.location}>{game.atHome ? "Home game" : "Away game"}{game.wentToOt ? " · Overtime" : ""}</p></div>
          <div className={styles.scoreboard} aria-label={`Final score: Jets ${game.jetsScore}, ${game.opponentDisplay} ${game.oppScore}`}><p>Final{game.wentToOt ? " / OT" : ""}</p><div><span>NYJ</span><strong>{game.jetsScore}</strong></div><div><span>{game.opponentDisplay}</span><strong>{game.oppScore}</strong></div><small>{game.outcome === "win" ? "Jets win" : "Jets loss"}</small></div>
        </div>
        <dl className={styles.evidence} aria-label="Game evidence">
          <div><dt>Jets point differential</dt><dd>{differential > 0 ? "+" : ""}{differential}<small>{Math.abs(differential) === 1 ? "point" : "points"}</small></dd></div>
          <div><dt>{board === "heartbreak" ? "Peak" : "Lowest"} second-half model win probability</dt><dd>{pct(game.swing)}<small>After halftime, including OT</small></dd></div>
          <div><dt>Featured play · win-probability change</dt><dd className={styles.playDelta}>{wpaLabel(game.keyPlay.wpa)}<small>{clockLabel(game.keyPlay.qtr, game.keyPlay.secondsLeft) || "Clock unavailable"}</small></dd></div>
        </dl>
      </header>
      <div className={styles.body}>
        <section className={styles.report} aria-labelledby="game-report-heading"><p className={styles.kicker}>{memory ? "Sourced game account" : "The game on record"}</p><h2 id="game-report-heading">{memory?.title ?? "Game summary."}</h2><p className={styles.standfirst}>{memory?.fact ?? `The Jets ${game.outcome === "win" ? "won" : "lost"} ${game.jetsScore}–${game.oppScore} ${game.atHome ? "at home against" : "on the road against"} ${game.opponentDisplay}${game.wentToOt ? " in overtime" : ""}. This is a game from the ${game.season} ${game.seasonType === "POST" ? "postseason" : "regular season"} archive.`}</p>
          {memory ? <a className={styles.sourceLink} href={memory.source.url} target="_blank" rel="noreferrer">{memory.source.label} <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a> : null}
          <section className={styles.play} aria-labelledby="featured-play-heading"><p className={styles.kicker}>From the play-by-play</p><h3 id="featured-play-heading">{keyPlayEvidenceLabel(game)}.</h3>{game.keyPlay.desc ? <><p className={styles.playClock}>{clockLabel(game.keyPlay.qtr, game.keyPlay.secondsLeft) || "Clock unavailable"}</p><p className={styles.playDescription}>{game.keyPlay.desc}</p><p className={styles.playChange}>Jets model win-probability change: <strong>{wpaLabel(game.keyPlay.wpa)}</strong></p></> : <p>No featured play description is available in this edition.</p>}<p className={styles.note}>Selected by Jets-oriented model probability change among recorded plays after halftime, including overtime. The delta measures the model change associated with the play; it does not explain why the game was won or lost.</p></section>
        </section>
        <aside className={styles.tape} aria-labelledby="tape-heading"><p className={styles.kicker}>The tape, on paper</p><h2 id="tape-heading">The probability path.</h2>{points.length >= 2 ? <figure><PressChart points={points} board={board} /><figcaption>Model-estimated Jets win probability before each recorded play · play sequence · {points.length} usable points</figcaption></figure> : <p className={styles.note}>A usable probability curve is unavailable in this edition.</p>}<Link className={styles.tapeLink} href={tapeHref}>Open the interactive game tape <span aria-hidden="true">↗</span></Link><p className={styles.note}>Inspect the source description, clock, pre-play estimate and reported change for each play.</p></aside>
      </div>
      <footer className={styles.sources}><h2>Sources and scope.</h2><p>Final score and play-by-play: <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">nflverse<span className="sr-only"> (opens in a new tab)</span></a>. Probability is a model estimate. The curve contains usable source points; gaps are not reconstructed. Archive rankings include wins and losses with usable second-half estimates and exclude flagged scores and ties.</p><Link href="/how-made#efficiency">Sources and analysis methods <span aria-hidden="true">↗</span></Link><Link href="/morgue#archive-filters">Find another game <span aria-hidden="true">↗</span></Link></footer>
    </article>
  </main>;
}
