import { formatDate } from "@/lib/current";
import { fieldPosition, fieldSpot, scoreContext, snapSituation, swingRank } from "@/lib/snap-context";
import { clockText, periodName, snapTime } from "@/lib/snap-explorer";
import { epaLabel, rateLabel } from "@/lib/analytics";
import type { Snap, SnapGame } from "@/lib/snap-types";
import { teamIdentity, teamName } from "@/lib/teams";
import styles from "./SnapReader.module.css";

export function GameScoreboard({ game, plays, nickname }: { game: SnapGame; plays: Snap[]; nickname: string }) {
  const play = plays.at(-1)!;
  const full = teamName(game.opponent);
  const earlier = !play.after && !play.before ? plays.slice(0, -1).findLast(row => row.after !== null) : null;
  const score = play.after ?? play.before ?? earlier?.after;
  const label = play.after ? "Score after this play" : play.before ? "Score entering this play" :
    earlier ? "Last recorded score · " + snapTime(earlier) : "";
  return <div className={styles.gameState}>
    <header className={styles.gameHeader}>
      <div><time dateTime={game.date}>{formatDate(game.date)}</time><p>{game.home ? full + " at New York Jets" : "New York Jets at " + full}</p></div>
      <div className={styles.gameClock}><b>{periodName(play.quarter)}</b>{play.clock !== null && <span>{clockText(play.clock)} {game.source === "espn" ? "· ESPN clock" : "left"}</span>}</div>
    </header>
    {score && <div className={styles.scoreboard} role="group" aria-label={label}>
      <p className={styles.boardLabel}>{label}</p>
      <div className={styles.teamScores}>{["Jets", nickname].map((name, i) => <div className={styles.teamScore} key={i}>
        <div><span>{name}</span>{play.facts?.timeouts && <small>{play.facts.timeouts[i]} {play.facts.timeouts[i] === 1 ? "timeout" : "timeouts"} left</small>}</div>
        <strong>{score[i]}</strong>
      </div>)}</div>
    </div>}
    {!score && play.facts?.timeouts && <p className={styles.scoreContext}>Timeouts remaining · Jets {play.facts.timeouts[0]}, {nickname} {play.facts.timeouts[1]}</p>}
    <p className={styles.scoreContext}>{scoreContext(play.before, play.after, nickname)}</p>
    <p className={styles.snapSituation}>{snapSituation(game, play)}</p>
  </div>;
}

export function SnapField({ game, play }: { game: SnapGame; play: Snap }) {
  const field = fieldPosition(game, play);
  if (!field) return null;
  const { start, line, finish, offense, goal } = field;
  const opponent = teamIdentity(game.opponent);
  const defense = play.possession === "jets" ? opponent?.nickname ?? opponent?.city ?? game.opponent : "Jets";
  const markers = [
    { label: "Ball at snap", value: start, style: styles.ball },
    { label: goal ? "Goal line" : "Line to gain", value: line, style: styles.gainLine },
    ...(finish === null ? [] : [{ label: "Finish", value: finish, style: styles.finish }]),
  ];
  return <figure className={styles.fieldFigure} aria-label="Field position">
    <figcaption><h3>Field position</h3></figcaption>
    <div className={styles.fieldDrawing} aria-hidden="true">
      <div className={styles.fieldPitch}>
        {finish !== null && <span className={styles.travel} style={{ left: (100 - Math.max(start, finish)) + "%", width: Math.abs(start - finish) + "%" }} />}
        {markers.map(m => <i key={m.label} className={m.style} style={{ left: (100 - m.value) + "%" }} />)}
      </div>
      <div className={styles.fieldEnds}><span>{offense} goal</span><span>50</span><span>{defense} goal</span></div>
    </div>
    <dl className={styles.spots}>{markers.map(m => <div key={m.label}>
      <dt><i aria-hidden="true" className={m.style} />{m.label}</dt><dd>{fieldSpot(game, play, m.value, true)}</dd>
    </div>)}</dl>
  </figure>;
}

function CatchBreakdown({ play }: { play: Snap }) {
  const f = play.facts;
  if (f?.airYards == null) return null;
  const depth = f.airYards;
  const gap = play.distance == null || play.distance <= 0 ? null : depth - play.distance;
  const line = f.goalToGo ? "goal line" : "line to gain";
  const caught = f.kind === "completion";
  const point = caught ? "The catch" : "The target";
  const location = gap === null ? null : gap === 0 ? point + " was right on the " + line + "." :
    point + " was " + Math.abs(gap) + (Math.abs(gap) === 1 ? " yard " : " yards ") + (gap < 0 ? "short of" : "beyond") + " the " + line + ".";
  if (!caught && (f.kind === "interception" || f.kind === "incompletion")) return <div className={styles.catchDetail}>
    <h3>Where the throw went</h3>
    <div className={styles.catchNumbers}><span><b>{depth}</b> air yards</span></div>
    {location && <p>{location}</p>}
  </div>;
  if (!caught || !f.simpleAdvance || f.afterCatch == null || f.yards == null || depth + f.afterCatch !== f.yards) return null;
  const yac = f.afterCatch;
  const share = f.yards > 0 && yac > 0 && yac <= f.yards ? Math.round(yac * 100 / f.yards) : null;
  const split = depth < 0 ? "The catch was " + Math.abs(depth) + (depth === -1 ? " yard" : " yards") + " behind the line of scrimmage." :
    share !== null ? share + "% of the gain came after the catch." : null;
  return <div className={styles.catchDetail}>
    <h3>Where the yards came from</h3>
    <div className={styles.catchNumbers}><span><b>{depth}</b> air yards</span><span><b>{yac}</b> after the catch</span></div>
    {(location || split) && <p>{[location, split].filter(Boolean).join(" ")}</p>}
  </div>;
}

function metric(label: string, value: string, detail: string, change?: string) {
  return <div><dt>{label}</dt><dd><b>{value}</b>{change && <p className={styles.oddsChange}>{change}</p>}<p>{detail}</p></dd></div>;
}

export function PlayAnalysis({ plays, game }: { plays: Snap[]; game: SnapGame }) {
  const play = plays.at(-1)!;
  const f = game.source === "nflverse" ? play.facts : undefined;
  const team = teamIdentity(game.opponent);
  const offense = play.possession === "jets" ? "Jets" : play.possession === "opponent" ? team?.nickname ?? team?.city ?? game.opponent : null;
  const rank = swingRank(plays);
  const swing = play.delta;
  const oddsChange = play.wp != null && play.postWp != null ? rateLabel(play.wp) + " → " + rateLabel(play.postWp) : undefined;
  const showEpa = f?.kind && offense && f.epa != null;
  const hasMetrics = showEpa || f?.dropbackProbability != null || f?.completionProbability != null || swing !== null;
  return <>
    {f && <CatchBreakdown play={play} />}
    {hasMetrics && <div className={styles.analysis}>
      <h3>What was the play worth?</h3>
      <dl className={styles.metrics}>
        {showEpa && metric(offense + " EPA", epaLabel(f.epa), "Expected points added for the offense on this play.")}
        {swing !== null && metric("Jets win probability", (swing > 0 ? "+" : swing < 0 ? "−" : "") + Number((Math.abs(swing) * 100).toFixed(1)) + " pts",
          rank ? (rank.tied ? "Tied for #" : "#") + rank.rank + " by size of swing among " + rank.measured + " measured plays so far." : "Change in the Jets’ chance to win on this play.", oddsChange)}
        {f?.dropbackProbability != null && metric("Dropback probability", rateLabel(f.dropbackProbability),
          "Pre-snap chance of a pass, sack or quarterback scramble.")}
        {f?.completionProbability != null && metric("Completion probability", rateLabel(f.completionProbability), "Model estimate that this particular throw would be caught.")}
      </dl>
      {game.source === "nflverse" && <a className={styles.methods} href="https://nflreadr.nflverse.com/articles/dictionary_pbp.html">nflfastR model definitions</a>}
    </div>}
  </>;
}
