"use client";

import { useMemo, useSyncExternalStore, type CSSProperties } from "react";
import type { ArchivePhase } from "@/lib/season-archive";
import type { RankEntry, RankingMetric, SeasonRankings as SeasonRankingsData } from "@/lib/season-rankings";
import styles from "./SeasonRankings.module.css";

const eventName = "ajetsfan:ranking-filter";
const phaseNames: Record<ArchivePhase, string> = { all: "Regular season + playoffs", regular: "Regular season", playoffs: "Playoffs" };
const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  window.addEventListener(eventName, notify);
  return () => { window.removeEventListener("popstate", notify); window.removeEventListener(eventName, notify); };
};
const locationSnapshot = () => window.location.search;
const serverSnapshot = () => "";
const dates = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
function date(value: string | null) { return value && Number.isFinite(Date.parse(value)) ? dates.format(new Date(value)) : "Date unavailable"; }

function change(patch: Record<string, string>, replace = false) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(patch)) if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  if (url.href === window.location.href) return;
  window.history[replace ? "replaceState" : "pushState"](window.history.state, "", url);
  window.dispatchEvent(new Event(eventName));
}

function valueLabel(value: number, metric: RankingMetric) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: metric.unit === "perGame" ? 1 : 0, maximumFractionDigits: metric.unit === "perGame" || metric.unit === "sacks" ? 1 : 0 });
}
const unitLabel = (metric: RankingMetric) => metric.unit === "perGame" ? "per game" : metric.unit === "yards" ? "yards" : metric.unit === "sacks" ? "sacks" : "total";
function Rank({ entry, population }: { entry: RankEntry; population: number }) {
  return <span className={styles.rankNumber} data-rank-number={entry.rank} data-rank-tied={entry.tied ? "true" : "false"} data-rank-of={population}><strong>{entry.tied ? <span className={styles.tie}>T</span> : null}<span aria-hidden="true">#</span>{entry.rank}</strong><span>of {population}<span className="sr-only"> in the ranked population{entry.tied ? "; tied rank" : ""}</span></span></span>;
}
function Leaders({ metric }: { metric: RankingMetric }) {
  return metric.leaders.length ? <details className={styles.leaders} data-rank-leaders={metric.id}><summary>League leaders<span>{metric.leaders.length} shown <i aria-hidden="true">+</i></span></summary><ol>{metric.leaders.map((entry) => <li key={entry.id}><span className={styles.leaderRank}>{entry.tied ? "T" : ""}#{entry.rank}</span><strong>{entry.name}</strong><span>{valueLabel(entry.value, metric)} <small>{unitLabel(metric)}</small></span></li>)}</ol></details> : null;
}

function TeamCard({ metric }: { metric: RankingMetric }) {
  const jets = metric.jets;
  const position = jets && metric.population > 1 ? (jets.rank - 1) / (metric.population - 1) * 100 : 0;
  return <article className={styles.teamCard} data-team-rank={metric.id} data-rank-population={metric.population}>
    <header><h3>{metric.label}</h3><span>{metric.direction === "lower" ? "Lower value ranks first" : "Higher value ranks first"}</span></header>
    {jets ? <><div className={styles.teamNumbers}><Rank entry={jets} population={metric.population} /><p><strong data-team-value>{valueLabel(jets.value, metric)}</strong><span>{unitLabel(metric)}</span></p></div><div className={styles.positionRail} aria-hidden="true" style={{ "--rank-position": `${Math.max(0, Math.min(100, position))}%` } as CSSProperties}><span /><i /><div><b>#1</b><b>#{metric.population}</b></div></div><p className={styles.population}>{metric.populationLabel} · {jets.games} Jets {jets.games === 1 ? "game" : "games"} with recorded stats</p></> : <><p className={styles.cardGap}>The Jets are not ranked for this metric in the published sample.</p><p className={styles.population}>{metric.population} in the ranked population · {metric.populationLabel}</p></>}
    <p className={styles.metricNote}>{metric.note}</p><Leaders metric={metric} />
  </article>;
}

export default function SeasonRankings({ rankings, phase, year }: { rankings: SeasonRankingsData | null; phase: ArchivePhase; year: number }) {
  const search = useSyncExternalStore(subscribe, locationSnapshot, serverSnapshot);
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const view = params.get("rank-view") === "players" ? "players" : "team";
  const query = (params.get("rank-q") ?? "").slice(0, 120);
  const sort = params.get("rank-sort") === "name" || params.get("rank-sort") === "jets" ? params.get("rank-sort")! : "rank";
  const snapshot = rankings?.year === year ? rankings.phases[phase] : null;
  const metric = snapshot?.individual.find((item) => item.id === params.get("rank-metric")) ?? snapshot?.individual[0];
  const players = useMemo(() => [...(metric?.players ?? [])].filter((entry) => `${entry.name} ${entry.position ?? ""} ${entry.teams?.join(" ") ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "jets" ? (b.jetsValue ?? 0) - (a.jetsValue ?? 0) || a.rank - b.rank || a.name.localeCompare(b.name) : a.rank - b.rank || a.name.localeCompare(b.name)), [metric, query, sort]);
  const coverageGap = !!snapshot && (snapshot.missingTeamGames.length > 0 || snapshot.missingPlayerGames.length > 0);

  return <section id="season-rankings" className={styles.rankings} aria-labelledby="season-rankings-heading" data-season-rankings={year} data-rank-phase={phase} data-ranking-view={view}>
    <header className={styles.heading}><div><p className={styles.kicker}>{year} · {phaseNames[phase]}</p><h2 id="season-rankings-heading">Where the Jets stood.</h2></div><p>Team standing.<br />Individual production.<br /><strong>League context.</strong></p></header>
    {snapshot && rankings ? <><div className={styles.coverage} data-rank-coverage><p><span>League finals expected</span><strong>{snapshot.expectedGames}</strong></p><p><span>With team statistics</span><strong>{snapshot.teamGames}</strong></p><p><span>With player statistics</span><strong>{snapshot.playerGames}</strong></p><p><span>Jets finals</span><strong>{snapshot.jetsGames}</strong></p></div><p className={styles.scope}>{phaseNames[phase]} only{snapshot.throughDate ? <> · through <time dateTime={snapshot.throughDate}>{date(snapshot.throughDate)}</time></> : ""}. {phase === "all" ? "Combined regular-season and playoff production is a separate comparison from either phase alone." : phase === "playoffs" ? "Postseason populations include participating teams and players with qualifying recorded production." : "Rank populations and qualification rules are shown for each statistic."}</p>
      {coverageGap ? <div className={styles.coverageGap} data-rank-gap><h3>The league sample has gaps.</h3><p>{snapshot.missingTeamGames.length} league {snapshot.missingTeamGames.length === 1 ? "final lacks" : "finals lack"} team statistics; {snapshot.missingPlayerGames.length} {snapshot.missingPlayerGames.length === 1 ? "lacks" : "lack"} player statistics. Affected rankings are withheld rather than calculated from an incomplete league.</p><details><summary>Finals awaiting statistics <span aria-hidden="true">+</span></summary>{snapshot.missingTeamGames.length ? <p><strong>Team statistics:</strong> {snapshot.missingTeamGames.join(" · ")}</p> : null}{snapshot.missingPlayerGames.length ? <p><strong>Player statistics:</strong> {snapshot.missingPlayerGames.join(" · ")}</p> : null}</details></div> : null}
      {snapshot.jetsGames === 0 ? <p className={styles.empty} data-rank-no-jets>No Jets finals are recorded for this phase. League leader context covers participating teams and players; it does not imply a Jets finish.</p> : null}
      <div className={styles.views} role="group" aria-label="Season ranking view"><button type="button" aria-pressed={view === "team"} data-rank-view="team" onClick={() => change({ "rank-view": "" })}>The team <span>{snapshot.team.length} metrics</span></button><button type="button" aria-pressed={view === "players"} data-rank-view="players" onClick={() => change({ "rank-view": "players" })}>Jets contributors <span>{snapshot.individual.length} metrics</span></button></div>
      {view === "team" ? <div data-rank-team>{snapshot.team.length ? <div className={styles.teamGrid}>{snapshot.team.map((item) => <TeamCard key={item.id} metric={item} />)}</div> : <p className={styles.empty} data-rank-team-empty>No league team rankings are available for this phase. The recorded finals remain in the season archive.</p>}</div> : <div className={styles.playerDesk} data-rank-players><header><div><p className={styles.kicker}>Jets players, measured against the league</p><h3>Find the names. See the ranks.</h3></div></header>{snapshot.individual.length && metric ? <><div className={styles.playerControls}><label>Statistic<select value={metric.id} onChange={(event) => change({ "rank-metric": event.target.value })} data-rank-metric>{snapshot.individual.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label><label>Find a player<input type="search" value={query} maxLength={120} placeholder="Name, position or club…" onChange={(event) => change({ "rank-q": event.target.value }, true)} data-rank-search /></label><label>Order by<select value={sort} onChange={(event) => change({ "rank-sort": event.target.value === "rank" ? "" : event.target.value })} data-rank-sort><option value="rank">League rank</option><option value="jets">Jets contribution</option><option value="name">Player name</option></select></label></div><div className={styles.metricContext}><h4>{metric.label}</h4><p><strong>{metric.population}</strong> in the ranked population · {metric.populationLabel}</p><p>{metric.note}</p><p>League totals include all clubs in this phase. Jets contribution shows production recorded with New York; listed clubs identify players who also contributed elsewhere.</p></div><p className={styles.resultCount} role="status" data-rank-results>{players.length} of {metric.players?.length ?? 0} Jets contributors shown</p>{players.length ? <ol className={styles.playerList}>{players.map((entry) => <li key={entry.id} data-rank-player={entry.id} data-player-rank={entry.rank} data-player-jets-value={entry.jetsValue}><div className={styles.playerIdentity}><h4>{entry.name}</h4><p>{entry.position ? <span>{entry.position} · </span> : null}{entry.teams?.length ? `Clubs: ${entry.teams.join(" · ")}` : "Jets contributor"}</p></div><dl><div><dt>League rank</dt><dd><Rank entry={entry} population={metric.population} /></dd></div><div><dt>All-club total</dt><dd>{valueLabel(entry.value, metric)}<small>{unitLabel(metric)} · {entry.games} {entry.games === 1 ? "game" : "games"} with stats</small></dd></div><div><dt>Jets contribution</dt><dd>{entry.jetsValue != null ? valueLabel(entry.jetsValue, metric) : "—"}<small>{entry.jetsValue != null ? `${unitLabel(metric)} · ${entry.jetsGames ?? "—"} Jets ${entry.jetsGames === 1 ? "game" : "games"} with stats` : "Jets split unavailable"}</small></dd></div></dl></li>)}</ol> : <div className={styles.empty} data-rank-player-empty><p>{query ? "No Jets contributors match that search." : "No Jets contributors have recorded production for this statistic in the selected phase."}</p>{query ? <button type="button" onClick={() => change({ "rank-q": "" })}>Clear player search <span aria-hidden="true">×</span></button> : null}</div>}<Leaders key={metric.id} metric={metric} /></> : <p className={styles.empty} data-rank-player-empty>League player rankings are unavailable for this phase. Missing statistics are not zero production.</p>}</div>}
      <div className={styles.methods}><p><strong>Reading the ranks.</strong> T marks a tied rank. Competition ranking gives equal values the same position, then skips the occupied places (1, 1, 3). Ranks use unrounded values; displayed rates are rounded.</p>{snapshot.notes.length ? <details><summary>Coverage and calculation notes <span aria-hidden="true">+</span></summary><ul>{snapshot.notes.map((note, index) => <li key={`${index}:${note}`}>{note}</li>)}</ul></details> : null}</div><footer className={styles.sources}><p>Statistics checked <time dateTime={rankings.checkedAt}>{date(rankings.checkedAt)}</time>. Rankings describe this published data snapshot.</p><a href={rankings.sources.schedule} target="_blank" rel="noopener noreferrer">League finals <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a><a href={rankings.sources.teams} target="_blank" rel="noopener noreferrer">Team statistics <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a><a href={rankings.sources.players} target="_blank" rel="noopener noreferrer">Player statistics <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a></footer>
    </> : <div className={styles.empty} data-rank-unavailable><p>League and individual rankings are not available for the {year} season in this edition.</p><p>The season archive keeps its recorded scores and sourced moments available. Earlier or missing league statistics do not become inferred rankings.</p></div>}
  </section>;
}
