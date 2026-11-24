"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "./IntentLink";
import FocusMoment from "./FocusMoment";
import FocusNext from "./FocusNext";
import InlineMedia from "./InlineMedia";
import FocusShell from "./FocusShell";
import WinLine, { WinChanceDetails } from "./WinLine";
import type { FocusData } from "@/lib/focus";
import type { HomeField } from "@/lib/home-play";
import { dayOf, halfGames, on, ORDINAL, record } from "@/lib/focus-format";
import { formatMediaDate } from "@/lib/media";
import { useMinuteClock } from "@/lib/use-minute-clock";
import shared from "./Focus.module.css";
import styles from "./FocusHome.module.css";
import winLineStyles from "./WinLine.module.css";

const pct = (wp: number) => `${Math.round(wp * 100)}%`;
const QUARTER = ["first quarter", "second quarter", "third quarter", "fourth quarter"];
const quarterName = (q: number) => QUARTER[q - 1] ?? "overtime";

function Toggle({ pressed, onChange, show, hide, className = shared.button }: { pressed: boolean; onChange: (next: boolean) => void; show: string; hide: string; className?: string }) {
  return <button type="button" className={className} aria-pressed={pressed} onClick={() => onChange(!pressed)}>{pressed ? hide : show}</button>;
}

function Go({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className={shared.go}>{children} <span aria-hidden="true">→</span></Link>;
}

function BallPosition({ field }: { field: HomeField }) {
  const from = 100 - field.start, to = 100 - field.finish;
  const gain = Math.abs(to - from) + "-yard " + (to > from ? "gain" : "loss");
  const positions = {
    "--from": from + "%", "--to": to + "%", "--left": Math.min(from, to) + "%", "--distance": Math.abs(to - from) + "%",
    "--middle": (from + to) / 2 + "%",
  } as CSSProperties;
  return <figure className={styles.field} aria-label={"Ball position on a " + gain}>
    <div className={styles.turf} aria-hidden="true">
      <span className={styles.endZone}>{field.offense}</span>
      <div className={styles.pitch} style={positions}>
        <span className={styles.midfield}>50</span><i className={styles.advance} />
        <i className={styles.startSpot} /><i className={styles.endSpot} /><span className={styles.yards}>{gain}</span>
      </div>
      <span className={styles.endZone}>{field.defense}</span>
    </div>
    <figcaption className={styles.spots}>
      <span><i className={styles.beforeDot} />At the snap <strong>{field.startLabel}</strong></span>
      <span><i className={styles.afterDot} />After the play <strong>{field.finishLabel}</strong></span>
    </figcaption>
  </figure>;
}

type LastResult = NonNullable<FocusData["last"]>;

function QuarterScore({ last }: { last: LastResult }) {
  const periods = last.recap!.periods;
  return <div className={styles.quarters}><table>
    <caption>Points by quarter</caption>
    <thead><tr><th scope="col"><span className="sr-only">Team</span></th>
      {periods.map((_, i) => <th scope="col" key={i}>{i < 4 ? "Q" + (i + 1) : i === 4 ? "OT" : (i - 3) + "OT"}</th>)}
      <th scope="col">Final</th></tr></thead>
    <tbody>{["Jets", last.opponentName].map((team, i) => <tr key={team}><th scope="row">{team}</th>
      {periods.map((points, q) => <td key={q}>{points[i]}</td>)}<td>{i === 0 ? last.us : last.them}</td></tr>)}</tbody>
  </table></div>;
}

function LastGame({ last, first }: { last: LastResult; first: boolean }) {
  const [keys, setKeys] = useState(false);
  const line = last.line.length >= 2 ? last.line : null;
  const best = line ? line.reduce((top, point) => point[0] > top[0] ? point : top) : null;
  const play = last.play;
  const difference = Math.abs(last.us - last.them);
  const result = last.outcome === "tie" ? "The game ended in a tie." :
    "The Jets " + (last.outcome === "win" ? "won" : "lost") + " by " + difference + (difference === 1 ? " point " : " points ") + (last.home ? "at home." : "on the road.");
  return <FocusMoment id="last" first={first}
    label={`Last game · ${last.postseason ? "Playoffs" : `Week ${last.week}`} · ${dayOf(last.date)} · Final`}
    heading={<>Jets {last.us}, <em>{last.opponentName} {last.them}</em></>}>
    <div className={styles.recap} data-game-recap>
      <p className={styles.recapText} data-recap-text>{last.recap?.text ?? result}</p>
      {last.recap && <QuarterScore last={last} />}
      <div className={styles.gameLinks}>
        {last.replayHref && <Link className={styles.replay} href={last.replayHref}>Replay the game <span aria-hidden="true">→</span></Link>}
        <Go href={last.href}>{last.hrefLabel}</Go>
      </div>
    </div>
    {play && <details className={winLineStyles.disclosure} data-scoring-play>
      <summary>{play.hasDiagram ? "See a scoring play in Xs & Os" : "See a scoring play"}</summary>
      <div className={styles.story} data-home-play>
        <div className={styles.account}>
          <p className={styles.gameClock}>{play.time}{play.score && " · " + play.score}</p>
          <p className={styles.situation}>{play.situation}</p>
          <p className={styles.playText}>{play.account}</p>
        </div>
        {play.field && <BallPosition field={play.field} />}
        <div className={styles.gameLinks}>
          <Link className={styles.replay} href={play.replay}>{play.hasDiagram ? "Replay in Xs & Os" : "Replay this play"} <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </details>}
    {line && best && <WinChanceDetails>
      <p className={shared.caption}>The line estimates the Jets’ chance to win before each play. A rising line favors New York.</p>
      <WinLine line={line} keys={keys} end="Last snap" turningPoint={last.turningPoint}
        label={`Estimated Jets win chance, play by play. ${pct(line[0][0])} at kickoff, best ${pct(best[0])} in the ${quarterName(best[1])}, ${pct(line.at(-1)![0])} before the last recorded play.`} />
      <Toggle pressed={keys} onChange={setKeys} show="Show chart labels" hide="Hide chart labels" className={styles.chartLabels} />
    </WinChanceDetails>}
  </FocusMoment>;
}

function Season({ season, first }: { season: NonNullable<FocusData["season"]>; first: boolean }) {
  const [scores, setScores] = useState(false);
  const played = season.wins + season.losses + season.ties;
  const left = season.weeks.filter((week) => week.state === "next" || week.state === "upcoming").length;
  return <FocusMoment id="season" first={first} label={`${season.year} season`}
    heading={<>{record(season.wins, season.losses, season.ties)} <em>{played ? `after ${played} game${played === 1 ? "" : "s"}.` : "before the opener."}</em></>}
    actions={<><Toggle pressed={scores} onChange={setScores} show="Show each score" hide="Hide scores" /><Go href={`/seasons/${season.year}`}>Season page</Go></>}>
    <figure className={shared.shape}>
      <ol className={`${styles.marks} ${scores ? styles.scored : ""}`} aria-label={`${season.wins} wins, ${season.losses} losses${season.ties ? `, ${season.ties} ties` : ""}, ${left} games to play.`}>
        {season.weeks.map((week) => <li key={week.week} className={styles[week.state]} data-week-state={week.state}><i aria-hidden="true" /><span>{week.opponent ?? "Bye"}</span>{week.score ? <small>{week.score}</small> : null}<span className="sr-only">{week.state === "bye" ? `Week ${week.week}: bye` : `Week ${week.week}: ${week.opponent}${week.score ? `, ${week.state} ${week.score}` : week.state === "next" ? ", next game" : ""}`}</span></li>)}
      </ol>
      <figcaption className={styles.legend}><span className={styles.keyWin}>Win</span><span className={styles.keyLoss}>Loss</span><span>To play</span></figcaption>
    </figure>
  </FocusMoment>;
}

function Division({ division, first }: { division: NonNullable<FocusData["division"]>; first: boolean }) {
  const [points, setPoints] = useState(false);
  const most = Math.max(1, ...division.teams.map((team) => team.games));
  const heading = division.place === 1
    ? <>{division.tiedAtTop > 1 ? "Tied for first" : "First"} <em>in the {division.name}.</em></>
    : <>{ORDINAL[division.place - 1] ?? `No. ${division.place}`} <em>in the {division.name}, {halfGames(division.back)} behind {division.leader}.</em></>;
  return <FocusMoment id="division" first={first} label={division.name} heading={heading}
    actions={<><Toggle pressed={points} onChange={setPoints} show="Show points" hide="Hide points" /><Go href="/game-day#standings">Standings</Go></>}>
    <figure className={shared.shape}>
      <div className={styles.rows} role="img" aria-label={division.teams.map((team) => `${team.place} ${record(team.wins, team.losses, team.ties)}`).join(", ")}>
        {division.teams.map((team) => <div key={team.team} className={team.us ? styles.us : undefined}>
          <b>{team.team}</b><span className={styles.track}><span style={{ width: `${team.wins / most * 100}%` }} /></span><span>{record(team.wins, team.losses, team.ties)}</span>
          {points ? <small>{team.pointsFor} scored · {team.pointsAgainst} allowed</small> : null}
        </div>)}
      </div>
      <figcaption>Each bar is a team’s games so far; the filled part is wins.</figcaption>
    </figure>
  </FocusMoment>;
}

function Media({ media, first }: { media: NonNullable<FocusData["media"]>; first: boolean }) {
  return <FocusMoment id="media" first={first} label={`Watch & read · ${media.outlet}`} heading={<>{media.title}</>}
    actions={<Go href="/media">Browse the Media Room</Go>}>
    <figure className={shared.shape}>
      <InlineMedia item={media.item} outletName={media.outlet} feature sizes="(max-width: 959px) calc(100vw - 32px), 760px" />
      <figcaption>{formatMediaDate(media.publishedAt)} · {media.outlet}</figcaption>
    </figure>
  </FocusMoment>;
}

type HomeMoment = { content: ReactNode; title: string; answer: string };
export default function FocusHome({
  data,
  renderedAt,
  firstId = null,
  showNext = Boolean(data.next),
  livePlacement = null,
  liveMoment,
  leadersMoment,
  newsMoment,
  className = "",
}: {
  data: FocusData;
  renderedAt: number;
  firstId?: string | null;
  showNext?: boolean;
  livePlacement?: "lead" | "postgame" | null;
  liveMoment?: HomeMoment;
  leadersMoment?: HomeMoment;
  newsMoment?: HomeMoment;
  className?: string;
}) {
  const now = useMinuteClock() || renderedAt;
  const verb = (outcome: "win" | "loss" | "tie") => outcome === "win" ? "Won" : outcome === "loss" ? "Lost" : "Tied";
  const entries = [
    livePlacement === "lead" && liveMoment ? { id: "live", title: liveMoment.title, answer: liveMoment.answer } : null,
    data.last ? { id: "last", title: "Last game", answer: `${verb(data.last.outcome)} ${data.last.us}–${data.last.them}` } : null,
    livePlacement === "postgame" && liveMoment ? { id: "live", title: liveMoment.title, answer: liveMoment.answer } : null,
    showNext && data.next ? { id: "next", title: "Next game", answer: `${data.next.home ? "Vs" : "At"} ${data.next.place}, ${on(data.next.kickoff ?? `${data.next.date}T17:00:00Z`, { weekday: "short" })}` } : null,
    data.season ? { id: "season", title: `${data.season.year} season`, answer: record(data.season.wins, data.season.losses, data.season.ties) } : null,
    data.division ? { id: "division", title: data.division.name, answer: data.division.place === 1 ? "First" : `${ORDINAL[data.division.place - 1] ?? data.division.place}, ${halfGames(data.division.back)} back` } : null,
    leadersMoment ? { id: "leaders", title: leadersMoment.title, answer: leadersMoment.answer } : null,
    newsMoment ? { id: "headlines", title: newsMoment.title, answer: newsMoment.answer } : null,
    data.media ? { id: "media", title: "Watch & read", answer: data.media.outlet } : null,
  ].filter((entry): entry is { id: string; title: string; answer: string } => entry !== null);

  const stale = data.checkedAt && now && now - Date.parse(data.checkedAt) > 86_400_000;
  const days = stale ? Math.floor((now - Date.parse(data.checkedAt!)) / 86_400_000) : 0;
  const status = stale ? <p className={shared.stale} role="status" aria-label="Results update status"><strong>Update overdue.</strong> Results were last checked {days} {days === 1 ? "day" : "days"} ago, so newer results may be missing.</p> : null;

  return <FocusShell page="home" entries={entries} checkedAt={data.checkedAt} className={className}>
    {status ? <div className={shared.staleWrap}>{status}</div> : null}
    {livePlacement === "lead" ? liveMoment?.content : null}
    {data.last ? <LastGame last={data.last} first={firstId === "last"} /> : null}
    {livePlacement === "postgame" ? liveMoment?.content : null}
    {showNext && data.next ? <FocusNext next={data.next} initialTime={renderedAt} matchup={stale ? null : data.next.matchup} first={firstId === "next"} go={{ href: "/game-day", label: "Game Day" }} /> : null}
    {data.season ? <Season season={data.season} first={firstId === "season"} /> : null}
    {data.division ? <Division division={data.division} first={firstId === "division"} /> : null}
    {leadersMoment?.content}
    {newsMoment?.content}
    {data.media ? <Media media={data.media} first={firstId === "media"} /> : null}
  </FocusShell>;
}
