"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore, type CSSProperties } from "react";
import { formatDate } from "@/lib/current";
import { pct } from "@/lib/games";
import { formatMediaDate, mediaForSeason, type MediaOutlet } from "@/lib/media";
import { phaseResults, seasonNumbers, type ArchivePhase, type ArchiveSeason } from "@/lib/season-archive";
import type { SeasonRankings as SeasonRankingsData } from "@/lib/season-rankings";
import type { NextGenSeason } from "@/lib/nextgen-stats";
import SeasonRankings from "./SeasonRankings";
import AdvancedSeasonStats from "./AdvancedSeasonStats";
import styles from "./SeasonArchive.module.css";

const eventName = "ajetsfan:season-filter";
const phases: { value: ArchivePhase; label: string }[] = [{ value: "all", label: "Entire season" }, { value: "regular", label: "Regular season" }, { value: "playoffs", label: "Playoffs" }];
const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify); window.addEventListener(eventName, notify);
  return () => { window.removeEventListener("popstate", notify); window.removeEventListener(eventName, notify); };
};
const snapshot = () => window.location.search;
const serverSnapshot = () => "";
function change(patch: Record<string, string>, replace = false) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(patch)) if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  if (url.href === window.location.href) return;
  window.history[replace ? "replaceState" : "pushState"](window.history.state, "", url);
  window.dispatchEvent(new Event(eventName));
}

export default function SeasonArchive({ season, years, outlets, rankings = null, nextgen = null, nextgenCheckedAt = null }: { season: ArchiveSeason; years: number[]; outlets: MediaOutlet[]; rankings?: SeasonRankingsData | null; nextgen?: NextGenSeason | null; nextgenCheckedAt?: string | null }) {
  const location = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const params = useMemo(() => new URLSearchParams(location), [location]);
  const requested = params.get("phase");
  const phase: ArchivePhase = requested === "regular" || requested === "playoffs" ? requested : "all";
  const query = (params.get("q") ?? "").slice(0, 160);
  const matches = (value: string) => value.toLowerCase().includes(query.toLowerCase());
  const results = phaseResults(season, phase);
  const numbers = seasonNumbers(results);
  const visible = results.filter((game) => matches(`${game.opponent} ${game.opponentDisplay} ${game.date} week ${game.week} ${game.outcome} ${game.jetsScore} ${game.oppScore}`));
  const facts = season.facts.filter((fact) => (phase === "all" || fact.phase === phase) && matches(`${fact.title} ${fact.text}`));
  const media = mediaForSeason(season.media, season.year, phase).filter((item) => matches(`${item.title} ${item.summary} ${item.author} ${outlets.find((outlet) => outlet.id === item.outletId)?.name ?? ""}`));
  const caseById = new Map(season.cases.map((game) => [game.id, game]));
  const scale = Math.max(1, ...results.map((game) => Math.abs(game.jetsScore - game.oppScore)));
  const phaseLabel = phases.find((item) => item.value === phase)!.label;
  const regular = seasonNumbers(phaseResults(season, "regular"));
  const playoffs = seasonNumbers(phaseResults(season, "playoffs"));

  return <div className={styles.archive} data-season-archive={season.year} data-season-phase={phase}>
    <div className={styles.controls}>
      <label className={styles.year}>Football season<select data-season-year value={season.year} onChange={(event) => {
        const year = Number(event.target.value);
        if (years.includes(year)) { const url = new URL(`/seasons/${year}`, window.location.origin); if (phase !== "all") url.searchParams.set("phase", phase); window.location.assign(url); }
      }}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      <div className={styles.phase} role="group" aria-label="Season phase">{phases.map((item) => <button type="button" key={item.value} data-season-scope={item.value} aria-pressed={phase === item.value} onClick={() => change({ phase: item.value === "all" ? "" : item.value })}>{item.label}</button>)}</div>
      <label className={styles.search}>Find within {season.year}<input data-season-search type="search" value={query} placeholder="Opponent, date, player, story…" maxLength={160} onChange={(event) => change({ q: event.target.value }, true)} /></label>
    </div>
    <p className={styles.boundary}>Football seasons cross New Year’s Day. January playoff games stay with the season that began the previous fall.</p>
    <nav className={styles.jump} aria-label="In this season"><a href="#season-rankings">League ranks</a><a href="#advanced-evidence">Tracking &amp; grades</a><a href="#season-results-heading">Game evidence</a><a href="#season-memories-heading">Sourced moments</a><a href="#season-media-heading">Reporting &amp; replay</a></nav>
    <section className={styles.numbers} aria-label={`${phaseLabel} recorded totals`} data-season-totals>
      <div><span>{phaseLabel} record</span><strong data-season-record>{numbers.games ? `${numbers.wins}–${numbers.losses}${numbers.ties ? `–${numbers.ties}` : ""}` : "—"}</strong><small>{numbers.games} recorded finals{season.current ? " · season in progress" : ""}</small></div>
      <div><span>Points scored</span><strong>{numbers.games ? numbers.scored : "—"}</strong><small>{numbers.pointsPerGame?.toFixed(1) ?? "—"} per game</small></div>
      <div><span>Points allowed</span><strong>{numbers.games ? numbers.allowed : "—"}</strong><small>{numbers.games ? (numbers.allowed / numbers.games).toFixed(1) : "—"} per game</small></div>
      <div><span>Scoring margin</span><strong>{numbers.games ? `${numbers.differential > 0 ? "+" : ""}${numbers.differential}` : "—"}</strong><small>Points scored minus allowed</small></div>
    </section>
    <p className={styles.note}>Totals cover all recorded {phaseLabel.toLowerCase()} finals; search filters the content below. {phase === "all" && regular.games && playoffs.games ? `Regular season: ${regular.wins}–${regular.losses}${regular.ties ? `–${regular.ties}` : ""}. Playoffs: ${playoffs.wins}–${playoffs.losses}.` : ""}</p>
    {!season.results.length ? <p className={styles.gap}>This year has selected historical sources. Full season results, player totals and play-by-play are not in this archive yet.</p> : null}
    <SeasonRankings rankings={rankings} phase={phase} year={season.year} />
    <AdvancedSeasonStats year={season.year} phase={phase} nextgen={nextgen} checkedAt={nextgenCheckedAt} />
    <section className={styles.evidence} aria-labelledby="season-results-heading">
      <header className={styles.sectionHead}><div><p className={styles.kicker}>{phaseLabel} · final scores</p><h2 id="season-results-heading" className="hed">The season, game by game.</h2></div><p role="status" data-season-results-count>{visible.length} of {results.length} finals shown</p></header>
      {visible.length ? <><div className={styles.chartLegend}><span>← Loss margin</span><span>Jets win margin →</span></div><ol className={styles.games} aria-label="Final scores and scoring margins">{visible.map((game) => {
        const margin = game.jetsScore - game.oppScore, analysis = caseById.get(game.id);
        return <li key={game.id} data-season-game={game.id}>
          <div className={styles.fixture}><strong>{game.atHome ? "vs" : "at"} {game.opponentDisplay}</strong><small>{game.seasonType === "POST" ? "Playoffs" : `Week ${game.week}`} · <time dateTime={game.date}>{formatDate(game.date)}</time></small></div>
          <div className={styles.marginTrack} aria-hidden="true"><span className={`${styles.marginBar} ${margin < 0 ? styles.loss : ""}`} style={{ "--bar": `${Math.abs(margin) / scale * 50}%` } as CSSProperties} /><b className={margin < 0 ? styles.negative : ""}>{margin > 0 ? "+" : ""}{margin}</b></div>
          <div className={styles.score}><strong>{game.outcome === "win" ? "W" : game.outcome === "loss" ? "L" : "T"} {game.jetsScore}–{game.oppScore}</strong><span className="sr-only">Jets {game.jetsScore}, {game.opponentDisplay} {game.oppScore}; scoring margin {margin > 0 ? "+" : ""}{margin} points.</span>{analysis ? <Link data-season-case={game.id} href={`/games/${encodeURIComponent(game.id)}`}>Game evidence <span aria-hidden="true">↗</span><span className="sr-only"> for {game.opponentDisplay}, {formatDate(game.date)}</span></Link> : <small>Usable analysis unavailable</small>}</div>
          {analysis ? <p className={styles.gameNote}>{analysis.outcome === "win" ? "Lowest" : "Highest"} second-half Jets pre-play win probability: <strong>{pct(analysis.swing)}</strong>. Model estimate.</p> : null}
        </li>;
      })}</ol><p className={styles.note}>Bar lengths show the final points difference on a shared scale within the selected phase. Sources: <a href="https://github.com/nflverse/nflverse-data/releases/tag/pbp" target="_blank" rel="noreferrer">nflverse play-by-play<span className="sr-only"> (opens in a new tab)</span></a> for archived finals; <a href="https://github.com/nflverse/nfldata/blob/master/data/games.csv" target="_blank" rel="noreferrer">schedule and results<span className="sr-only"> (opens in a new tab)</span></a> for current finals and checks on newly ingested analysis. Game evidence opens the recorded probability curve and key play where usable analysis exists.</p></> : <p className={styles.gap} data-season-no-games>{query ? "No finals match this search." : phase === "playoffs" ? "No playoff finals are recorded for this season in this edition." : "No final scores are recorded for this selection."}</p>}
      {numbers.games ? <div className={styles.derived}><p><strong>{numbers.oneScore}</strong> games finished within eight points.<small>Final margin ≤ 8, including ties; this does not describe how close each game was throughout.</small></p>{numbers.biggestWin ? <p><strong>+{numbers.biggestWin.jetsScore - numbers.biggestWin.oppScore}</strong> largest recorded win margin.<small>{numbers.biggestWin.atHome ? "vs" : "at"} {numbers.biggestWin.opponentDisplay} · {formatDate(numbers.biggestWin.date)}</small></p> : null}</div> : null}
    </section>
    <section className={styles.memories} aria-labelledby="season-memories-heading"><header className={styles.sectionHead}><div><p className={styles.kicker}>Plays, moments and sourced facts</p><h2 id="season-memories-heading" className="hed">What stays with you.</h2></div></header>{facts.length ? <div className={styles.facts}>{facts.map((fact) => <article key={fact.id} data-season-fact={fact.id}><span>{fact.phase === "playoffs" ? "Playoffs" : "Regular season"}</span><h3>{fact.title}</h3><p>{fact.text}</p><a href={fact.url} target="_blank" rel="noreferrer">{fact.source}<span className="sr-only"> (opens in a new tab)</span> ↗</a>{fact.href ? <Link href={fact.href}>Study the evidence ↗</Link> : null}</article>)}</div> : <p className={styles.gap}>No editorial facts match this selection yet. Recorded game evidence remains available above.</p>}</section>
    <section className={styles.media} aria-labelledby="season-media-heading"><header className={styles.sectionHead}><div><p className={styles.kicker}>Explicitly tagged to the {season.year} season</p><h2 id="season-media-heading" className="hed">The reporting. The replay.</h2></div><Link href={`/media?season=${season.year}`}>Open Media Room ↗</Link></header>{media.length ? <div className={styles.mediaList}>{media.map((item) => <article key={item.id} data-season-media={item.id}><p>{outlets.find((outlet) => outlet.id === item.outletId)?.name} · {item.author}</p><h3><Link href={`/media?season=${season.year}&media=${encodeURIComponent(item.id)}`}>{item.title} ↗</Link></h3><p>{item.summary}</p><small>{item.publishedAt ? `Published ${formatMediaDate(item.publishedAt)}` : "Publication date unavailable"} · {item.context === "archive" ? "Archive selection" : "Current collection"}</small><a href={item.url} target="_blank" rel="noreferrer">Original source ↗<span className="sr-only"> (opens in a new tab)</span></a></article>)}</div> : <p className={styles.gap}>No reporting has been cataloged for this selection yet. Today’s headlines are kept in their own season.</p>}</section>
    <footer className={styles.footer}><p>Historical game coverage begins in 1999. Earlier years currently contain selected source-backed moments. {rankings ? 'Team and player ranks use the league samples shown above. Historical EPA splits are not included yet.' : 'Historical player totals and EPA splits are not available here yet.'}</p>{season.current ? <Link href="/team#season-leaders">Current-season player statistics ↗</Link> : null}<Link href="/how-made">Sources and methods ↗</Link><Link href="/seasons">All available seasons ↗</Link></footer>
  </div>;
}
