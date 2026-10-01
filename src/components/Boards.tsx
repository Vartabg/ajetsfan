"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Game } from "@/lib/games";
import { pct } from "@/lib/games";
import { formatDate } from "@/lib/current";
import { archiveBoard, archiveFilters, filterArchive, gameHref } from "@/lib/explorer";
import SwingCurve from "./SwingCurve";
import styles from "./Boards.module.css";

export default function Boards({ heartbreak, miracle, caseIds = [] }: { heartbreak: Game[]; miracle: Game[]; caseIds?: string[] }) {
  const params = useSearchParams();
  const [visibleCount, setVisibleCount] = useState(24);
  const [sharing, setSharing] = useState<{ query: string; message: string } | null>(null);
  const caseHeading = useRef<HTMLHeadingElement>(null);
  const archiveHeading = useRef<HTMLHeadingElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const resultsSummary = useRef<HTMLParagraphElement>(null);
  const copyRequest = useRef(0);
  const focusGameId = useRef<string | null>(null);
  const focusResult = useRef<{ gameId: string; query: string; block: ScrollLogicalPosition } | null>(null);
  const games = useMemo(() => [...heartbreak, ...miracle], [heartbreak, miracle]);
  const queryKey = params.toString();
  const queryParams = new URLSearchParams(queryKey);
  const board = archiveBoard(queryParams, games);
  const filters = archiveFilters(queryParams);
  const list = filterArchive(games, board, filters);
  const selected = list.find((game) => game.id === params.get("game")) ?? list[0];
  const seasons = [...new Set(games.map((game) => game.season))].sort((a, b) => b - a);
  const opponents = [...new Set(games.map((game) => game.opponentDisplay))].sort();
  const activeFilters = filters.season !== "all" || filters.opponent !== "all" || filters.query !== "" || filters.sort !== "swing";
  const missingSelection = !!params.get("game") && !list.some((game) => game.id === params.get("game"));
  const copyState = sharing?.query === params.toString() ? sharing.message : "";

  useEffect(() => {
    if (selected?.id === focusGameId.current && caseHeading.current) {
      caseHeading.current.focus({ preventScroll: true });
      caseHeading.current.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      focusGameId.current = null;
    }
  }, [selected?.id]);

  useEffect(() => {
    const pending = focusResult.current;
    if (!pending) return;
    if (pending.query !== queryKey) {
      focusResult.current = null;
      return;
    }
    const row = document.getElementById(`archive-game-${pending.gameId}`);
    if (row) {
      focusResult.current = null;
      row.focus({ preventScroll: true });
      row.scrollIntoView({ block: pending.block, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  }, [visibleCount, queryKey]);

  function update(changes: Record<string, string | null>, replace = false) {
    focusResult.current = null;
    const next = new URLSearchParams(params.toString());
    next.set("board", board);
    for (const [key, value] of Object.entries(changes)) {
      if (value && value !== "all") next.set(key, value);
      else next.delete(key);
    }
    // A narrower result set should not replace a game that still belongs to it.
    const selectedId = next.get("game");
    if (selectedId && !filterArchive(games, archiveBoard(next, games), archiveFilters(next)).some((game) => game.id === selectedId)) {
      next.delete("game");
    }
    window.history[replace ? "replaceState" : "pushState"](null, "", `/morgue?${next.toString()}`);
    if (Object.keys(changes).some((key) => key !== "game")) {
      setVisibleCount(24);
      focusGameId.current = null;
    }
    copyRequest.current += 1;
    setSharing(null);
  }

  function reset() {
    update({ season: null, opponent: null, q: null, sort: null, game: null });
  }

  function selectGame(game: Game) {
    if (selected?.id === game.id && caseHeading.current) {
      if (params.get("game") !== game.id) update({ game: game.id });
      caseHeading.current.focus({ preventScroll: true });
      caseHeading.current.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
    }
    focusGameId.current = game.id;
    update({ game: game.id });
  }

  function moveTo(element: HTMLElement | null, block: ScrollLogicalPosition = "start") {
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function findGame() {
    searchInput.current?.focus({ preventScroll: true });
    archiveHeading.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function backToResults() {
    const row = selected ? document.getElementById(`archive-game-${selected.id}`) : null;
    if (row) moveTo(row, "center");
    else if (selected) {
      const index = list.findIndex((game) => game.id === selected.id);
      focusResult.current = { gameId: selected.id, query: queryKey, block: "center" };
      setVisibleCount((count) => Math.max(count, Math.min(list.length, Math.ceil((index + 1) / 24) * 24)));
    } else moveTo(resultsSummary.current);
  }

  function showMore(keyboard: boolean) {
    const firstAdded = list[visibleCount];
    focusResult.current = keyboard && firstAdded ? { gameId: firstAdded.id, query: queryKey, block: "start" } : null;
    setVisibleCount((count) => Math.min(list.length, count + 24));
  }

  function clearSearch() {
    update({ q: null }, true);
    searchInput.current?.focus({ preventScroll: true });
  }

  async function copyLink() {
    if (!selected) return;
    const request = ++copyRequest.current;
    const query = params.toString();
    const stillCurrent = () => request === copyRequest.current && new URLSearchParams(window.location.search).toString() === query;
    try {
      await navigator.clipboard.writeText(new URL(gameHref(selected.id, board), window.location.origin).href);
      if (stillCurrent()) setSharing({ query, message: "Game link copied." });
    } catch {
      if (stillCurrent()) setSharing({ query, message: "Copy failed. Use the game permalink to share this game." });
    }
  }

  return (
    <section className={styles.wrap} data-board={board} aria-label="Game explorer">
      <div className={styles.controls}>
        <div className={styles.toggle} role="group" aria-label="Probability ranking">
          {(["heartbreak", "miracle"] as const).map((value) => <button type="button" key={value} aria-pressed={board === value} className={`${styles.tab} ${board === value ? styles.tabOn : ""}`} onClick={() => update({ board: value, game: null })}><span className={styles.chapterIndex} aria-hidden="true">{value === "heartbreak" ? "I" : "II"}</span><span className={styles.chapterTitle}>{value === "heartbreak" ? "Heartbreak" : "Miracles"}</span><span className={styles.chapterLine}>{value === "heartbreak" ? "Please stop the tape." : "The games that keep us coming back."}</span><span className={styles.chapterCount}>{value === "heartbreak" ? `${heartbreak.length} losses` : `${miracle.length} wins`} <span aria-hidden="true">{board === value ? "✓" : "→"}</span></span></button>)}
        </div>
        <p className={styles.explainer}>{board === "heartbreak" ? "Losses ordered by the highest chance the Jets had to win in the second half." : "Wins ordered by the lowest chance the Jets had to win in the second half."} <a href="/how-made">How the order works</a></p>
        <div className={styles.archiveNav}><button type="button" onClick={findGame} aria-controls="archive-filters">Find a game <span aria-hidden="true">↓</span></button><span>Season, opponent or the play you remember.</span></div>
      </div>

      {missingSelection ? <p className={styles.selectionNote}>The linked game is unavailable in this selection. {selected ? "Showing the first matching game." : "Reset filters to explore the archive."}</p> : null}
      {selected ? <div className={styles.detail}>
        <SwingCurve game={selected} board={board} headingRef={caseHeading} />
        <div className={styles.share}>{caseIds.includes(selected.id) ? <a href={`/games/${encodeURIComponent(selected.id)}`}>Read the game case <span aria-hidden="true">↗</span></a> : null}<a href={gameHref(selected.id, board)}>Game permalink <span aria-hidden="true">↗</span></a><button type="button" aria-label={copyState === "Game link copied." ? "Game link copied" : "Copy game link"} className={copyState === "Game link copied." ? styles.copied : ""} onClick={copyLink}>{copyState === "Game link copied." ? "Copied" : "Copy game link"}</button><button type="button" className={styles.backToResults} onClick={backToResults} aria-controls="archive-results">Back to results <span aria-hidden="true">↓</span></button><span role="status" aria-label="Game link sharing">{copyState}</span></div>
      </div> : null}

      <div className={styles.archiveHead}><h2 ref={archiveHeading}>{board === "heartbreak" ? "Find your particular pain." : "Find a reason to believe."}</h2><p>Pick a game. We kept the tape.</p></div>
      <div id="archive-filters" className={styles.filters}>
        <label>Season<select value={filters.season} onChange={(event) => update({ season: event.target.value })}><option value="all">All seasons</option>{seasons.map((season) => <option key={season} value={season}>{season}</option>)}</select></label>
        <label>Opponent<select value={filters.opponent} onChange={(event) => update({ opponent: event.target.value })}><option value="all">All opponents</option>{opponents.map((opponent) => <option key={opponent} value={opponent}>{opponent}</option>)}</select></label>
        <div className={styles.search}><label htmlFor="archive-search">Search games</label><div className={styles.searchControl}><input id="archive-search" ref={searchInput} type="search" value={filters.query} placeholder="Team, year or the play you remember…" onChange={(event) => update({ q: event.target.value }, true)} />{filters.query ? <button type="button" onClick={clearSearch} aria-label="Clear search"><span aria-hidden="true">×</span></button> : null}</div></div>
        <label>Sort by<select value={filters.sort} onChange={(event) => update({ sort: event.target.value })}><option value="swing">Most extreme</option><option value="recent">Newest first</option><option value="oldest">Oldest first</option></select></label>
      </div>

      <div className={styles.resultsBar}><p id="archive-results" ref={resultsSummary} tabIndex={-1} aria-live="polite" aria-atomic="true"><strong>{list.length}</strong> {list.length === 1 ? "game" : "games"} found · {Math.min(visibleCount, list.length)} shown.</p>{activeFilters ? <button type="button" className={styles.reset} onClick={reset}>Reset filters</button> : null}</div>
      {!selected ? <div className={styles.empty}><h2>No games match.</h2><p>Try another season, opponent or search term.</p><button type="button" onClick={reset}>Reset filters</button></div> : (
          <div className={styles.gameList}>
            <ol className={styles.list} aria-label="Matching games">
              {list.slice(0, visibleCount).map((game, index) => <li key={game.id}><button id={`archive-game-${game.id}`} type="button" className={`${styles.row} ${game.id === selected.id ? styles.rowOn : ""}`} aria-pressed={game.id === selected.id} aria-label={`Select ${game.date} ${game.atHome ? "vs" : "at"} ${game.opponentDisplay}, Jets ${game.jetsScore}–${game.oppScore}, ${pct(game.swing)}`} onClick={() => selectGame(game)}><span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span><span className={styles.meta}><span className={styles.date}><time dateTime={game.date}>{formatDate(game.date)}</time> · Wk {game.week}{game.wentToOt ? " · OT" : ""}{game.seasonType !== "REG" ? " · playoffs" : ""}</span><strong className={styles.matchup}>Jets {game.atHome ? "vs" : "at"} {game.opponentDisplay}</strong><span className={styles.score}>Final: Jets {game.jetsScore} · {game.opponentDisplay} {game.oppScore}</span></span><span className={styles.numbers}><strong>{pct(game.swing)}</strong><small>{board === "heartbreak" ? "peak 2nd-half chance" : "lowest 2nd-half chance"}</small><span className={styles.openGame}>{game.id === selected.id ? "Open now" : "Open game"} <span aria-hidden="true">{game.id === selected.id ? "↑" : "↗"}</span></span></span></button></li>)}
            </ol>
            {list.length > visibleCount ? <button className={styles.more} type="button" onClick={(event) => showMore(event.detail === 0)}>Show {Math.min(24, list.length - visibleCount)} more games <span aria-hidden="true">↓</span></button> : null}
          </div>
      )}
    </section>
  );
}
