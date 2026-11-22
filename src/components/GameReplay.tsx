"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { formatDate } from "@/lib/current";
import { replayHref, replayView, type ReplayPace, type ReplayView } from "@/lib/game-replay";
import { snapAccount, snapHeadline, snapSituation, scoreContext } from "@/lib/snap-context";
import { chance, clockText, periodName, snapPath, snapTime } from "@/lib/snap-explorer";
import type { SnapGame } from "@/lib/snap-types";
import { teamIdentity } from "@/lib/teams";
import dynamic from "next/dynamic";
import { DiagramLinks } from "./DiagramLinks";
import { ReplayField, ReplayMargin } from "./ReplayGraphics";
import styles from "./GameReplay.module.css";

const SnapChalkboard = dynamic(() => import("./SnapChalkboard").then(module => module.SnapChalkboard));

type Move = "previous" | "next" | "first" | ReplayPace;

function destination(view: ReplayView, move: Move, chalk: boolean) {
  const key = move === "next" || move === "previous" ? view[move] : move === "first" ? view.first : view.play.key;
  const pace = move === "key" || move === "all" ? move : view.pace;
  return key === null ? null : { key, pace, href: replayHref(view.game.id, key, pace, chalk) };
}

function followsNormally(event: MouseEvent<HTMLAnchorElement>) {
  return event.button === 0 && !event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function useReplay(initial: ReplayView, initialChalk: boolean) {
  const [view, show] = useState(initial);
  const [chalk, setChalk] = useState(initialChalk);
  const currentChalk = useRef(initialChalk);
  const [loading, setLoading] = useState(false);
  const current = useRef(initial);
  const deck = useRef<SnapGame | null>(null);
  const pending = useRef<{ controller: AbortController; moves: Move[] } | null>(null);

  const display = useCallback((next: ReplayView) => {
    current.current = next;
    show(next);
  }, []);

  const go = useCallback((move: Move) => {
    const target = destination(current.current, move, currentChalk.current);
    if (!target) return;
    const apply = (game: SnapGame, action: Move) => {
      const from = current.current;
      const to = destination(from, action, currentChalk.current);
      if (!to || (to.key === from.play.key && to.pace === from.pace)) return;
      const next = replayView(game, to.key, to.pace);
      if (!next) throw new Error("Archived play no longer available");
      window.history.pushState(null, "", to.href);
      display(next);
    };
    if (deck.current) {
      try { apply(deck.current, move); } catch { window.location.assign(target.href); }
      return;
    }
    if (pending.current) { pending.current.moves.push(move); return; }
    const request = { controller: new AbortController(), moves: [move] };
    pending.current = request;
    setLoading(true);
    const timeout = window.setTimeout(() => request.controller.abort(), 8000);
    const id = current.current.game.id;
    void fetch(replayHref(id) + "/frames", { signal: request.controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Replay unavailable");
        const game: SnapGame = await response.json();
        if (pending.current !== request) return;
        if (game.id !== id || !Array.isArray(game.plays) || !game.plays.some(play => play.key === current.current.play.key)) throw new Error("Archive changed");
        deck.current = game;
        for (const action of request.moves) apply(game, action);
      })
      .catch(() => {
        if (pending.current !== request) return;
        const fallback = destination(current.current, move, currentChalk.current);
        if (fallback) window.location.assign(fallback.href);
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (pending.current === request) { pending.current = null; setLoading(false); }
      });
  }, [display]);

  useEffect(() => {
    const cancel = () => {
      pending.current?.controller.abort();
      pending.current = null;
    };
    const restore = () => {
      cancel();
      setLoading(false);
      const url = new URL(window.location.href);
      if (url.pathname !== replayHref(initial.game.id)) return;
      currentChalk.current = url.searchParams.get("view") === "chalk";
      setChalk(currentChalk.current);
      const pace = url.searchParams.get("pace") === "all" ? "all" : "key";
      const key = url.searchParams.get("play") ?? initial.first;
      if (key === initial.play.key && pace === initial.pace) return display(initial);
      const restored = deck.current && replayView(deck.current, key, pace);
      if (restored) display(restored);
      else window.location.reload();
    };
    const arrow = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || document.querySelector("dialog[open]")) return;
      const target = event.target;
      if (target instanceof Element && (target.closest("input, textarea, select, [contenteditable=true]") ||
          (target !== document.body && target !== document.documentElement && !target.closest("#replay-viewer")))) return;
      const move = event.key === "ArrowRight" ? "next" : "previous";
      if (!current.current[move]) return;
      event.preventDefault();
      go(move);
    };
    window.addEventListener("popstate", restore);
    window.addEventListener("keydown", arrow);
    return () => {
      cancel();
      window.removeEventListener("popstate", restore);
      window.removeEventListener("keydown", arrow);
    };
  }, [initial, display, go]);

  function click(event: MouseEvent<HTMLAnchorElement>, action: Move) {
    if (!followsNormally(event)) return;
    event.preventDefault();
    go(action);
  }
  function chooseDiagram(event: MouseEvent<HTMLAnchorElement>, next: boolean) {
    if (!followsNormally(event)) return;
    event.preventDefault();
    if (next === currentChalk.current) return;
    currentChalk.current = next;
    setChalk(next);
    window.history.pushState(null, "", event.currentTarget.href);
  }
  return { view, click, loading, chalk, chooseDiagram };
}

export default function GameReplay({ initial, initialChalk }: { initial: ReplayView; initialChalk: boolean }) {
  const { view, click, loading, chalk, chooseDiagram } = useReplay(initial, initialChalk);
  const { game, play } = view;
  const identity = teamIdentity(game.opponent);
  const opponent = identity?.nickname ?? identity?.city ?? game.opponent;
  const title = game.home ? opponent + " at Jets" : "Jets at " + opponent;
  const heading = snapHeadline(game, play);
  const account = snapAccount(game, play);
  const final = view.last && view.terminalScore;
  const caption = view.displayScore && !play.after ? view.scoreLabel : scoreContext(play.before, play.after, opponent);
  const offense = play.possession === "jets" ? "Jets" : play.possession === "opponent" ? opponent : null;
  const epa = game.source === "nflverse" && offense ? play.facts?.epa : undefined;
  const hasOdds = play.wp !== null || play.postWp != null;
  const quarters = Array.from({ length: Math.max(4, play.quarter) }, (_, i) => i + 1);
  const navLink = (move: "previous" | "next", label: string) => {
    const to = destination(view, move, chalk);
    return <a href={to?.href} role="link" aria-disabled={to ? undefined : true}
      className={move === "next" ? styles.next : styles.previous} onClick={to ? e => click(e, move) : undefined}>
      {move === "previous" && <span aria-hidden="true">←</span>}{label}{move === "next" && <span aria-hidden="true">→</span>}
    </a>;
  };
  return <section id="replay-viewer" data-focus-moment="replay-viewer" aria-labelledby="replay-match" className={styles.viewer}>
    <header className={styles.header}><p><time dateTime={game.date}>{formatDate(game.date)}</time> · Game replay</p>
      <h1 id="replay-match">{title}</h1></header>
    <div className={styles.controls}>
      <nav className={styles.paces} aria-label="Replay pace">{(["key", "all"] as const).map(pace =>
        <a key={pace} href={replayHref(game.id, play.key, pace, chalk)} aria-current={pace === view.pace ? "true" : undefined}
          onClick={e => click(e, pace)}>{pace === "key" ? "Key plays" : "Every play"}</a>)}</nav>
      <nav className={styles.steps} aria-label="Replay controls">{navLink("previous", "Previous")}{navLink("next", "Next")}</nav>
    </div>
    <p className="sr-only" role="status">{loading ? "Loading this game." : snapTime(play) + ". " + heading + (view.displayScore ? " Jets " + view.displayScore[0] + ", " + opponent + " " + view.displayScore[1] + "." : "")}</p>
    <div className={styles.board} role="group" aria-label={view.scoreLabel}>
      <p className={styles.boardLabel}>{view.scoreLabel}</p>
      <div className={styles.scoreline}>
        <div className={styles.team}><span>Jets</span><strong>{view.displayScore?.[0] ?? "—"}</strong>{play.facts?.timeouts && <small>{play.facts.timeouts[0]} {play.facts.timeouts[0] === 1 ? "timeout" : "timeouts"}</small>}</div>
        <div className={styles.team}><span>{opponent}</span><strong>{view.displayScore?.[1] ?? "—"}</strong>{play.facts?.timeouts && <small>{play.facts.timeouts[1]} {play.facts.timeouts[1] === 1 ? "timeout" : "timeouts"}</small>}</div>
        <div className={styles.clock}><span>{periodName(play.quarter)}</span><b>{play.clock === null ? "—" : clockText(play.clock)}</b></div>
      </div>
      <div className={styles.periodTrack} aria-hidden="true">{quarters.map(q => {
        const elapsed = q < play.quarter ? 100 : q > play.quarter || play.clock === null || q > 4 ? 0 : Math.min(100, Math.max(0, 100 - play.clock / 9));
        return <span key={q} className={q === play.quarter ? styles.activePeriod : undefined}><i style={{ width: elapsed + "%" }} /></span>;
      })}</div>
      <p className={styles.situation}><span>Before the play</span> · {snapSituation(game, play)}</p>
    </div>
    <article className={styles.play} aria-labelledby="replay-play">
      <p className={styles.snapNumber}>Play {view.index + 1}{view.reason && <span> · {view.reason}</span>}</p>
      <h2 id="replay-play">{heading}</h2>
      {account && account !== heading && <p className={styles.account}>{account}</p>}
      <p className={styles.scoreChange}>{caption}</p>
      <DiagramLinks chalk={chalk} fieldHref={replayHref(game.id, play.key, view.pace)}
        chalkHref={replayHref(game.id, play.key, view.pace, true)} onChoose={chooseDiagram} />
      {chalk ? <SnapChalkboard key={play.key} game={game} play={play} /> : <ReplayField view={view} />}
    </article>
    <ReplayMargin view={view} opponent={opponent} />
    {(hasOdds || epa != null) && <dl className={styles.metrics}>
      {hasOdds && <div><dt>Jets win chance</dt><dd>{play.wp !== null && play.postWp != null ? chance(play.wp) + " → " + chance(play.postWp) :
        play.postWp != null ? chance(play.postWp) + " after" : chance(play.wp!) + " before"}</dd></div>}
      {epa != null && <div><dt>{offense} expected points added</dt><dd>{epa > 0 ? "+" : ""}{epa.toFixed(2)}</dd></div>}
    </dl>}
    <div className={styles.links}>
      <a href={snapPath(game.id, play.key) + (chalk ? "?view=chalk#evidence" : "")}>Analyze this play</a>
      {view.last && <><a href={replayHref(game.id, view.first, view.pace, chalk)} onClick={e => click(e, "first")}>Replay from the start</a>
        <a href={"/games/" + encodeURIComponent(game.id)}>Full game report</a></>}
      <a href={"/replay?season=" + encodeURIComponent(game.id.slice(0, 4))}>Choose another game</a>
    </div>
    {view.last && <p className={styles.ending}><b>End of the recorded game.</b>{final && " Final score · Jets " + final[0] + ", " + opponent + " " + final[1] + "."}</p>}
    <details className={styles.method}><summary>How key plays are chosen</summary>
      <p>The replay includes the opening and closing plays, the start of each period, score changes and recorded turnovers.
        A play also qualifies when the model moves the Jets’ win chance by at least 10 percentage points. The score chart follows recorded plays in order.</p>
      <p>Play-by-play and model estimates from <a href={"https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_" + game.id.slice(0, 4) + ".parquet"}>nflverse’s {game.id.slice(0, 4)} data</a>.</p>
    </details>
  </section>;
}
