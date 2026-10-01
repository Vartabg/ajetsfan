import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCurve } from "@/lib/load-games";
import { loadPublishedGame, loadPublishedGames } from "@/lib/load-published-pages";
import { formatDate } from "@/lib/current";
import { clockLabel, pct } from "@/lib/games";
import { gameHref } from "@/lib/explorer";
import { fanMemoryForGame } from "@/lib/fan-memories";
import { morgueEpitaph } from "@/lib/morgue";
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
  const description = `The Jets ${game.outcome === "win" ? "beat" : "lost to"} ${game.opponentDisplay} ${game.jetsScore}–${game.oppScore}${game.wentToOt ? " in overtime" : ""}. ${game.season} ${game.seasonType === "POST" ? "postseason" : "regular season"}, Week ${game.week}. The final, the turning play, and the Jets fan reaction.`;
  return pageMetadata({ title, description, path: `/games/${game.id}` });
}

export default async function GamePage({ params }: Props) {
  const game = await getCase((await params).id);
  const memory = fanMemoryForGame(game);
  const board = game.outcome === "win" ? "miracle" : "heartbreak";
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
        <div className={styles.reaction}><span>Fan reaction</span><p>{morgueEpitaph(game)}</p></div>
      </header>
      <div className={styles.body}>
        <section className={styles.report} aria-labelledby="game-report-heading"><p className={styles.kicker}>{memory ? "A case we still talk about" : "The game on record"}</p><h2 id="game-report-heading">{memory?.title ?? "Four quarters. One final."}</h2><p className={styles.standfirst}>{memory?.fact ?? `The Jets ${game.outcome === "win" ? "won" : "lost"} ${game.jetsScore}–${game.oppScore} ${game.atHome ? "at home against" : "on the road against"} ${game.opponentDisplay}${game.wentToOt ? " in overtime" : ""}. This is a game from the ${game.season} ${game.seasonType === "POST" ? "postseason" : "regular season"} archive.`}</p>
          {memory ? <a className={styles.sourceLink} href={memory.source.url} target="_blank" rel="noreferrer">{memory.source.label} <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a> : null}
          <section className={styles.play} aria-labelledby="featured-play-heading"><p className={styles.kicker}>From the play-by-play</p><h3 id="featured-play-heading">{game.outcome === "loss" ? "The biggest second-half setback." : "The biggest second-half boost."}</h3>{game.keyPlay.desc ? <><p className={styles.playClock}>{clockLabel(game.keyPlay.qtr, game.keyPlay.secondsLeft) || "Clock unavailable"}</p><p className={styles.playDescription}>{game.keyPlay.desc}</p><p className={styles.playChange}>Jets win-probability change: <strong>{wpaLabel(game.keyPlay.wpa)}</strong></p></> : <p>No featured play description is available in this edition.</p>}<p className={styles.note}>Selected by Jets-oriented win-probability change. This is a source play description, rather than a full game report.</p></section>
        </section>
        <aside className={styles.tape} aria-labelledby="tape-heading"><p className={styles.kicker}>The tape, on paper</p><h2 id="tape-heading">Where it turned.</h2><p className={styles.probability}><strong>{pct(game.swing)}</strong><span>{board === "heartbreak" ? "Peak second-half chance to win" : "Lowest second-half chance to win"}</span></p>{points.length >= 2 ? <figure><PressChart points={points} board={board} /><figcaption>Jets pre-play win probability · play sequence</figcaption></figure> : <p className={styles.note}>A usable probability curve is unavailable in this edition.</p>}<Link className={styles.tapeLink} href={tapeHref}>Open the interactive game tape <span aria-hidden="true">↗</span></Link><p className={styles.note}>Move play by play, read the clock and compare the probability before a play with the change it produced.</p></aside>
      </div>
      <footer className={styles.sources}><h2>The record behind the reaction.</h2><p>Final score and play-by-play: <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">nflverse<span className="sr-only"> (opens in a new tab)</span></a>. Probability is a model estimate. Fan reaction is original commentary; the archive holds games with usable second-half analysis.</p><Link href="/how-made#efficiency">Sources and analysis methods <span aria-hidden="true">↗</span></Link><Link href="/morgue#archive-filters">Find another game <span aria-hidden="true">↗</span></Link></footer>
    </article>
  </main>;
}
