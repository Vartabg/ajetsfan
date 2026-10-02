"use client";

import { useMemo, useSyncExternalStore } from "react";
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
  window.history[replace ? "replaceState" : "pushState"](null, "", url);
  window.dispatchEvent(new Event(eventName));
}

function valueLabel(value: number, metric: RankingMetric) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: metric.unit === "perGame" ? 1 : 0, maximumFractionDigits: metric.unit === "perGame" || metric.unit === "sacks" ? 1 : 0 });
}
const unitLabel = (metric: RankingMetric) => metric.unit === "perGame" ? "per game" : metric.unit === "yards" ? "yards" : metric.unit === "sacks" ? "sacks" : "total";
const gamesLabel = (games: number, jets = false) => `${games} ${jets ? "Jets " : ""}${games === 1 ? "game" : "games"}`;

function Rank({ entry, population }: { entry: RankEntry; population: number }) {
  return <span className={styles.rankNumber} data-rank-number={entry.rank} data-rank-tied={entry.tied ? "true" : "false"} data-rank-of={population}>
    <strong>{entry.tied ? <span className={styles.tie}>T</span> : null}<span aria-hidden="true">#</span>{entry.rank}</strong>
    <span>of {population}<span className="sr-only"> in the ranked population{entry.tied ? "; tied rank" : ""}</span></span>
  </span>;
}

function LeaderList({ metric }: { metric: RankingMetric }) {
  return <ol className={styles.leaderList}>{metric.leaders.map((entry) => <li key={entry.id}>
    <span className={styles.leaderRank}>{entry.tied ? "T" : ""}#{entry.rank}</span>
    <strong>{entry.name}</strong>
    <span>{valueLabel(entry.value, metric)} <small>{unitLabel(metric)}</small></span>
  </li>)}</ol>;
}

function Leaders({ metric }: { metric: RankingMetric }) {
  return metric.leaders.length ? <details className={styles.leaders} data-rank-leaders={metric.id}>
    <summary>League leaders <span className={styles.expand} aria-hidden="true">+</span></summary>
    <LeaderList metric={metric} />
  </details> : null;
}

function TeamRow({ metric }: { metric: RankingMetric }) {
  const jets = metric.jets;
  return <details className={styles.teamRow} data-team-rank={metric.id} data-rank-population={metric.population} data-rank-leaders={metric.id}>
    <summary>
      <div className={styles.teamLabel}><h3>{metric.label}</h3><span>{jets ? gamesLabel(jets.games, true) : "Jets unranked"}</span></div>
      {jets ? <><Rank entry={jets} population={metric.population} /><p className={styles.teamValue}><strong data-team-value>{valueLabel(jets.value, metric)}</strong><span>{unitLabel(metric)}</span></p></> : <p className={styles.unranked}>{metric.population} ranked</p>}
      <span className={styles.expand} aria-hidden="true">+</span>
    </summary>
    <div className={styles.teamDetail}>
      <p>{metric.populationLabel}. {metric.direction === "lower" ? "Lower values rank first." : "Higher values rank first."}</p>
      <p>{metric.note}</p>
      {metric.leaders.length ? <><h4>League leaders</h4><LeaderList metric={metric} /></> : null}
    </div>
  </details>;
}

type Props = { rankings: SeasonRankingsData | null; phase: ArchivePhase; year: number; guideHref?: string; embedded?: boolean };

export default function SeasonRankings({ rankings, phase, year, guideHref, embedded = false }: Props) {
  const search = useSyncExternalStore(subscribe, locationSnapshot, serverSnapshot);
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const view = params.get("rank-view") === "players" ? "players" : "team";
  const query = (params.get("rank-q") ?? "").slice(0, 120);
  const sort = params.get("rank-sort") === "name" || params.get("rank-sort") === "jets" ? params.get("rank-sort")! : "rank";
  const snapshot = rankings?.year === year ? rankings.phases[phase] : null;
  const metric = snapshot?.individual.find((item) => item.id === params.get("rank-metric")) ?? snapshot?.individual[0];
  const players = useMemo(() => [...(metric?.players ?? [])].filter((entry) => `${entry.name} ${entry.position ?? ""} ${entry.teams?.join(" ") ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "jets" ? (b.jetsValue ?? 0) - (a.jetsValue ?? 0) || a.rank - b.rank || a.name.localeCompare(b.name) : a.rank - b.rank || a.name.localeCompare(b.name)), [metric, query, sort]);
  const gapNotes = snapshot?.notes.filter((note) => /\b(withheld|missing|unassigned)\b/i.test(note)) ?? [];
  const coverageGap = !!snapshot && (snapshot.missingTeamGames.length > 0 || snapshot.missingPlayerGames.length > 0 || gapNotes.length > 0);
  const guide = `${(guideHref ?? `/seasons/${year}/guide?phase=${phase}`).split("#")[0]}#rankings`;

  return <section id="season-rankings" className={styles.rankings} aria-labelledby="season-rankings-heading" data-season-rankings={year} data-rank-phase={phase} data-ranking-view={view}>
    {embedded ? <h2 id="season-rankings-heading" className="sr-only">League rankings</h2> : <header className={styles.heading}><div><p className={styles.kicker}>{year} · {phaseNames[phase]}</p><h2 id="season-rankings-heading">League rankings</h2></div></header>}
    {snapshot && rankings ? <>
      <p className={styles.scope} data-rank-coverage>{gamesLabel(snapshot.jetsGames, true)}{snapshot.throughDate ? <> · through <time dateTime={snapshot.throughDate}>{date(snapshot.throughDate)}</time></> : null}</p>
      {coverageGap ? <details className={styles.coverageGap} data-rank-gap key={`${year}:${phase}`}>
        <summary>Some rankings unavailable <span className={styles.expand} aria-hidden="true">+</span></summary>
        <div><p>Affected rankings are withheld.</p>{gapNotes.length ? <ul>{gapNotes.map((note, index) => <li key={`${index}:${note}`}>{note}</li>)}</ul> : null}<a href={guide}>Coverage details <span aria-hidden="true">→</span></a></div>
      </details> : null}
      {snapshot.jetsGames === 0 ? <p className={styles.empty} data-rank-no-jets>No Jets games in this phase. League leaders show participating teams; this does not imply a Jets finish.</p> : null}
      <div className={styles.views} role="group" aria-label="Season ranking view">
        <button type="button" aria-pressed={view === "team"} data-rank-view="team" onClick={() => change({ "rank-view": "" })}>Team</button>
        <button type="button" aria-pressed={view === "players"} data-rank-view="players" onClick={() => change({ "rank-view": "players" })}>Players</button>
      </div>
      {view === "team" ? <div data-rank-team>{snapshot.team.length ? <div className={styles.teamList}>{snapshot.team.map((item) => <TeamRow key={`${phase}:${item.id}`} metric={item} />)}</div> : <p className={styles.empty} data-rank-team-empty>Team rankings unavailable for this phase.</p>}</div> : <div className={styles.playerDesk} data-rank-players>
        {snapshot.individual.length && metric ? <>
          <div className={styles.playerControls}>
            <label>Statistic<select value={metric.id} onChange={(event) => change({ "rank-metric": event.target.value })} data-rank-metric>{snapshot.individual.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
            <label>Find a player<input type="search" value={query} maxLength={120} placeholder="Name, position or club…" onChange={(event) => change({ "rank-q": event.target.value }, true)} data-rank-search /></label>
            <label>Order by<select value={sort} onChange={(event) => change({ "rank-sort": event.target.value === "rank" ? "" : event.target.value })} data-rank-sort><option value="rank">League rank</option><option value="jets">Jets contribution</option><option value="name">Player name</option></select></label>
          </div>
          <details className={styles.metricContext} data-player-rank-context key={`${phase}:${metric.id}`}>
            <summary><span><strong>{metric.population}</strong> qualifying players</span><span>Rank details <span className={styles.expand} aria-hidden="true">+</span></span></summary>
            <div><p>{metric.populationLabel}.</p><p>{metric.note}</p><p>All-club totals determine league rank. Jets totals show only production with New York.</p></div>
          </details>
          <p className={styles.resultCount} role="status" data-rank-results>{players.length} of {metric.players?.length ?? 0} Jets contributors shown</p>
          {players.length ? <ol className={styles.playerList}>{players.map((entry) => <li key={entry.id} data-rank-player={entry.id} data-player-rank={entry.rank} data-player-jets-value={entry.jetsValue}>
            <div className={styles.playerIdentity}><h4>{entry.name}</h4><p>{entry.position ? <span>{entry.position} · </span> : null}{entry.teams?.length ? `Clubs: ${entry.teams.join(" · ")}` : "Jets contributor"}</p></div>
            <dl>
              <div><dt>League rank</dt><dd><Rank entry={entry} population={metric.population} /></dd></div>
              <div><dt>All-club total</dt><dd>{valueLabel(entry.value, metric)}<small>{unitLabel(metric)} · {gamesLabel(entry.games)}</small></dd></div>
              <div><dt>Jets total</dt><dd>{entry.jetsValue != null ? valueLabel(entry.jetsValue, metric) : "—"}<small>{entry.jetsValue != null ? `${unitLabel(metric)} · ${entry.jetsGames == null ? "Jets sample unavailable" : gamesLabel(entry.jetsGames, true)}` : "Jets split unavailable"}</small></dd></div>
            </dl>
          </li>)}</ol> : <div className={styles.empty} data-rank-player-empty><p>{query ? "No Jets contributors match that search." : "No Jets contributors recorded this statistic in this phase."}</p>{query ? <button type="button" onClick={() => change({ "rank-q": "" })}>Clear player search <span aria-hidden="true">×</span></button> : null}</div>}
          <Leaders key={metric.id} metric={metric} />
        </> : <p className={styles.empty} data-rank-player-empty>Player rankings unavailable for this phase.</p>}
      </div>}
    </> : <p className={styles.empty} data-rank-unavailable>League rankings are not available for the {year} season.</p>}
    <footer className={styles.guide}><a href={guide} data-rank-guide>How these ranks work & sources <span aria-hidden="true">→</span></a></footer>
  </section>;
}
