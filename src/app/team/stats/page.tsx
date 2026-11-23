import { notFound } from "next/navigation";
import PlayerLeaders from "@/components/PlayerLeaders";
import FootballLiveCard from "@/components/football-live-card";
import { RedZoneTrips } from "@/components/RedZoneTrips";
import Link from "@/components/IntentLink";
import FocusMoment from "@/components/FocusMoment";
import FocusShell from "@/components/FocusShell";
import TeamFocusNavigation from "@/components/TeamFocusNavigation";
import shared from "@/components/Focus.module.css";
import { formatDate, mergeResults } from "@/lib/current";
import { driveReadHref } from "@/lib/drive-read-links";
import { loadCoverage } from "@/lib/load-coverage";
import { loadCurrent } from "@/lib/load-games";
import { loadFootballLive } from "@/lib/load-football";
import { loadPublishedGames } from "@/lib/load-published-pages";
import { loadStudySeason } from "@/lib/load-snaps";
import { firstStudySeason, percent, studyHref, type ReplayStudy } from "@/lib/replay-studies";
import { pageMetadata } from "@/lib/site";
import { snapTime } from "@/lib/snap-explorer";
import { situationHref, situationNames, teamSituations, type Situation, type SituationCounts, type SituationSettings } from "@/lib/team-situations";
import { teamName } from "@/lib/teams";
import { focusFonts } from "../../focus-fonts";
import teamStyles from "../focus.module.css";
import styles from "./stats.module.css";

export const metadata = pageMetadata({ path: "/team/stats", title: "Jets Team Stats — ajetsfan",
  description: "Explore Jets play calling, third downs, red-zone trips and production by quarter, with the plays behind each number and the latest player leaders." });
export const dynamic = "force-dynamic";

type Report = ReturnType<typeof teamSituations>;
type Query = Record<string,string | string[] | undefined>;
const mainRows: Situation[] = ["third-down","red-zone","red-zone-calls","early-downs"];
const timeRows: Situation[] = ["two-minute","close-fourth","q1","q2","q3","q4"];
const recentLabel = (n: number) => n === 1 ? "Last game" : "Last " + (n || "four") + " games";

function settingsFrom(query: Query, defaultSeason: number): SituationSettings {
  const {season=String(defaultSeason),side="offense",sample="red-zone",window="recent",page="1"} = query;
  if (typeof season !== "string" || !/^\d{4}$/.test(season) || (side !== "offense" && side !== "defense") ||
      typeof sample !== "string" || !Object.hasOwn(situationNames,sample) || (window !== "recent" && window !== "season") ||
      typeof page !== "string" || !/^[1-9]\d{0,4}$/.test(page)) notFound();
  return { season:Number(season), side, sample:sample as Situation, window, page:Number(page) };
}

function Rate({counts,sample}:{counts:SituationCounts;sample:Situation}) {
  if (!counts.total) return <>Unavailable <small>0 {sample === "red-zone" ? "resolved trips" : "eligible plays"}</small></>;
  const {positive,total} = counts;
  const fraction = positive + " of " + total;
  const label = sample === "red-zone" ? fraction + " trips ended in TDs" : sample === "third-down" ? fraction + " converted" :
    positive + " dropbacks · " + (total-positive) + " runs";
  return <><strong>{percent(positive,total)}{sample === "early-downs" || sample === "red-zone-calls" ? " dropbacks" : ""}</strong><small>{label}</small></>;
}

function Production({counts}:{counts:SituationCounts}) {
  return counts.total ? <><strong>{counts.dropbacks} dropbacks · {counts.total-counts.dropbacks} runs</strong>
    <small>{counts.yardPlays ? (counts.yards/counts.yardPlays).toFixed(1) + " yd/play · " + counts.yards + " yd on " + counts.yardPlays + " plays" : "Yardage unavailable"}</small></> :
    <>Unavailable <small>0 eligible plays</small></>;
}

function Compare({report,settings,clock}:{report:Report;settings:SituationSettings;clock?:Situation}) {
  const times = clock !== undefined;
  return <table className={styles.compare} aria-label={times ? "Play calling and yards by clock situation" : "Situational rates"}>
    <thead><tr><th scope="col">Situation</th><th scope="col">Full season</th><th scope="col">{recentLabel(report.recent.selected)}</th></tr></thead>
    <tbody>{(clock ? [clock] : mainRows).map(sample => <tr key={sample}>
      <th scope="row">{settings.side === "defense" && (sample === "red-zone-calls" || sample === "early-downs") ? "Opponent "+situationNames[sample].toLowerCase() : situationNames[sample]}</th>
      {(["season","recent"] as const).map(window => {
        const row = report[window].rows[sample], period = window === "season" ? "Full season" : recentLabel(report.recent.selected);
        return <td key={window}><span className={styles.mobileLabel}>{period}</span>
          {row.total ? <a href={situationHref(settings,{sample,window,page:1})}>
            {times ? <Production counts={row}/> : <Rate counts={row} sample={sample}/>}
            <span className="sr-only"> · View {situationNames[sample].toLowerCase()} plays, {period.toLowerCase()}</span></a> : <Rate counts={row} sample={sample}/>}
          {row.unknown > 0 && <small>{row.unknown} {row.unknown === 1 ? "outcome" : "outcomes"} unavailable</small>}
        </td>;
      })}
    </tr>)}</tbody>
  </table>;
}

function takeaway(report: Report, settings: SituationSettings) {
  const key = settings.sample, season = report.season.rows[key], recent = report.recent.rows[key];
  const subject = settings.side === "offense" ? "The Jets" : "Jets opponents";
  if (!season.total) return "The archive has no eligible " + situationNames[key].toLowerCase() + " sample for this selection.";
  function rate(row: SituationCounts) {
    const count = row.positive + " of " + row.total;
    if (key === "red-zone") return subject + " scored touchdowns on " + count + " red-zone trips";
    if (key === "third-down") return subject + " converted " + count + " recorded third downs";
    const situation = key === "early-downs" ? "first- and second-down plays" : key === "red-zone-calls" ? "red-zone plays" :
      "plays in this clock split";
    return subject + " dropped back on " + count + " " + situation;
  }
  if (!recent.total || report.recent.selected === report.season.selected)
    return rate(season) + " this season (" + percent(season.positive,season.total) + ").";
  if (key === "red-zone" && !recent.unknown && report.recent.covered === report.recent.selected) {
    const fieldGoals = report.redZoneGames.flatMap(g => g.trips).filter(t => t.label === "Field goal").length;
    const kicks = fieldGoals ? " and kicked " + fieldGoals + (fieldGoals === 1 ? " field goal" : " field goals") : "";
    return subject + " scored " + recent.positive + (recent.positive === 1 ? " touchdown" : " touchdowns") + kicks +
      " on " + recent.total + " red-zone trips in the last four games. Their season touchdown rate is " +
      percent(season.positive,season.total) + " (" + season.positive + " of " + season.total + " trips).";
  }
  const delta = 100*(recent.positive/recent.total-season.positive/season.total);
  const change = Math.abs(delta) < .05 ? "the same rate as" : Math.abs(delta).toFixed(1) + " percentage points " + (delta > 0 ? "above" : "below");
  const span = report.recent.covered === report.recent.selected ? "in the last four games" : "in the covered games from the last four";
  return rate(recent) + " " + span + " (" + percent(recent.positive,recent.total) + "), " +
    change + " their full-season rate of " + percent(season.positive,season.total) + ".";
}

export default async function TeamStatsPage({searchParams}:{searchParams:Promise<Query>}) {
  const [coverage,current,live,published,query] = await Promise.all([loadCoverage(),loadCurrent(),loadFootballLive(),loadPublishedGames(),searchParams]);
  const results = mergeResults(published,current);
  const leaderSeason = current?.season ?? coverage?.season;
  const years = [...new Set([...results.filter(g => g.seasonType === "REG").map(g => g.season),...(current ? [current.season] : [])])].sort((a,b) => b-a);
  const settings = settingsFrom(query,years[0] ?? leaderSeason ?? 1999);
  const selectedSeason = settings.season;
  const games = years.includes(selectedSeason) ? await loadStudySeason(selectedSeason,false,true) : [];
  const report = teamSituations(results,games,settings);
  const currentStats = coverage && coverage.stats.season === leaderSeason && coverage.stats.status !== "unavailable";
  const showGame = live?.featured && live.season === leaderSeason && ["live","final","suspended"].includes(live.featured.state);
  const unit = settings.side === "offense" ? "Jets offense" : "Jets defense";
  const selectedRow = report[settings.window].rows[settings.sample];
  const clock = timeRows.includes(settings.sample) ? settings.sample : "close-fourth";
  const tripChart = settings.sample === "red-zone" && settings.window === "recent" && report.redZoneGames.length > 0;
  const windowText = settings.window === "recent" ? recentLabel(report.recent.selected).toLowerCase() : "full season";
  const missing = results.filter(g => g.season === selectedSeason && g.seasonType === "REG" && !games.some(covered => covered.id === g.id));
  function studyLink(study: ReplayStudy, label: string) {
    const first = firstStudySeason[study];
    const eligible = selectedSeason >= first && published.some(f => f.season === selectedSeason) &&
      (study !== "pass-rush" || selectedSeason !== current?.season);
    return <Link href={studyHref(study,{season:eligible ? selectedSeason : undefined,down:3,distance:8})}>
      {label}{!eligible && (study === "pass-rush" ? " · charted seasons since " : " · seasons since ") + first}</Link>;
  }
  return <FocusShell page="team-stats" section="/team" className={focusFonts} checkedAt={coverage?.stats.checkedAt ?? null}
    entries={[{id:"situations",title:"Team stats",answer:unit},{id:"time-splits",title:"By the clock",answer:"Play calling and yards"},
      {id:"supporting-plays",title:"Supporting plays",answer:situationNames[settings.sample]},{id:"leaders",title:"Player leaders",answer:String(leaderSeason ?? "Current edition")}]}>
    <FocusMoment id="situations" first heading="Team stats." status={<TeamFocusNavigation/>}>
      <form action="/team/stats#situations" method="get" className={styles.filters} aria-label="Select a season and unit">
        <div><label htmlFor="team-stats-season">Season</label><select id="team-stats-season" name="season" defaultValue={selectedSeason}>
          {!years.includes(selectedSeason) && <option value={selectedSeason}>{selectedSeason}</option>}{years.map(y => <option key={y}>{y}</option>)}</select></div>
        <div><label htmlFor="team-stats-side">Unit</label><select id="team-stats-side" name="side" defaultValue={settings.side}><option value="offense">Jets offense</option><option value="defense">Jets defense</option></select></div>
        <input type="hidden" name="sample" value={settings.sample}/><input type="hidden" name="window" value={settings.window}/>
        <button className={shared.button} type="submit">Show stats</button>
      </form>
      <p className={styles.takeaway}>{takeaway(report,settings)}</p>
      <p className={styles.coverage}><b>{selectedSeason} · {unit}.</b> {report.season.selected ? <>
        Play-by-play covers {report.season.covered} of {report.season.selected} {selectedSeason === current?.season ? "confirmed" : "published"} regular-season games
        {report.season.through ? " through " + formatDate(report.season.through) : ""}, including {report.recent.covered} of the latest {report.recent.selected}.
      </> : "No regular-season finals are available for this season in the archive."}
        {missing.length > 0 && " Play-by-play is unavailable for " + missing.map(g => "Week " + g.week + (g.atHome ? " vs. " : " at ") + teamName(g.opponentDisplay)).join(", ") + "."}</p>
      <Compare settings={settings} report={report}/>
      <p className={styles.definition}>Select a figure to see its plays. A red-zone trip starts with a credited scrimmage snap at the opponent’s 20 or closer.
        Each drive counts once, including drives that end on kneels. Only resolved trip outcomes count in the touchdown rate. Third downs use official conversion or failure credits, including penalties that count.
        Older archives without third-down credits use recorded first-down and touchdown outcomes on runs and dropbacks.
        Dropbacks include passes, sacks and recorded scrambles. Play-calling splits exclude kneels, spikes and plays without a credited run or pass.</p>
      <nav aria-label="Replay studies" className={styles.studies}>
        {studyLink("throws","Third-down target depth")}
        {studyLink("pass-rush","Four or five pass rushers")}
        <Link href="/replay/studies/fourth-down">Choose the fourth-down call</Link>
      </nav>
    </FocusMoment>
    <FocusMoment id="time-splits" label={selectedSeason+" · "+unit} heading="By the clock.">
      <form action="/team/stats#time-splits" method="get" className={styles.filters}>
        <input type="hidden" name="season" value={selectedSeason}/><input type="hidden" name="side" value={settings.side}/>
        <input type="hidden" name="window" value={settings.window}/>
        <div><label htmlFor="clock-sample">Game situation</label><select id="clock-sample" name="sample" defaultValue={clock}>
          {timeRows.map(key => <option value={key} key={key}>{key === "close-fourth" ? "One-score fourth quarter" :
            key === "two-minute" ? "Final two minutes of each half" : situationNames[key]}</option>)}</select></div>
        <button className={shared.button} type="submit">Show split</button>
      </form>
      <p className={styles.explainer}>{settings.side === "defense" ? "These are opponents’ play calls and yards against the Jets. " : ""}A one-score game is tied or within eight points before the snap. The two-minute split uses the game clock in the second and fourth quarters.
        Yardage averages use plays with recorded yards.</p>
      <Compare clock={clock} settings={settings} report={report}/>
    </FocusMoment>
    <FocusMoment id="supporting-plays" label={selectedSeason+" · "+unit} heading="Supporting plays.">
      {!tripChart && <h3 className={styles.sampleTitle}>{situationNames[settings.sample]} · {windowText}</h3>}
      {tripChart ? <RedZoneTrips games={report.redZoneGames}/> : report.examples.length ? <>
        <p className={styles.explainer}>Showing {report.start+1}–{report.start+report.examples.length} of {report.total} {settings.sample === "red-zone" ? "trips" : "plays"}.
          Select a play for its score, clock and recorded account. An Xs &amp; Os diagram appears when the play record supports one.</p>
        <ul role="list" className={styles.plays}>{report.examples.map(({game,play,outcome}) =>
          <li key={game.id+"/"+play.key}><a href={driveReadHref(game.id,{play:play.key,phase:"action"})}>
            <span>Week {game.week} · {game.atHome ? "vs. " : "at "}{teamName(game.opponentDisplay)}<small>{snapTime(play)} · {formatDate(game.date)}</small></span>
            <strong>{outcome} <span aria-hidden="true">↗</span></strong>
          </a></li>)}</ul>
      </> : <p className={styles.explainer}>{report.total ? "This page is beyond the available plays." : "No eligible plays have a recorded outcome for this selection."}
        {selectedRow.unknown > 0 && " The archive leaves " + selectedRow.unknown + " outcomes unresolved."}</p>}
      {!tripChart && report.pages > 0 && (report.pages > 1 || settings.page > 1) ? <nav className={styles.pager} aria-label="Supporting play pages">
        {settings.page > 1 && <a href={situationHref(settings,{page:Math.min(settings.page-1,report.pages)})}>Previous plays</a>}
        {settings.page < report.pages && <a href={situationHref(settings,{page:settings.page+1})}>More plays</a>}
      </nav> : null}
      <p className={styles.definition}>Source <a href="https://github.com/nflverse/nflverse-data/releases/tag/pbp">nflverse play-by-play</a>.</p>
    </FocusMoment>
    <FocusMoment id="leaders" heading="Player leaders." label={(leaderSeason ? leaderSeason+" regular season" : "Current edition")+
      (currentStats && coverage.stats.throughWeek != null ? " · through Week "+coverage.stats.throughWeek : "")}
      actions={<Link className={shared.go} href="/how-made">Sources &amp; definitions <span aria-hidden="true">→</span></Link>}>
      {showGame && live ? <><FootballLiveCard feed={live} id="latest-game-box-score" boxScore/><h3 className={styles.sampleTitle}>Confirmed season totals</h3></> : null}
      {coverage ? <div className={teamStyles.content}><PlayerLeaders stats={coverage.stats} roster={coverage.roster} editionSeason={leaderSeason ?? coverage.season} externalHeadingId="leaders-heading"/></div> :
        <p className={shared.caption}>Player statistics will appear after the next successful source check.</p>}
    </FocusMoment>
  </FocusShell>;
}
