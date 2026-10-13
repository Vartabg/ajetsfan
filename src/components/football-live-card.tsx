import type { CSSProperties } from "react";
import type { LiveFootballFeed, LiveFootballGame, LiveFootballPlayer } from "@/lib/football-live";
import { formatCheckedAt } from "@/lib/current";
import { teamIdentity } from "@/lib/teams";

const card: CSSProperties = { width: "100%", maxWidth: 760, minWidth: 0, boxSizing: "border-box", border: "1px solid var(--faint)", borderRadius: 10, padding: "16px clamp(12px, 3vw, 24px)", background: "var(--raise)", color: "var(--ink)" };
const small: CSSProperties = { margin: "8px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--quiet)" };
const label: CSSProperties = { margin: 0, font: "600 12px/1.5 var(--text, system-ui)", color: "var(--quiet)" };
const states = { scheduled: "Scheduled", live: "In progress", final: "Final", postponed: "Postponed", suspended: "Suspended", cancelled: "Cancelled" };

export function footballOpponent(game: LiveFootballGame) {
  return teamIdentity(game.opponent)?.nickname ?? game.opponentDisplay;
}

/** A recent final belongs on the front page until the regular result has caught up. */
export function showFootballMoment(feed: LiveFootballFeed, latestFinalId?: string, now = Date.now()) {
  const game = feed.status !== "unavailable" ? feed.featured : null;
  if (!game || game.state === "scheduled") return false;
  if (game.state !== "final") return true;
  const kickoff = game.kickoff ? Date.parse(game.kickoff) : NaN;
  return latestFinalId !== game.gameId || Number.isFinite(kickoff) && now - kickoff <= 6 * 60 * 60_000;
}

function gameLabel(game: LiveFootballGame, retained: boolean) {
  const state = retained && game.state === "live" ? "Last known score" : states[game.state];
  const period = game.state === "live" || game.state === "suspended"
    ? game.period > 4 ? "Overtime" : game.period > 0 ? `Q${game.period}` : null : null;
  return [state, period, period && game.clock ? game.clock : null].filter(Boolean).join(" · ");
}

const number = (value: number | null) => value === null ? "—" : value.toLocaleString("en-US");
const categories = [
  { kind: "passing", title: "Passing", headings: ["Player", "C/A", "Yards", "TD", "INT"] },
  { kind: "rushing", title: "Rushing", headings: ["Player", "Carries", "Yards", "TD"] },
  { kind: "receiving", title: "Receiving", headings: ["Player", "Catches", "Targets", "Yards", "TD"] },
] as const;

function playerValues(player: LiveFootballPlayer, kind: typeof categories[number]["kind"]) {
  if (kind === "passing") {
    const value = player.passing!;
    return [`${number(value.completions)}/${number(value.attempts)}`, number(value.yards), number(value.touchdowns), number(value.interceptions)];
  }
  if (kind === "rushing") {
    const value = player.rushing!;
    return [number(value.carries), number(value.yards), number(value.touchdowns)];
  }
  const value = player.receiving!;
  return [number(value.receptions), number(value.targets), number(value.yards), number(value.touchdowns)];
}

/** Provider game totals stay separate from confirmed season aggregates. */
export default function FootballLiveCard({ feed, id = "football-live", boxScore = false }: {
  feed: LiveFootballFeed; id?: string; boxScore?: boolean;
}) {
  const game = feed.featured;
  if (!game || feed.status === "unavailable") return null;
  const source = `https://www.espn.com/nfl/game/_/gameId/${game.eventId}`;
  const provisional = game.provisional;
  const hasScores = game.jetsScore !== null && game.oppScore !== null;
  const gamePlayers = game.players.filter((player) => player.passing || player.rushing || player.receiving);
  return <section id={id} style={card} aria-label={boxScore ? "Latest Jets game box score" : "Latest Jets score"}
    data-football-card={game.gameId} data-football-state={game.state} data-football-feed-state={feed.status} data-football-provisional={provisional ? "true" : "false"}>
    <p style={label} data-football-game-status>{gameLabel(game, feed.status === "retained")} · {game.seasonType === "POST" ? "Playoffs" : `Week ${game.week}`}</p>
    {hasScores ? <p style={{ margin: "8px 0 0", font: "650 clamp(24px, 5vw, 36px)/1.2 var(--display, system-ui)", fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}
      aria-live="polite" aria-atomic="true" data-football-score>Jets {game.jetsScore} <span style={{ color: "var(--quiet)", fontWeight: 400 }}>–</span> {footballOpponent(game)} {game.oppScore}</p>
      : <p style={{ margin: "8px 0 0", fontWeight: 600 }}>Jets {game.atHome ? "vs" : "at"} {footballOpponent(game)}</p>}
    <p style={small}>{game.detail}{game.kickoff ? <> · <time dateTime={game.kickoff}>{formatCheckedAt(game.kickoff)}</time></> : null}</p>
    {feed.status === "retained" ? <p style={small} role="status" data-football-retained>The latest score check failed. Showing the last verified game update; the score or clock may have changed.</p> : null}
    {provisional ? <p style={small} data-football-provisional-note>Live scores and game statistics are provisional until the source confirms the final.</p> : null}
    {boxScore ? <div style={{ marginTop: 16, borderTop: "1px solid var(--faint)", paddingTop: 12 }} data-football-box-score>
      <h2 id={`${id}-players-heading`} style={{ margin: 0, font: "650 22px/1.3 var(--display, system-ui)" }}>This game’s player totals</h2>
      <p style={small}>{provisional ? "Live game totals" : game.state === "final" ? "Final game totals" : "Available game totals"} from ESPN. Season totals are shown separately below. A dash means the source has not supplied that field.</p>
      {game.teamStats?.length ? <details style={{ borderBottom: "1px solid var(--faint)", marginTop: 8 }} data-football-team-totals>
        <summary style={{ minHeight: 44, display: "list-item", paddingTop: 10, boxSizing: "border-box", cursor: "pointer", fontWeight: 600 }}>Team totals <span style={{ fontWeight: 400, color: "var(--quiet)", fontSize: 13 }}>· Jets</span></summary>
        <dl style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "8px 16px", margin: "0 0 12px", fontSize: 13, lineHeight: 1.5, fontVariantNumeric: "tabular-nums" }}>
          {game.teamStats.map((stat) => <div key={stat.name} style={{ display: "contents" }}>
            <dt style={{ overflowWrap: "anywhere" }}>{stat.label}</dt>
            <dd style={{ margin: 0, textAlign: "right", overflowWrap: "anywhere" }}>{stat.displayValue}</dd>
          </div>)}
        </dl>
      </details> : null}
      {gamePlayers.length ? categories.map(({ kind, title, headings }) => {
        const players = gamePlayers.filter((player) => player[kind]);
        if (!players.length) return null;
        return <details key={kind} style={{ borderBottom: "1px solid var(--faint)", marginTop: 8 }} data-football-player-category={kind}>
          <summary style={{ minHeight: 44, display: "list-item", paddingTop: 10, boxSizing: "border-box", cursor: "pointer", fontWeight: 600 }}>{title} <span style={{ fontWeight: 400, color: "var(--quiet)", fontSize: 13 }}>· {players.length} {players.length === 1 ? "player" : "players"}</span></summary>
          <div style={{ width: "100%", overflowX: "auto", paddingBottom: 12 }} role="region" aria-label={`${title} game totals`} tabIndex={0} data-focus-tools>
            <table style={{ width: "100%", minWidth: 360, borderCollapse: "collapse", fontSize: 13, lineHeight: 1.5, fontVariantNumeric: "tabular-nums" }}>
              <caption style={{ textAlign: "left", paddingBottom: 6 }}>{title} · Jets game totals{provisional ? " (provisional)" : ""}</caption>
              <thead><tr>{headings.map((heading, index) => <th key={heading} scope="col" style={{ padding: "6px 8px", textAlign: index ? "right" : "left", borderBottom: "1px solid var(--faint)" }}>{heading === "C/A" ? <abbr title="Completions / attempts" style={{ textDecoration: "none" }}>{heading}</abbr> : heading}</th>)}</tr></thead>
              <tbody>{players.map((player) => <tr key={player.espnId} data-football-player={player.espnId}>
                <th scope="row" style={{ padding: "8px", textAlign: "left", fontWeight: 500 }}>{player.name}{player.position.toLowerCase() !== "unknown" ? <span style={{ color: "var(--quiet)", fontSize: 11 }}> {player.position}</span> : null}</th>
                {playerValues(player, kind).map((value, index) => <td key={index} style={{ padding: "8px", textAlign: "right" }}>{value}</td>)}
              </tr>)}</tbody>
            </table>
          </div>
        </details>;
      }) : <p style={small} data-football-no-player-totals>The source has not published passing, rushing or receiving totals for this game yet. Missing totals are not treated as zero.</p>}
    </div> : null}
    <p style={small}>Source: <a href={source} target="_blank" rel="noopener noreferrer">ESPN game feed<span className="sr-only"> (opens in a new tab)</span></a>.
      {feed.checkedAt ? <> This update was checked <time dateTime={feed.checkedAt}>{formatCheckedAt(feed.checkedAt)}</time>.</> : " No successful source check is recorded."}</p>
  </section>;
}
