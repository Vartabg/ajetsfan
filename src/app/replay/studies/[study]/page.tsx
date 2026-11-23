import Link from "next/link";
import { notFound } from "next/navigation";
import FocusShell from "@/components/FocusShell";
import StudyNavigation from "@/components/StudyNavigation";
import { SnapChalkboard } from "@/components/SnapChalkboard";
import styles from "@/components/ReplayStudies.module.css";
import { formatDate } from "@/lib/current";
import { driveReadHref } from "@/lib/drive-read-links";
import { loadPublishedGames } from "@/lib/load-published-pages";
import { loadChartedSnapGame, loadStudySeason } from "@/lib/load-snaps";
import { clipId, firstStudySeason, percent, studyGroups, studyHref, type ReplayStudy, type StudyGroup, type StudyLocation, type StudySample } from "@/lib/replay-studies";
import { pageMetadata } from "@/lib/site";
import { snapAccount, snapHeadline, snapSituation } from "@/lib/snap-context";
import { snapTime, type SearchValues } from "@/lib/snap-explorer";
import { teamName } from "@/lib/teams";

type Props = { params: Promise<{ study: string }>; searchParams: Promise<SearchValues> };
const titles = { throws: "Throw to the sticks", "pass-rush": "Four or five rushers?" } as const;
const downs = ["", "1st", "2nd", "3rd", "4th"];
const pageSize = 8;
const integer = (v: unknown, min: number, max: number): v is string =>
  typeof v === "string" && /^[1-9]\d*$/.test(v) && Number(v) >= min && Number(v) <= max;
const match = (sample: StudySample) => "Jets " + (sample.game.home ? "vs. " : "at ") + teamName(sample.game.opponent);

function readLocation(query: SearchValues, study: ReplayStudy, years: number[]): StudyLocation {
  const { season, down, distance, group, clip, page } = query;
  if (season !== undefined && season !== "all" && (!integer(season, 1999, 2200) || !years.includes(Number(season)))) notFound();
  if ((down !== undefined && !integer(down, 1, 4)) || (distance !== undefined && !integer(distance, 1, 99))) notFound();
  if (page !== undefined && !integer(page, 1, 10000)) notFound();
  if (clip !== undefined && (typeof clip !== "string" || !/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}~[1-9]\d*$/.test(clip))) notFound();
  if (group !== undefined && group !== "short" && group !== "sticks" && group !== "four" && group !== "five") notFound();
  if (group && (study === "throws") !== (group === "short" || group === "sticks")) notFound();
  if (!group && (clip || page)) notFound();
  return { season: season && season !== "all" ? Number(season) : undefined, down: Number(down ?? 3), distance: Number(distance ?? 8),
    group, clip, page: Number(page ?? 1) };
}

export async function generateMetadata({ params }: Props) {
  const { study } = await params;
  if (study !== "throws" && study !== "pass-rush") notFound();
  return pageMetadata({ path: "/replay/studies/" + study, title: titles[study] + " · ajetsfan",
    description: study === "throws" ? "Compare third-down targets with the line to gain and replay the Jets’ throws." :
      "Compare sacks and first downs allowed when the Jets rush four or five in the same situation." });
}

function Rate({ count, total }: { count: number; total: number }) {
  return <div className={styles.rate}>
    <strong>{percent(count, total)}</strong> <small>{count.toLocaleString("en-US")} of {total.toLocaleString("en-US")}</small>
    {total > 0 && <div aria-hidden="true" className={styles.track}><i style={{ width: (count / total * 100) + "%" }}/></div>}
  </div>;
}

function Comparison({ study, groups, loc }: { study: ReplayStudy; groups: StudyGroup[]; loc: StudyLocation }) {
  const throws = study === "throws";
  return <table className={styles.comparison}><caption className="sr-only">{throws ? "Third-down throws by target depth" : "Jets pass rush on the selected down and distance"}</caption>
    <thead><tr><th scope="col">{throws ? "Target depth" : "Jets defense"}</th>{!throws && <th scope="col">Sacks</th>}
      <th scope="col">{throws ? "Converted" : "First downs allowed"}</th></tr></thead>
    <tbody>{groups.map(group => <tr key={group.id}><th scope="row">{group.samples.length ?
      <Link prefetch={false} href={studyHref(study, { ...loc, group: group.id, clip: undefined, page: 1 }, "#cutups")}
        aria-current={loc.group === group.id ? "true" : undefined}>{group.label}<small>Replay {group.samples.length.toLocaleString("en-US")} {throws ? "throw" : "play"}{group.samples.length === 1 ? "" : "s"} <span aria-hidden="true">→</span></small></Link>
      : <>{group.label}<small>No qualifying plays</small></>}</th>
      {!throws && <td><Rate count={group.sacks} total={group.samples.length}/></td>}
      <td><Rate count={group.converted} total={group.samples.length}/></td></tr>)}</tbody>
  </table>;
}

async function SampleReader({ group, study, loc }: { group: StudyGroup; study: ReplayStudy; loc: StudyLocation }) {
  const rows = group.samples;
  if (!rows.length) {
    if (loc.clip || loc.page !== 1) notFound();
    return <section id="cutups" className={styles.samples}><h2>{group.label}</h2><p>No verified plays match these filters.</p></section>;
  }
  const index = loc.clip ? rows.findIndex(row => clipId(row) === loc.clip) : ((loc.page ?? 1) - 1) * pageSize;
  if (index < 0 || index >= rows.length) notFound();
  const sample = rows[index];
  const { game, play } = sample;
  const charted = await loadChartedSnapGame(game.id);
  const selected = charted?.plays.find(p => p.key === play.key) ?? play;
  const page = Math.floor(index / pageSize) + 1;
  const pages = Math.ceil(rows.length / pageSize);
  const clipHref = (row: StudySample) => studyHref(study, { ...loc, clip: clipId(row) }, "#cutups");
  const pageHref = (n: number) => studyHref(study, { ...loc, clip: undefined, page: n }, "#cutups");
  const beyond = (selected.facts?.airYards ?? 0) - (selected.distance ?? 0);
  return <section id="cutups" aria-labelledby="cutups-title" className={styles.samples}>
    <p className={styles.sampleCount}>{group.label} · Play {(index + 1).toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")}</p>
    <h2 id="cutups-title">{snapHeadline(game, selected)}</h2>
    <p className={styles.context}>{match(sample)} · <time dateTime={game.date}>{formatDate(game.date)}</time></p>
    <p className={styles.score}>{selected.before ? "Before the snap · Jets " + selected.before[0] + ", " + teamName(game.opponent) + " " + selected.before[1] : "Pre-snap score unavailable"}</p>
    <p className={styles.context}>{snapTime(selected)} · {snapSituation(game, selected)}</p>
    {study === "throws" && <p className={styles.readout}>{beyond === 0 ? "Targeted at the sticks." : "Targeted " + Math.abs(beyond) + (Math.abs(beyond) === 1 ? " yard" : " yards") + (beyond < 0 ? " short of the sticks." : " beyond the sticks.")} {sample.conversion ? "The Jets converted." : "The Jets came up short."}</p>}
    {study === "pass-rush" && <p className={styles.readout}>{selected.facts?.charting?.rushers} Jets rushed. {selected.facts?.kind === "sack" ? "The quarterback was sacked." : sample.conversion ? "The offense picked up a first down or touchdown." : "The offense came up short of a first down."}</p>}
    <nav aria-label="Step through the sample" className={styles.steps}>
      {index > 0 ? <Link prefetch={false} href={clipHref(rows[index - 1])}>Previous play</Link> : <span aria-disabled="true">Previous play</span>}
      {index + 1 < rows.length ? <Link prefetch={false} href={clipHref(rows[index + 1])}>Next play</Link> : <span aria-disabled="true">Next play</span>}
    </nav>
    <SnapChalkboard game={game} play={selected}/>
    <details className={styles.method}><summary>Recorded play account</summary><p>{snapAccount(game, selected)}</p></details>
    <Link className={styles.action} prefetch={false} href={driveReadHref(game.id, { play: play.key })}>Read this drive from the snap</Link>
    <div className={styles.playList}><h3>Plays in this group</h3>
      <ol start={(page - 1) * pageSize + 1}>{rows.slice((page - 1) * pageSize, page * pageSize).map(row =>
        <li key={clipId(row)}><Link prefetch={false} href={clipHref(row)} aria-current={row === sample ? "true" : undefined}>
          <span>{match(row)} · {snapTime(row.play)}</span><small>{formatDate(row.game.date)} · {snapSituation(row.game, row.play)}</small></Link></li>)}</ol>
      {pages > 1 && <nav className={styles.pagination} aria-label="Sample pages">{page > 1 && <Link prefetch={false} href={pageHref(page - 1)}>Previous page</Link>}
        <span>Page {page} of {pages}</span>{page < pages && <Link prefetch={false} href={pageHref(page + 1)}>Next page</Link>}</nav>}
    </div>
  </section>;
}

export default async function ReplayStudyPage({ params, searchParams }: Props) {
  const [{ study }, query, fixtures] = await Promise.all([params, searchParams, loadPublishedGames()]);
  if (study !== "throws" && study !== "pass-rush") notFound();
  const throws = study === "throws";
  const years = [...new Set(fixtures.map(g => g.season))].filter(y => y >= firstStudySeason[study]).sort((a, b) => b - a);
  const loc = readLocation(query, study, years);
  const seasons = loc.season ? [loc.season] : years;
  const games = (await Promise.all(seasons.map(year => loadStudySeason(year, !throws)))).flat();
  const groups = studyGroups(games, study, loc.down, loc.distance);
  const rows = groups.flatMap(g => g.samples);
  const dates = [...new Set(rows.map(s => s.game.id.slice(0, 4)))].sort();
  const gameCount = new Set(rows.map(s => s.game.id)).size;
  const group = groups.find(g => g.id === loc.group);
  const missingRushCounts = !throws && !rows.length && !games.some(g => g.plays.some(p => p.facts?.charting?.rushers != null));
  return <FocusShell page="replay-study" section="/replay" name={titles[study]} checkedAt={null}
    entries={[{ id: "comparison", title: "Compare plays", answer: throws ? "Depth and conversions" : "Sacks and first downs" },
      ...(group ? [{ id: "cutups", title: "Replay the sample", answer: group.label }] : [])]}>
    <article className={styles.page} id="comparison">
      <StudyNavigation current={study}/>
      <header className={styles.intro}><h1>{titles[study]}</h1><p>{throws ? "On third down, how often do the Jets convert when the throw goes short of the marker or reaches it?" :
        "Compare the sacks the Jets get and the first downs they allow when they rush four or five on the same down and distance."}</p></header>
      <form method="get" action={"/replay/studies/" + study} className={styles.controls} aria-label="Filter replay study">
        <label>Season<select name="season" defaultValue={loc.season ?? "all"}><option value="all">All seasons</option>{years.map(year => <option key={year}>{year}</option>)}</select></label>
        {!throws && <><label>Down<select name="down" defaultValue={loc.down}>{[1, 2, 3, 4].map(n => <option value={n} key={n}>{downs[n]} down</option>)}</select></label>
          <label>Yards to go<input type="number" name="distance" min="1" max="99" step="1" defaultValue={loc.distance} required/></label></>}
        <button type="submit">Compare plays</button>
      </form>
      <section className={styles.results} aria-labelledby="result-title"><h2 id="result-title">{throws ? "Third-down conversions" : downs[loc.down] + " down · " + loc.distance + " to go"}</h2>
        {rows.length > 0 ? <p className={styles.scope}>{rows.length.toLocaleString("en-US")} measured {throws ? "throws" : "pass plays and sacks"} in {gameCount} {gameCount === 1 ? "game" : "games"} · {dates[0]}{dates.length > 1 ? "–" + dates.at(-1) : ""}</p> :
          <p className={styles.scope}>{missingRushCounts
            ? "The archive has no recorded rusher counts for " + (loc.season ?? "these seasons") + "."
            : "No verified plays match this situation in " + (loc.season ?? "the available seasons") + "."}</p>}
        <Comparison study={study} groups={groups} loc={loc}/>
      </section>
      <details className={styles.method}><summary>How this is counted</summary>
        {throws ? <p>The sample starts in 2009, when depth is recorded on both catches and incompletions. Each throw needs a named target, recorded air yards, yards to go, and a known third-down outcome. Air yards measure the target from the line of scrimmage. The rate uses the official conversion credit. Older records can also establish a conversion with a credited first down or offensive touchdown. A catch short of the marker can still convert after the catch. <a href="https://github.com/nflverse/nflverse-data/releases/tag/pbp">nflverse play-by-play</a>.</p> :
          <p>Each group uses the same down and exact yards to go. It counts charted opponent passes and sacks with a known outcome against exactly four or five Jets rushers. Rates describe these recorded plays. Personnel, opponents and coverage can differ. Charting adapted from NFL Next Gen Stats through 2022 and FTN Data from 2023. <a href="https://github.com/nflverse/nflverse-data/releases/tag/pbp_participation">Participation records</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.</p>}
      </details>
      {group && <SampleReader study={study} group={group} loc={loc}/>}
      <footer className={styles.footer}><Link prefetch={false} href="/team/stats">Jets team stats</Link><Link prefetch={false} href="/replay">Choose a game</Link></footer>
    </article>
  </FocusShell>;
}
