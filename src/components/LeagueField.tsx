"use client";

import { useState } from "react";
import { epaLabel } from "@/lib/analytics";
import styles from "./LeagueContext.module.css";

export type LeagueEntry = { team: string; value: number; plays: number; rank: number; completedGames: number };
export type LeagueMeasure = { mean: number | null; plays: number; teams: number; entries: LeagueEntry[] };
type Unit = { side: "offense" | "defense"; title: string; direction: string; measure: LeagueMeasure };

export default function LeagueField({ offense, defense, opponent }: { offense: LeagueMeasure; defense: LeagueMeasure; opponent: string }) {
  const options = [...new Set([...offense.entries, ...defense.entries].map((entry) => entry.team).concat(opponent ? [opponent] : []))].filter((team) => team !== "NYJ").sort();
  const [comparisonTeam, setComparisonTeam] = useState(options.includes(opponent) ? opponent : options[0] ?? "");
  const units: Unit[] = [
    { side: "offense", title: "Offense EPA / play", direction: "Higher is better →", measure: offense },
    { side: "defense", title: "Defense EPA allowed / play", direction: "← Lower allowed EPA is better", measure: defense },
  ];
  const values = units.flatMap(({ measure }) => [...measure.entries.map((entry) => entry.value), ...(measure.mean == null ? [] : [measure.mean])]);
  let lower = Math.floor(Math.min(0, ...values) * 10) / 10;
  let upper = Math.ceil(Math.max(0, ...values) * 10) / 10;
  if (lower === upper) { lower -= 0.1; upper += 0.1; }
  const position = (value: number) => 4 + (value - lower) / (upper - lower) * 92;
  const labelPosition = (value: number) => {
    const at = position(value);
    return { left: `${at}%`, transform: `translateX(${at < 25 ? "0" : at > 75 ? "-100%" : "-50%"})` };
  };

  return <div className={styles.field}>
    <div className={styles.controls}>
      {options.length ? <label htmlFor="league-comparison-team">Compare the Jets with<select id="league-comparison-team" value={comparisonTeam} onChange={(event) => setComparisonTeam(event.target.value)}>{options.map((team) => <option key={team} value={team}>{team}</option>)}</select></label> : null}
      <p className={styles.status} role="status">{comparisonTeam ? `Comparing NYJ with ${comparisonTeam}.` : "Showing the Jets against the league."}</p>
    </div>
    <ul className={styles.legend} aria-label="League plot markers"><li><i className={styles.legendJets} aria-hidden="true" />NYJ</li>{comparisonTeam ? <li><i className={styles.legendOpponent} aria-hidden="true" />{comparisonTeam}</li> : null}<li><i className={styles.legendAverage} aria-hidden="true" />League average</li><li><i className={styles.legendTeam} aria-hidden="true" />Analyzed teams</li><li><i className={styles.legendZero} aria-hidden="true" />Zero EPA</li></ul>
    <div className={styles.strips}>
      {units.map(({ side, title, direction, measure }) => {
        const jets = measure.entries.find((entry) => entry.team === "NYJ");
        const comparison = measure.entries.find((entry) => entry.team === comparisonTeam);
        return <figure key={side} className={styles.strip} aria-label={`${title} league comparison`}>
          <figcaption><h3>{title}</h3><p>{direction}</p></figcaption>
          {measure.entries.length ? <>
            <div className={styles.plot} aria-hidden="true" data-league-unit={side}>
              <span className={styles.rule} />
              <span className={styles.zero} style={{ left: `${position(0)}%` }} />
              {measure.entries.map((entry) => <span key={entry.team} className={styles.teamDot} style={{ left: `${position(entry.value)}%` }} />)}
              {measure.mean != null ? <span className={styles.average} style={{ left: `${position(measure.mean)}%` }} /> : null}
              {jets ? <><span className={styles.jetsStem} style={{ left: `${position(jets.value)}%` }} /><span className={styles.jetsDot} style={{ left: `${position(jets.value)}%` }} /><b className={styles.jetsLabel} style={labelPosition(jets.value)}>NYJ</b></> : null}
              {comparison ? <><span className={styles.opponentStem} style={{ left: `${position(comparison.value)}%` }} /><span className={styles.opponentDot} style={{ left: `${position(comparison.value)}%` }} /><b className={styles.opponentLabel} style={labelPosition(comparison.value)}>{comparisonTeam}</b></> : null}
            </div>
            <div className={styles.axis} aria-hidden="true"><span>{epaLabel(lower, 3)}</span><span>{epaLabel(upper, 3)}</span></div>
          </> : <p className={styles.pending}>No validated {side} EPA sample is available.</p>}
          <dl className={styles.comparison}>
            {[{ team: "NYJ", entry: jets }, ...(comparisonTeam ? [{ team: comparisonTeam, entry: comparison }] : [])].map(({ team, entry }) => <div key={team} className={team === "NYJ" ? styles.jetsReadout : undefined}>
              <dt>{team}</dt><dd><strong>{epaLabel(entry?.value, 3)}</strong>{entry ? <><span>#{entry.rank} of {measure.teams}</span><small>{entry.plays.toLocaleString("en-US")} plays · {entry.completedGames} analyzed {entry.completedGames === 1 ? "game" : "games"}</small></> : <small>No validated {side} sample</small>}</dd>
            </div>)}
            <div><dt>League average</dt><dd><strong>{epaLabel(measure.mean, 3)}</strong><span>Weighted by plays</span><small>{measure.plays.toLocaleString("en-US")} plays · {measure.teams} teams</small></dd></div>
          </dl>
        </figure>;
      })}
    </div>
    <p className={styles.plotNote}>Both plots use the same EPA scale. The numbers below each plot give the values, ranks and included-play counts.</p>
    <details className={styles.leagueTables}><summary className="disclosure"><span><span className="when-closed">Read the full league tables</span><span className="when-open">Close the full league tables</span></span></summary><div className={styles.tables}>
      {units.map(({ side, title, direction, measure }) => <div key={side} className={styles.tableScroller} role="region" aria-label={`${title} full league table; scroll if needed`} tabIndex={0}>
        <table><caption>{title}<small>{direction} · ordered by unrounded values</small></caption><thead><tr><th scope="col">Rank</th><th scope="col">Team</th><th scope="col">EPA / play</th><th scope="col">Included sample</th></tr></thead><tbody>{measure.entries.map((entry) => <tr key={entry.team} className={entry.team === "NYJ" ? styles.jetsRow : entry.team === comparisonTeam ? styles.opponentRow : undefined}><td>{entry.rank}</td><th scope="row">{entry.team}</th><td>{epaLabel(entry.value, 3)}</td><td>{entry.plays.toLocaleString("en-US")} plays<small>{entry.completedGames} analyzed {entry.completedGames === 1 ? "game" : "games"}</small></td></tr>)}</tbody></table>
      </div>)}
    </div></details>
  </div>;
}
