"use client";

import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { formatDate } from "@/lib/current";
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
  const events = ["popstate", "hashchange", eventName, "ajetsfan:ranking-filter"];
  events.forEach((event) => window.addEventListener(event, notify));
  return () => events.forEach((event) => window.removeEventListener(event, notify));
};
const snapshot = () => `${window.location.search}${window.location.hash}`;
const serverSnapshot = () => "";
function change(patch: Record<string, string>, replace = false) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(patch)) if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  if (url.href === window.location.href) return;
  window.history[replace ? "replaceState" : "pushState"](null, "", url);
  window.dispatchEvent(new Event(eventName));
}

const chapters = [
  { id: "games", hash: "season-results-heading", label: "Games" },
  { id: "rankings", hash: "season-rankings", label: "League rankings" },
  { id: "tracking", hash: "advanced-evidence", label: "Tracking & grades" },
  { id: "moments", hash: "season-memories-heading", label: "Memorable moments" },
  { id: "media", hash: "season-media-heading", label: "Watch & read" },
] as const;
type Chapter = typeof chapters[number]["id"];
function selectChapter(hash: string) {
  const url = new URL(window.location.href);
  url.hash = hash;
  if (url.href !== window.location.href) window.history.pushState(null, "", url);
  window.dispatchEvent(new Event(eventName));
}
function SeasonChapter({ id, active, label, hint, matchCount, year, phaseLabel, children }: { id: Chapter; active: Chapter | null; label: string; hint: string; matchCount?: number; year: number; phaseLabel: string; children: ReactNode }) {
  const chapter = chapters.find((entry) => entry.id === id)!;
  // Browsers can reveal an anchored native disclosure before React hydrates.
  return <details id={`season-chapter-${id}`} name={`season-${year}`} className={styles.chapter} open={active === id} suppressHydrationWarning data-season-chapter={id}>
    <summary onClick={(event) => { event.preventDefault(); selectChapter(active === id ? "season-explore" : chapter.hash); }}><span><strong>{label}</strong><small>{matchCount != null ? `${matchCount} ${matchCount === 1 ? "match" : "matches"}` : active === id ? `${year} · ${phaseLabel}` : hint}</small></span><span className={styles.chapterSymbol} aria-hidden="true" /></summary>
    <div className={styles.chapterContent}>{children}</div>
  </details>;
}

export default function SeasonArchive({ season, years, outlets, rankings = null, nextgen = null, nextgenCheckedAt = null }: { season: ArchiveSeason; years: number[]; outlets: MediaOutlet[]; rankings?: SeasonRankingsData | null; nextgen?: NextGenSeason | null; nextgenCheckedAt?: string | null }) {
  const location = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const url = useMemo(() => new URL(`/seasons/${season.year}${location}`, "https://ajetsfan.com"), [location, season.year]);
  const params = url.searchParams;
  const active: Chapter | null = url.hash === "#season-explore" ? null : chapters.find((chapter) => url.hash === `#${chapter.hash}` || url.hash === `#season-chapter-${chapter.id}`)?.id ?? "games";
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
  const returnHref = `/seasons/${season.year}${url.search}${url.hash}`;
  const guideHref = `/seasons/${season.year}/guide?${new URLSearchParams({ phase, return: returnHref })}`;
  const studyHref = (href: string) => {
    const destination = new URL(href, "https://ajetsfan.com");
    destination.searchParams.set("from", returnHref);
    return `${destination.pathname}${destination.search}${destination.hash}`;
  };
  const chapterProps = { active, year: season.year, phaseLabel };

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("ajetsfan:season-place");
      if (!raw) return;
      const place = JSON.parse(raw) as { url?: string; y?: number; width?: number; at?: number; link?: string };
      if (place.url !== returnHref || typeof place.at !== "number" || Date.now() - place.at > 30 * 60_000) return;
      let cancelled = false;
      const restore = (attempt = 0) => {
        if (cancelled) return;
        const link = [...document.querySelectorAll<HTMLAnchorElement>("[data-season-archive] a")].find((element) => {
          if (element.getAttribute("href") !== place.link || element.closest("details:not([open]), [hidden]")) return false;
          const bounds = element.getBoundingClientRect();
          return bounds.width > 0 && bounds.height > 0;
        });
        if (!link) {
          if (attempt < 8) window.requestAnimationFrame(() => restore(attempt + 1));
          return;
        }
        sessionStorage.removeItem("ajetsfan:season-place");
        link.focus({ preventScroll: true });
        if (place.width === window.innerWidth && typeof place.y === "number" && Number.isFinite(place.y)) window.scrollTo({ top: Math.max(0, place.y), behavior: "instant" });
        else link.scrollIntoView({ block: "nearest" });
      };
      // Hash-driven chapters and the router settle their layout before focus
      // returns to the link that opened the detail page.
      void document.fonts.ready.then(() => window.requestAnimationFrame(() => window.requestAnimationFrame(() => restore())));
      return () => { cancelled = true; };
    } catch { /* Browsing remains available when local storage is disabled. */ }
  }, [returnHref]);

  return <div className={styles.archive} data-season-archive={season.year} data-season-phase={phase} onClickCapture={(event) => {
    const anchor = (event.target as Element).closest<HTMLAnchorElement>("a");
    if (!anchor || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target === "_blank") return;
    const destination = new URL(anchor.href);
    if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
    try { sessionStorage.setItem("ajetsfan:season-place", JSON.stringify({ url: returnHref, y: window.scrollY, width: window.innerWidth, at: Date.now(), link: anchor.getAttribute("href") })); } catch { /* Optional place restoration. */ }
  }}>
    <div className={styles.controls}>
      <label className={styles.year}>Football season<select data-season-year value={season.year} onChange={(event) => {
        const year = Number(event.target.value);
        if (years.includes(year)) { const next = new URL(`/seasons/${year}`, window.location.origin); if (phase !== "all") next.searchParams.set("phase", phase); next.hash = url.hash; window.location.assign(next); }
      }}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      <div className={styles.phase} role="group" aria-label="Season phase">{phases.map((item) => <button type="button" key={item.value} data-season-scope={item.value} aria-pressed={phase === item.value} onClick={() => change({ phase: item.value === "all" ? "" : item.value })}>{item.label}</button>)}</div>
      <label className={styles.search}>Find within {season.year}<input data-season-search type="search" value={query} placeholder="Opponent, date, story…" maxLength={160} onChange={(event) => change({ q: event.target.value }, true)} /></label>
    </div>
    <section className={styles.numbers} aria-label={`${phaseLabel} recorded totals`} data-season-totals>
      <div><span>{phaseLabel} record</span><strong data-season-record>{numbers.games ? `${numbers.wins}–${numbers.losses}${numbers.ties ? `–${numbers.ties}` : ""}` : "—"}</strong><small>{numbers.games} recorded finals{season.current ? " · season in progress" : ""}</small></div>
      <div><span>Points scored</span><strong>{numbers.games ? numbers.scored : "—"}</strong><small>{numbers.pointsPerGame?.toFixed(1) ?? "—"} per game</small></div>
      <div><span>Points allowed</span><strong>{numbers.games ? numbers.allowed : "—"}</strong><small>{numbers.games ? (numbers.allowed / numbers.games).toFixed(1) : "—"} per game</small></div>
      <div><span>Scoring margin</span><strong>{numbers.games ? `${numbers.differential > 0 ? "+" : ""}${numbers.differential}` : "—"}</strong><small>Points scored minus allowed</small></div>
    </section>
    {phase === "all" && regular.games && playoffs.games ? <p className={styles.note}>Regular season: {regular.wins}–{regular.losses}{regular.ties ? `–${regular.ties}` : ""} · Playoffs: {playoffs.wins}–{playoffs.losses}</p> : null}
    {query ? <p className={styles.searchContext}>Games, moments &amp; coverage matching “{query}” · totals unchanged.<button type="button" onClick={() => change({ q: "" }, true)}>Clear search</button></p> : null}
    {!season.results.length ? <p className={styles.gap}>Selected moments only. Full season results are unavailable.</p> : null}
    <div id="season-explore" className={styles.explore}>
    <SeasonChapter id="games" label="Games" hint={`${results.length} finals · scores & game tape`} matchCount={query ? visible.length : undefined} {...chapterProps}>
    <section className={styles.evidence} aria-labelledby="season-results-heading">
      <header className={styles.sectionHead}><div><p className={styles.kicker}>{phaseLabel} · final scores</p><h2 id="season-results-heading" className="hed">The season, game by game.</h2></div><p role="status" data-season-results-count>{visible.length} of {results.length} finals shown</p></header>
      {visible.length ? <><div className={styles.chartLegend}><span>← Loss margin</span><span>Jets win margin →</span></div><ol className={styles.games} aria-label="Final scores and scoring margins">{visible.map((game) => {
        const margin = game.jetsScore - game.oppScore, analysis = caseById.get(game.id);
        return <li key={game.id} data-season-game={game.id}>
          <div className={styles.fixture}><strong>{game.atHome ? "vs" : "at"} {game.opponentDisplay}</strong><small>{game.seasonType === "POST" ? "Playoffs" : `Week ${game.week}`} · <time dateTime={game.date}>{formatDate(game.date)}</time></small></div>
          <div className={styles.marginTrack} aria-hidden="true"><span className={`${styles.marginBar} ${margin < 0 ? styles.loss : ""}`} style={{ "--bar": `${Math.abs(margin) / scale * 50}%` } as CSSProperties} /><b className={margin < 0 ? styles.negative : ""}>{margin > 0 ? "+" : ""}{margin}</b></div>
          <div className={styles.score}><strong>{game.outcome === "win" ? "W" : game.outcome === "loss" ? "L" : "T"} {game.jetsScore}–{game.oppScore}</strong><span className="sr-only">Jets {game.jetsScore}, {game.opponentDisplay} {game.oppScore}; scoring margin {margin > 0 ? "+" : ""}{margin} points.</span>{analysis ? <Link data-season-case={game.id} href={`/games/${encodeURIComponent(game.id)}?from=${encodeURIComponent(returnHref)}`}>Game tape <span aria-hidden="true">↗</span><span className="sr-only"> for {game.opponentDisplay}, {formatDate(game.date)}</span></Link> : <small>Analysis unavailable</small>}</div>
        </li>;
      })}</ol></> : <p className={styles.gap} data-season-no-games>{query ? "No finals match this search." : phase === "playoffs" ? "No playoff finals are recorded for this season." : "No final scores are recorded for this selection."}</p>}
      {numbers.games ? <div className={styles.derived}><p><strong>{numbers.oneScore}</strong> finals within eight points.</p>{numbers.biggestWin ? <p><strong>+{numbers.biggestWin.jetsScore - numbers.biggestWin.oppScore}</strong> largest win margin.<small>{numbers.biggestWin.atHome ? "vs" : "at"} {numbers.biggestWin.opponentDisplay} · {formatDate(numbers.biggestWin.date)}</small></p> : null}</div> : null}
      <Link className={styles.guideLink} href={`${guideHref}#results`}>About these numbers</Link>
    </section>
    </SeasonChapter>
    <SeasonChapter id="rankings" label="League rankings" hint="The team & its players" {...chapterProps}><SeasonRankings rankings={rankings} phase={phase} year={season.year} guideHref={guideHref} embedded /></SeasonChapter>
    <SeasonChapter id="tracking" label="Tracking & grades" hint="Next Gen Stats · PFF" {...chapterProps}><AdvancedSeasonStats year={season.year} phase={phase} nextgen={nextgen} checkedAt={nextgenCheckedAt} guideHref={guideHref} embedded /></SeasonChapter>
    {season.facts.length ? <SeasonChapter id="moments" label="Memorable moments" hint={`${facts.length} plays & stories`} matchCount={query ? facts.length : undefined} {...chapterProps}>
    <section className={styles.memories} aria-labelledby="season-memories-heading"><header className={styles.sectionHead}><div><p className={styles.kicker}>Plays, moments and sourced facts</p><h2 id="season-memories-heading" className="hed">What stays with you.</h2></div></header>{facts.length ? <div className={styles.facts}>{facts.map((fact) => <article key={fact.id} data-season-fact={fact.id}><span>{fact.phase === "playoffs" ? "Playoffs" : "Regular season"}</span><h3>{fact.title}</h3><p>{fact.text}</p><a href={fact.url} target="_blank" rel="noreferrer">{fact.source}<span className="sr-only"> (opens in a new tab)</span> ↗</a>{fact.href ? <Link href={studyHref(fact.href)}>Study the evidence ↗</Link> : null}</article>)}</div> : <p className={styles.gap}>No editorial facts match this selection yet. Recorded game evidence remains available above.</p>}</section>
    </SeasonChapter> : null}
    <SeasonChapter id="media" label="Watch & read" hint={`${media.length} selections`} matchCount={query ? media.length : undefined} {...chapterProps}>
    <section className={styles.media} aria-labelledby="season-media-heading"><header className={styles.sectionHead}><div><p className={styles.kicker}>{season.year} coverage</p><h2 id="season-media-heading" className="hed">The reporting. The replay.</h2></div><Link href={`/media?season=${season.year}&from=${encodeURIComponent(returnHref)}`}>Open Media Room ↗</Link></header>{media.length ? <div className={styles.mediaList}>{media.map((item) => <article key={item.id} data-season-media={item.id}><p>{outlets.find((outlet) => outlet.id === item.outletId)?.name} · {item.author}</p><h3><Link href={`/media?season=${season.year}&media=${encodeURIComponent(item.id)}&from=${encodeURIComponent(returnHref)}`}>{item.title} ↗</Link></h3><small>{item.publishedAt ? formatMediaDate(item.publishedAt) : "Date unavailable"}</small></article>)}</div> : <p className={styles.gap}>No reporting matches this selection.</p>}</section>
    </SeasonChapter>
    </div>
    <footer className={styles.footer}>{season.current ? <Link href="/team#season-leaders">Current-season players ↗</Link> : null}<Link href={guideHref}>Sources & definitions</Link><Link href="/seasons">All seasons</Link></footer>
  </div>;
}
