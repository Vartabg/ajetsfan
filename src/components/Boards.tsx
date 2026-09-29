"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Game } from "@/lib/games";
import { pct } from "@/lib/games";
import { archiveBoard, archiveFilters, filterArchive, gameHref } from "@/lib/explorer";
import SwingCurve from "./SwingCurve";
import styles from "./Boards.module.css";

export default function Boards({ heartbreak, miracle }: { heartbreak: Game[]; miracle: Game[] }) {
  const params = useSearchParams();
  const [visibleCount, setVisibleCount] = useState(24);
  const [copyState, setCopyState] = useState("");
  const games = useMemo(() => [...heartbreak, ...miracle], [heartbreak, miracle]);
  const queryParams = new URLSearchParams(params.toString());
  const board = archiveBoard(queryParams, games);
  const filters = archiveFilters(queryParams);
  const list = filterArchive(games, board, filters);
  const selected = list.find((game) => game.id === params.get("game")) ?? list[0];
  const seasons = [...new Set(games.map((game) => game.season))].sort((a, b) => b - a);
  const opponents = [...new Set(games.map((game) => game.opponentDisplay))].sort();
  const activeFilters = filters.season !== "all" || filters.opponent !== "all" || filters.query !== "" || filters.sort !== "swing";
  const missingSelection = !!params.get("game") && !list.some((game) => game.id === params.get("game"));

  function update(changes: Record<string, string | null>, replace = false) {
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
    if (Object.keys(changes).some((key) => key !== "game")) setVisibleCount(24);
    setCopyState("");
  }

  function reset() {
    update({ season: null, opponent: null, q: null, sort: null, game: null });
  }

  async function copyLink() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(new URL(gameHref(selected.id, board), window.location.origin).href);
      setCopyState("Game link copied.");
    } catch {
      setCopyState("Use the game link beside this button to share this selection.");
    }
  }

  return (
    <section className={styles.wrap} aria-label="Game explorer">
      <div className={styles.controls}>
        <div className={styles.toggle} role="group" aria-label="Probability ranking">
          {(["heartbreak", "miracle"] as const).map((value) => <button type="button" key={value} aria-pressed={board === value} className={`${styles.tab} ${board === value ? styles.tabOn : ""}`} onClick={() => update({ board: value, game: null })}>{value === "heartbreak" ? "Heartbreak" : "Miracles"}<span>{value === "heartbreak" ? heartbreak.length : miracle.length}</span></button>)}
        </div>
        <p className={styles.explainer}>{board === "heartbreak" ? "The highest second-half chance to win, in a game they lost." : "The lowest second-half chance to win, in a game they won."}</p>
      </div>

      <div className={styles.filters}>
        <label>Season<select value={filters.season} onChange={(event) => update({ season: event.target.value })}><option value="all">All seasons</option>{seasons.map((season) => <option key={season} value={season}>{season}</option>)}</select></label>
        <label>Opponent<select value={filters.opponent} onChange={(event) => update({ opponent: event.target.value })}><option value="all">All opponents</option>{opponents.map((opponent) => <option key={opponent} value={opponent}>{opponent}</option>)}</select></label>
        <label className={styles.search}>Search games<input type="search" value={filters.query} placeholder="Team, year or a play…" onChange={(event) => update({ q: event.target.value }, true)} /></label>
        <label>Sort by<select value={filters.sort} onChange={(event) => update({ sort: event.target.value })}><option value="swing">Most extreme</option><option value="recent">Newest first</option><option value="oldest">Oldest first</option></select></label>
      </div>

      <div className={styles.resultsBar}><p aria-live="polite"><strong>{list.length}</strong> {list.length === 1 ? "game" : "games"} found</p>{activeFilters ? <button type="button" className={styles.reset} onClick={reset}>Reset filters</button> : null}</div>
      {missingSelection ? <p className={styles.selectionNote}>The linked game is unavailable in this selection. {selected ? "Showing the first matching game." : "Reset filters to explore the archive."}</p> : null}

      {!selected ? <div className={styles.empty}><h2>No games match.</h2><p>Try another season, opponent or search term.</p><button type="button" onClick={reset}>Reset filters</button></div> : (
        <div className={styles.split}>
          <div className={styles.detail}>
            <SwingCurve game={selected} board={board} />
            <div className={styles.share}><a href={gameHref(selected.id, board)}>Game permalink <span aria-hidden="true">↗</span></a><button type="button" onClick={copyLink}>Copy game link</button><span role="status">{copyState}</span></div>
          </div>
          <div className={styles.gameList}>
            <ol className={styles.list} aria-label="Matching games">
              {list.slice(0, visibleCount).map((game, index) => <li key={game.id}><button type="button" className={`${styles.row} ${game.id === selected.id ? styles.rowOn : ""}`} aria-pressed={game.id === selected.id} aria-label={`Select ${game.date} ${game.atHome ? "vs" : "at"} ${game.opponentDisplay}, Jets ${game.jetsScore}–${game.oppScore}, ${pct(game.swing)}`} onClick={() => update({ game: game.id })}><span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span><span className={styles.meta}><strong className={styles.matchup}>{game.atHome ? "vs" : "at"} {game.opponentDisplay}</strong><span className={styles.date}>{game.date} · Wk {game.week}{game.wentToOt ? " · OT" : ""}{game.seasonType !== "REG" ? " · playoffs" : ""}</span><span className={styles.score}>Jets {game.jetsScore} · {game.opponentDisplay} {game.oppScore}</span></span><span className={styles.numbers}><strong>{pct(game.swing)}</strong><small>{board === "heartbreak" ? "peak chance" : "lowest chance"}</small></span></button></li>)}
            </ol>
            {list.length > visibleCount ? <button className={styles.more} type="button" onClick={() => setVisibleCount((count) => count + 24)}>Show {Math.min(24, list.length - visibleCount)} more games <span aria-hidden="true">↓</span></button> : null}
          </div>
        </div>
      )}
    </section>
  );
}
