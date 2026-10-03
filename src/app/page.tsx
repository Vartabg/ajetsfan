import Link from "@/components/IntentLink";
import Image from "next/image";
import { pageMetadata } from "@/lib/site";
import { loadGames, loadCurrent } from "@/lib/load-games";
import { currentSeasonSummary, formatCheckedAt, formatDate, nextScheduledGame, selectLead } from "@/lib/current";
import { publishedGames } from "@/lib/published-pages";
import EditorialPhoto from "@/components/EditorialPhoto";
import { gameEditorialPhoto } from "@/lib/editorial-photos";
import DataFreshness from "@/components/DataFreshness";
import { FIELD, offensiveFormations, defensiveFormations } from "@/lib/playbook";
import { jetsPlays } from "@/lib/jets-playbook";
import styles from "./page.module.css";

export const metadata = pageMetadata({ path: "/", title: "The Back Page — a Jets fan", description: "The latest Jets result, the next game, and a way into every season. News, players, film and the games you remember." });

export default async function BackPage() {
  const [games, snapshot] = await Promise.all([loadGames(), loadCurrent()]);
  const lead = selectLead(games, snapshot);
  const result = lead.result;
  const analysis = lead.analysisStatus === "ready" ? lead.analysis : null;
  const gamePhoto = result ? gameEditorialPhoto(result.id) : null;
  const summary = currentSeasonSummary(snapshot);
  const next = nextScheduledGame(snapshot);
  const lost = result?.outcome === "loss";
  const tied = result?.outcome === "tie";
  const margin = result ? Math.abs(result.jetsScore - result.oppScore) : 0;
  const headline = !result ? "Jets football." : tied ? "Jets tie." : lost ? "Jets lose." : "Jets win.";
  const resultSummary = !result ? "Results, players and the next game." : `${tied ? "A tied final" : `A ${margin}-point ${lost ? "loss" : "win"}`} ${result.atHome ? "at home" : "on the road"}.`;
  const reportHref = result && publishedGames(games, snapshot).some((game) => game.id === result.id)
    ? `/games/${encodeURIComponent(result.id)}` : `/seasons/${snapshot?.season ?? result?.season ?? 2026}`;
  return (
    <main id="main" className={styles.main}>
      {snapshot ? <DataFreshness checkedAt={snapshot.checkedAt} /> : null}
      <article id="latest-game" className={styles.edition}>
        <div className={styles.cover}>
          <div className={styles.editionLine}><p>{lead.kind === "archive" ? "From the archive · no current-season final in this edition" : result ? `Latest final · Week ${result.week}${result.seasonType === "POST" ? " · playoffs" : ""}` : "The current edition"}</p>{result ? <span className={styles.mobileFinal}>NYJ {result.jetsScore} <span aria-hidden="true">—</span> {result.opponentDisplay} {result.oppScore}</span> : null}<span className={styles.readerNote}>Scores. Plays. Probability.</span></div>
          <div className={`${styles.coverBody} ${!result ? styles.copyOnly : !gamePhoto ? styles.scoreOnly : ""}`}>
            <div className={styles.coverCopy}>
              <span className={styles.voiceLabel}>{result ? "Confirmed result" : "Source-led coverage"}</span>
              <h1 className="hed"><span>{headline}</span>{result ? <em>{result.jetsScore}–{result.oppScore}.</em> : null}</h1>
              <p>{resultSummary}</p>
              {result ? <Link href={reportHref} className={styles.coverLink}>{reportHref.startsWith("/games/") ? "Read the game report" : "View season results"} <span aria-hidden="true">→</span></Link> : <Link href="/team" className={styles.coverLink}>Current team coverage <span aria-hidden="true">↗</span></Link>}
            </div>
            <div className={styles.coverVisual}>{gamePhoto ? <EditorialPhoto photo={gamePhoto} sizes="(max-width: 640px) calc(100vw - 2rem), (max-width: 900px) calc(55vw - 2.6125rem), (max-width: 1288px) calc(55vw - 3.3rem), 656px" eager /> : null}
            {result ? <div className={styles.scoreboard} aria-label={`Final score: Jets ${result.jetsScore}, ${result.opponentDisplay} ${result.oppScore}`}>
              <span className={styles.finalLabel}>Final{analysis?.wentToOt ? " / OT" : ""}</span>
              <div className={styles.scoreRow}><b>NYJ</b><strong>{result.jetsScore}</strong></div>
              <div className={styles.scoreRow}><b>{result.opponentDisplay}</b><strong>{result.oppScore}</strong></div>
              <p className="sr-only">Jets {result.jetsScore}, {result.opponentDisplay} {result.oppScore}</p>
              <time dateTime={result.date}>{formatDate(result.date)}</time>
              <small>{result.atHome ? "At home" : "On the road"}</small>
            </div> : null}</div>
          </div>
        </div>
      </article>
      {snapshot ? <section className={styles.now} aria-label={`The ${snapshot.season} season`}>
        <Link href={`/seasons/${snapshot.season}`}><span className={styles.kicker}>{snapshot.season} season</span><strong>{summary.wins}–{summary.losses}{summary.ties ? `–${summary.ties}` : ""}</strong><span>Results & rankings <span aria-hidden="true">→</span></span></Link>
        <Link href="/game-day"><span className={styles.kicker}>Up next</span><strong>{next ? `Jets ${next.game.atHome ? "vs" : "at"} ${next.game.opponentDisplay}` : "Game day"}</strong><span>{next ? `Week ${next.game.week} · ${formatDate(next.game.date)}` : "Schedule & season form"} <span aria-hidden="true">→</span></span></Link>
        <Link href="/team"><span className={styles.kicker}>The team</span><strong>Who’s making plays?</strong><span>Roster, player stats & news <span aria-hidden="true">→</span></span></Link>
      </section> : null}
      <section className={styles.exploreRooms} aria-label="Explore Jets reporting and seasons">
        <Link href="/media" className={styles.mediaDoor}><div className={styles.mediaPoster}><Image src="https://i.ytimg.com/vi/s657QMErTG4/hqdefault.jpg" alt="Original SNY Jets Game Plan video thumbnail" fill sizes="(max-width: 640px) calc(100vw - 34px), (max-width: 1288px) calc(50vw - 36px), 609px" /><span>SNY · Jets Game Plan</span></div><div><h2 className="hed">Media Room <span aria-hidden="true">↗</span></h2><p>Beat reporting, radio, video and replay.</p></div></Link>
        <Link href="/seasons" className={styles.seasonDoor}><h2 className="hed">Your year.<br />Your Jets.</h2><div className={styles.yearStrip} aria-hidden="true"><span>1968</span><span>2002</span><span>2010</span><span>{snapshot?.season ?? "2026"}</span></div><p>Pick a season. Explore its games and players.</p><strong>Season archive <span aria-hidden="true">↗</span></strong></Link>
        <Link href="/film-room" className={styles.filmDoor}><div className={styles.formationPoster} aria-hidden="true"><svg viewBox={`0 0 ${FIELD.width} ${FIELD.height}`}><g stroke="#c8d5bd50" strokeWidth="3">{[120,240,360,480].map((y) => <line key={y} x1="40" x2="960" y1={y} y2={y} />)}</g><line x1="40" x2="960" y1={FIELD.lineOfScrimmage} y2={FIELD.lineOfScrimmage} stroke="#d7eb70" strokeWidth="5" />{offensiveFormations[0].players.map((player) => <circle key={player.id} cx={player.x} cy={player.y} r="17" fill="#f8f5ed" stroke="#064c32" strokeWidth="3" />)}</svg><span>{offensiveFormations[0].label} schematic</span></div><div><h2 className="hed">Film Room <span aria-hidden="true">↗</span></h2><p>Draw a play. Run it back.</p><small>{offensiveFormations.length + defensiveFormations.length} formations · {jetsPlays.length} Jets studies</small></div></Link>
        <Link href="/morgue" className={styles.archiveDoor}><p className={styles.kicker}>The game archive</p><h2 className="hed">The Morgue <span aria-hidden="true">↗</span></h2><p>Great finishes. Brutal endings.</p><small>Games ranked by second-half model probability.</small></Link>
      </section>
      <nav className={styles.further} aria-label="More ways to explore"><Link href="/stories">Visual game stories <span aria-hidden="true">→</span></Link><Link href="/history">Jets history <span aria-hidden="true">→</span></Link></nav>
      <section className={styles.freshness} aria-label="Data freshness"><span>{snapshot ? `${snapshot.season} edition` : "The analyzed archive"}</span><span>{snapshot ? <>Results checked <time dateTime={snapshot.checkedAt}>{formatCheckedAt(snapshot.checkedAt)}</time></> : "Current-season results unavailable in this edition."}</span><Link href="/how-made">Sources &amp; how it works</Link></section>
    </main>
  );
}
