import { driveReadHref } from "@/lib/drive-read-links";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import FocusMoment from "@/components/FocusMoment";
import FocusShell from "@/components/FocusShell";
import CopySnap from "@/components/CopySnap";
import { ClockPicker, DriveSoFar, ProbabilityTrace } from "@/components/SnapEvidence";
import { DiagramLinks } from "@/components/DiagramLinks";
import { SnapChalkboard } from "@/components/SnapChalkboard";
import { replayHref } from "@/lib/game-replay";
import { GameScoreboard, PlayAnalysis, SnapField } from "@/components/SnapGameState";
import { snapAccount, snapHeadline } from "@/lib/snap-context";
import SnapMatches, { SituationForm } from "@/components/SnapMatches";
import shared from "@/components/Focus.module.css";
import styles from "@/components/SnapReader.module.css";
import { ANALYSIS as WILSON_STUDY } from "@/lib/wilson-analysis.mjs";
import { epaLabel } from "@/lib/analytics";
import { formatDate } from "@/lib/current";
import { confirmedSnapForEspn } from "@/lib/espn-snaps";
import { loadEspnSnapGame } from "@/lib/load-espn-snaps";
import { loadFootballState } from "@/lib/load-football";
import { loadLeagueHistory } from "@/lib/load-league-history";
import { loadPublishedGames } from "@/lib/load-published-pages";
import { loadSnapArchive, loadChartedSnapGame } from "@/lib/load-snaps";
import { CLEVELAND, clockCandidates, clockText, periodName, situationMatches, situationRules, snapPath, snapTime, type SearchValues } from "@/lib/snap-explorer";
import type { SnapGame } from "@/lib/snap-types";
import { pageMetadata } from "@/lib/site";
import { teamIdentity } from "@/lib/teams";

type Props = { params: Promise<{ game: string; play: string }>; searchParams: Promise<SearchValues> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game, play } = await params;
  const meta = pageMetadata({ path: snapPath(game, play), title: "Follow a Jets play · ajetsfan", description: "Follow the recorded score and drive through your selected play." });
  const images = [{ url: "/plays/opengraph-image", width: 1200, height: 630, alt: "A recorded Jets play on ajetsfan" }];
  return { ...meta, openGraph: { ...meta.openGraph, images }, twitter: { ...meta.twitter, images } };
}

function WilsonCharting({ epa }: { epa?: number }) {
  const { participation, ftn } = WILSON_STUDY.charting.raw;
  const coverage = WILSON_STUDY.charting.fields.find(field => field.key === "coverage")?.value;
  const filmEpa = WILSON_STUDY.metrics.find(metric => metric.key === "epa")?.value;
  const sources = WILSON_STUDY.sources.filter(source => source.id === "participation" || source.id === "ftn");
  return <div className={styles.charting}>
    <h3>How Cleveland defended Wilson</h3>
    <p>Next Gen Stats charted <strong>{coverage}</strong> against the Jets’ three receivers. Cleveland sent {participation.number_of_pass_rushers} rushers.
      {typeof participation.time_to_throw === "number" && <> Flacco released the ball in <strong>{participation.time_to_throw.toFixed(2)} seconds.</strong></>}
      {ftn.n_blitzers === 0 && <> FTN charted no blitz.</>}</p>
    <details className={styles.jump}><summary>Charting and source editions</summary>
      <p className={shared.note}>The participation record supplies coverage, personnel and release time. FTN supplies the blitz tag.</p>
      <p className={shared.note}>{sources.map(source => source.url && <span key={source.id}><a href={source.url}>{source.attribution}</a>{" · "}</span>)}
        <a href={WILSON_STUDY.provenance.license.url}>CC BY-SA 4.0</a></p>
      {epa != null && typeof filmEpa === "number" && <p className={shared.note}>
        The play reader’s nflverse edition gives the Jets {epaLabel(epa)} EPA. The film study preserves the October 20, 2026 source edition, which gives them {epaLabel(filmEpa)}.
      </p>}
    </details>
    <Link href="/film-room/replay/wilson-cleveland" prefetch={false} className={shared.go}>Study Wilson’s catch in 3D · includes the game result</Link>
  </div>;
}

function ClockSelection({ game, query }: { game: SnapGame; query: SearchValues }) {
  const quarter = typeof query.quarter === "string" && /^[1-6]$/.test(query.quarter) ? Number(query.quarter) : 0;
  const match = typeof query.time === "string" ? /^(\d{1,2}):([0-5]\d)$/.exec(query.time) : null;
  const clock = match ? Number(match[1]) * 60 + Number(match[2]) : -1;
  const valid = quarter > 0 && clock >= 0 && clock <= 900;
  const options = valid ? clockCandidates(game.plays, quarter, clock) : [];
  if (options.length === 1 && options[0].clock === clock) redirect(snapPath(game.id, options[0].key));
  return <FocusShell page="play-clock" section="/game-day" name="Find a clock" checkedAt={null} entries={[{ id: "clock", title: "Find a clock", answer: game.opponent }]}>
    <FocusMoment id="clock" first label={formatDate(game.date) + " · " + game.opponent} heading="Where is your broadcast?">
      <ClockPicker gameId={game.id} play={valid ? { quarter, clock } : undefined} />
      {options.length ? <>
        <p>{options[0].clock !== clock ? "The closest earlier recorded clock is " + snapTime(options[0]) + "." : "The clock stopped here for more than one play."}</p>
        <ol className={styles.clockChoices}>{options.map((option, index) => <li key={option.key}><Link prefetch={false} href={snapPath(game.id, option.key)}>{snapTime(option)} · Play {index + 1} at this clock{option.down ? " · Down " + option.down : ""}</Link></li>)}</ol>
      </> : <p>{valid ? "No unambiguous play is available at or before that clock in this period." : (query.time || query.quarter) ? "Enter a valid period and clock, such as Q3 and 9:54." : "Use the period and time remaining on your screen."}</p>}
    </FocusMoment>
  </FocusShell>;
}

export default async function SnapPage({ params, searchParams }: Props) {
  const [{ game: id, play: key }, query] = await Promise.all([params, searchParams]);
  if (!/^\d{4}_\d{2}_(?:NYJ_[A-Z]{2,3}|[A-Z]{2,3}_NYJ)$/.test(id) || !/^(?:start|clock|[1-9]\d{0,8}|e-\d{1,24})$/.test(key)) notFound();
  const archived = await loadChartedSnapGame(id);
  const providerKey = key.startsWith("e-");
  const needsProvider = providerKey || !archived && (key === "start" || key === "clock");
  const game = needsProvider ? await loadEspnSnapGame(id) : archived;
  if (!game?.plays.length) {
    const [football, history] = await Promise.all([loadFootballState(), loadLeagueHistory().catch(() => null)]);
    const fixture = football.edition.current.schedule.find(row => row.id === id) ?? history?.games.find(row => row.id === id);
    if (!fixture && !game && !archived) notFound();
    const waiting = key === "start" || key === "clock";
    return <FocusShell page="play-waiting" name="Follow the game" section="/game-day" checkedAt={null} entries={[{ id: "waiting", title: "Play by play", answer: "Pending" }]}>
      <FocusMoment id="waiting" first label={fixture ? formatDate(fixture.date) + " · " + fixture.opponentDisplay : "Play by play"}
        heading={waiting ? "Waiting for recorded plays." : "This play is unavailable."}>
        <p className={shared.caption}>{waiting ? "Check back for the first recorded play from this fixture." : "The source for this shared play is currently unavailable."}</p>
        <a href={snapPath(id, key)} className={shared.go}>Check again</a>
      </FocusMoment>
    </FocusShell>;
  }
  if (key === "start") redirect(snapPath(id, game.plays[0].key));
  if (key === "clock") return <ClockSelection game={game} query={query} />;
  const index = game.plays.findIndex(play => play.key === key);
  if (index < 0) notFound();
  const play = game.plays[index];
  const canonical = providerKey && archived ? confirmedSnapForEspn(game, play, archived) : null;
  if (canonical) {
    const params = new URLSearchParams();
    for (const name of ["compare", "window", "margin", "possession", "down", "distance", "outcome", "p", "view"]) {
      const value = query[name];
      if (typeof value === "string") params.set(name, value);
    }
    redirect(snapPath(id, canonical.key) + (params.size ? "?" + params : "") + (query.compare === "1" ? "#compare" : ""));
  }
  const path = snapPath(id, key);
  const chalk = query.view === "chalk";
  const diagramQuery = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) if (name !== "view" && typeof value === "string") diagramQuery.set(name, value);
  const fieldHref = path + (diagramQuery.size ? "?" + diagramQuery : "") + "#evidence";
  diagramQuery.set("view", "chalk");
  const chalkHref = path + "?" + diagramQuery + "#evidence";
  const modeSuffix = chalk ? "?view=chalk" : "";
  const prefix = game.plays.slice(0, index + 1);
  const opponent = teamIdentity(game.opponent);
  const nickname = opponent?.nickname ?? opponent?.city ?? game.opponent;
  const isLiveSource = game.source === "espn";
  const isWilson = id === CLEVELAND && key === "4199" && /G\.Wilson for 15 yards, TOUCHDOWN/i.test(play.description);
  const showComparisons = query.compare === "1";
  const rules = situationRules(query, play);
  const [archive, published] = showComparisons ? await Promise.all([loadSnapArchive(), loadPublishedGames()]) : [[], []];
  const earlier = archive.filter(item => item.date < game.date);
  const expected = published.filter(item => item.date < game.date).length;
  const comparisons = showComparisons && (earlier.length > 0 || expected === 0 && archive.length > 0)
    ? situationMatches(earlier, game, play, rules) : null;
  const sourceUrl = isLiveSource ? "https://www.espn.com/nfl/playbyplay/_/gameId/" + game.eventId : "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_" + id.slice(0, 4) + ".parquet";
  return <FocusShell page="play-reader" name="Play by play" section="/game-day" checkedAt={null} entries={[
    { id: "snap", title: "Your play", answer: snapTime(play) },
    { id: "evidence", title: "Inside the play", answer: "Field, numbers and drive" },
    { id: "compare", title: "Similar situations", answer: "Earlier Jets games" },
  ]}>
    <FocusMoment id="snap" first status={<GameScoreboard game={game} plays={prefix} nickname={nickname} />} heading={snapHeadline(game, play)}>
      <p className={styles.account}>{snapAccount(game, play)}</p>
      <div className={styles.transport} aria-label="Play controls">
        {index > 0 && <Link prefetch={false} href={snapPath(id, game.plays[index - 1].key) + modeSuffix}>Previous play</Link>}
        {index + 1 < game.plays.length ? <Link prefetch={false} className={styles.advance} href={snapPath(id, game.plays[index + 1].key) + modeSuffix}>Next play</Link>
          : isLiveSource ? <a href={path}>Check for the next play</a> : <span>End of the recorded plays.</span>}
        <CopySnap key={path + modeSuffix} path={path + modeSuffix} />
      </div>
      {!isLiveSource && <Link href={replayHref(id, play.key, "key", chalk)} prefetch={false} className={shared.go}>Replay the game from this play</Link>}
      {!isLiveSource && <Link href={driveReadHref(id, { play: play.key })} prefetch={false} className={shared.go}>Read the drive</Link>}
      <div className={styles.disclosures}>
        <details className={styles.jump}><summary>Match my TV clock</summary><ClockPicker gameId={id} play={play} /></details>
        <details className={styles.jump}><summary>Read the play record</summary><p className={styles.record}>{play.description}</p></details>
      </div>
    </FocusMoment>
    <FocusMoment id="evidence" label="Through this play" heading="Inside the play.">
      <DiagramLinks chalk={chalk} fieldHref={fieldHref} chalkHref={chalkHref} />
      {chalk ? <SnapChalkboard game={game} play={play} /> : <SnapField game={game} play={play} />}
      <PlayAnalysis plays={prefix} game={game} />
      {isWilson && <WilsonCharting epa={play.facts?.epa} />}
      <div className={styles.driveEvidence}><h3>Win probability through this play</h3><ProbabilityTrace plays={prefix} live={isLiveSource} /></div>
      <DriveSoFar plays={prefix} gameId={id} />
      <p className={shared.note}>{isLiveSource ? "ESPN event " + game.eventId : "nflverse game " + game.id} · play {isLiveSource ? key.slice(2) : key}</p>
      <a href={sourceUrl} className={shared.go} target="_blank" rel="noreferrer">Full {isLiveSource ? "ESPN record" : "nflverse source"} · includes later plays <span className="sr-only">(opens in a new tab)</span></a>
    </FocusMoment>
    <FocusMoment id="compare" label="Jets history" heading="Have the Jets been here before?">
      <p className={shared.caption}>Compare the situation before this snap with earlier Jets games. The archive includes regular-season and playoff games beginning in 1999.</p>
      {comparisons ? <>
        <p className={styles.context}>Through the day before {formatDate(game.date)} · {periodName(play.quarter)}{play.clock !== null ? " " + clockText(play.clock) : ""}{play.before && " · Jets " + play.before[0] + ", " + nickname + " " + play.before[1] + " before the play"}</p>
        <SituationForm selected={play} path={path} rules={rules} />
        <SnapMatches result={comparisons} path={path} params={query} filters={{ compare: "1", ...rules }} unavailable={expected - earlier.length} />
        <p className={shared.note}>Each game links to its matching run or pass nearest this clock. A tied distance uses the first matching source play.</p>
      </> : showComparisons ? <p className={shared.note}>The historical play files are currently unavailable.</p>
        : <Link prefetch={false} href={path + "?compare=1#compare"} className={shared.go}>Find games like this</Link>}
    </FocusMoment>
  </FocusShell>;
}
