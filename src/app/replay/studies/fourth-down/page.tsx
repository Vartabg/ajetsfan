import { notFound } from "next/navigation";
import FocusShell from "@/components/FocusShell";
import StudyNavigation from "@/components/StudyNavigation";
import shared from "@/components/ReplayStudies.module.css";
import { formatDate } from "@/lib/current";
import { driveReadHref } from "@/lib/drive-read-links";
import { calls, callNames, decisionHref, decisionPercent, featuredDecision, fourthDownPath, inFieldGoalRange, probabilityPrecision, type FourthDownCall } from "@/lib/fourth-down-study";
import { fourthDownSeasons, fourthDownSource, loadFourthDown } from "@/lib/load-fourth-down";
import { pageMetadata } from "@/lib/site";
import { snapAccount } from "@/lib/snap-context";
import { clockText, periodName, type SearchValues } from "@/lib/snap-explorer";
import { teamIdentity } from "@/lib/teams";
import styles from "./fourth-down.module.css";

const title = "Make the fourth-down call";
const releaseDate = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(fourthDownSource.releasedAt));
export const metadata = pageMetadata({ path: fourthDownPath, title: title + " · ajetsfan",
  description: "Choose a fourth-down call for the Jets and compare the three modeled win chances with the play the Jets ran." });

const verbs: Record<FourthDownCall, string> = { go: "go for it", punt: "punt", "field-goal": "try a field goal" };
const actualCall: Record<FourthDownCall, string> = { go: "The Jets went for it.", punt: "The Jets punted.", "field-goal": "The Jets tried a field goal." };

export default async function FourthDownPage({ searchParams }: { searchParams: Promise<SearchValues> }) {
  const { game: gameId, play: playId, call, pool } = await searchParams;
  if ((gameId === undefined) !== (playId === undefined) ||
      (gameId !== undefined && (typeof gameId !== "string" || !/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(gameId))) ||
      (playId !== undefined && (typeof playId !== "string" || !/^[1-9]\d{0,7}$/.test(playId))) ||
      (pool !== undefined && pool !== "range" && pool !== "all") ||
      (call !== undefined && call !== "go" && call !== "punt" && call !== "field-goal")) notFound();
  const id = gameId && playId ? { game: gameId, play: playId } : featuredDecision;
  const study = await loadFourthDown(id, pool);
  if (!study) notFound();
  return <FocusShell page="fourth-down-study" section="/replay" name={title} checkedAt={null}
    entries={[{ id: "fourth-down", title: "Fourth down", answer: "Choose the Jets’ call" }]}>
    <article id="fourth-down" className={shared.page + " " + styles.page}>
      <StudyNavigation current="fourth-down"/>
      <header className={shared.intro}><h1>{title}</h1></header>
      {study.state === "unavailable" ? <section>
        <h2 className={styles.heading}>No three-choice comparison for this snap</h2>
        <p>{study.noPunt ? "At the opponent’s 30 or closer, nfl4th does not publish a punt estimate."
          : "This play needs a verified Jets fourth-down call and an estimate for each of the three choices."}</p>
        <a href={fourthDownPath}>Open the featured decision</a>
      </section> : <Decision study={study} call={call}/>}
      <footer className={styles.source}>
        Estimates from <a href="https://www.nfl4th.com/">Ben Baldwin’s nfl4th</a> {fourthDownSource.version}, using nflverse play-by-play.
        {" "}<a href="https://github.com/nflverse/nfl4th/releases/tag/nfl4th_infrastructure">{releaseDate} release</a>.
        {" "}The model uses the game situation, point spread and league kicking patterns.{" "}
        <a href="https://www.nfl4th.com/#current-limitations">Model limitations</a>.
      </footer>
    </article>
  </FocusShell>;
}

type Ready = Extract<NonNullable<Awaited<ReturnType<typeof loadFourthDown>>>, { state: "ready" }>;

function Decision({ study, call }: { study: Ready; call?: FourthDownCall }) {
  const { game, play, row, pool, actual, previous, next, total } = study;
  const opponent = teamIdentity(game.opponent);
  const name = opponent?.nickname ?? opponent?.city ?? game.opponent;
  const territory = row.spot === 50 ? "midfield" : row.spot > 50 ? "the Jets’ " + (100 - row.spot) : "the " + (opponent?.city ?? game.opponent) + " " + row.spot;
  const score = play.before!;
  const poolLink = pool === "range" ? decisionHref(row, "all") : decisionHref(inFieldGoalRange(row.spot) ? row : featuredDecision, "range");
  return <section className={styles.decision} data-game={game.id} data-play={play.key} data-phase={call ? "reveal" : "setup"}>
    <p className={styles.match}>{formatDate(game.date)} · {game.home ? name + " at Jets" : "Jets at " + name}</p>
    <div className={styles.situation}>
      <h2 className={styles.heading}>Fourth and {play.distance} at {territory}</h2>
      <p className={styles.score}><strong>Jets {score[0]}</strong><strong>{name} {score[1]}</strong></p>
      <p className={styles.clock}>{periodName(play.quarter)} · {clockText(play.clock!)} · Jets ball
        {play.facts?.timeouts && <> · Jets timeouts {play.facts.timeouts[0]}, {name} {play.facts.timeouts[1]}</>}</p>
    </div>
    {call ? <>
      <h2 className={styles.heading}>Expected Jets win chance</h2>
      <p>You chose to {verbs[call]}.</p>
      <table className={styles.odds}><thead><tr><th scope="col">Call</th><th scope="col">Win chance</th></tr></thead>
        <tbody>{calls.map(option => <tr key={option}><th scope="row">{callNames[option]}</th>
          <td>{decisionPercent(row[option], probabilityPrecision(row))}</td></tr>)}</tbody></table>
      <Comparison row={row} call={call}/>
      <h2 className={styles.heading}>What the Jets did</h2>
      <p className={styles.result}><strong>{actualCall[actual]}</strong> {snapAccount(game, play)}</p>
      <a href={driveReadHref(game.id, { play: play.key, phase: "action" })}>See the play in Xs &amp; Os</a>
    </> : <form action={fourthDownPath} method="get" className={styles.choose}>
      <input type="hidden" name="game" value={game.id}/><input type="hidden" name="play" value={play.key}/>
      {pool === "all" && <input type="hidden" name="pool" value="all"/>}
      <fieldset><legend>Your call</legend>
        <p>Choose how to play this fourth down to see the modeled win chances and what the Jets did.</p>
        <div>{calls.map(option => <button key={option} type="submit" name="call" value={option}>{callNames[option]}</button>)}</div>
      </fieldset>
    </form>}
    <p className={styles.scope}>{pool === "range" ? "From the opponent’s 31 to 40. " : ""}
      {total.toLocaleString("en-US")} Jets offensive decisions from {fourthDownSeasons} have a credited call and all three nfl4th estimates.
      {" "}Punt estimates begin at the opponent’s 31.{" "}
      <a href={poolLink}>{pool === "range" ? "All modeled decisions" : "Practice from the opponent’s 31–40"}</a>
    </p>
    <nav className={styles.steps} aria-label="Fourth-down decisions">
      {previous && <a href={decisionHref(previous, pool)}>Previous decision</a>}
      {next && <a href={decisionHref(next, pool)}>Next decision</a>}
      {call && <a href={decisionHref(row, pool)}>Choose again</a>}
    </nav>
  </section>;
}

function Comparison({ row, call }: { row: Ready["row"]; call: FourthDownCall }) {
  const high = Math.max(...calls.map(c => row[c]));
  const leaders = calls.filter(c => row[c] === high);
  const nearlyLevel = calls.filter(c => (high - row[c]) * 100 < 0.01);
  if (nearlyLevel.length > leaders.length && nearlyLevel.includes(call)) {
    return <p>{nearlyLevel.map(c => callNames[c]).join(" and ")} are within 0.01 percentage points of the highest estimate.</p>;
  }
  if (leaders.includes(call)) return <p>Your call {leaders.length === 1 ? "has" : "shares"} the highest estimate.</p>;
  const rawGap = (high - row[call]) * 100;
  const gap = Number(rawGap.toFixed(rawGap < 0.1 ? 2 : 1));
  const amount = gap + (gap === 1 ? " percentage point" : " percentage points");
  return <p>{leaders.map(c => callNames[c]).join(" and ")} {leaders.length === 1 ? "has" : "share"} the highest estimate. Your call is {amount} lower.</p>;
}
