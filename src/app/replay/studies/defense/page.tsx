import Link from "next/link";
import { notFound } from "next/navigation";
import FocusShell from "@/components/FocusShell";
import { FullSnapField } from "@/components/FullSnapField";
import shared from "@/components/ReplayStudies.module.css";
import StudyNavigation from "@/components/StudyNavigation";
import { formatDate } from "@/lib/current";
import { defenseMatchHref, defenseStudyPath, featuredDefense, sameReportedPersonnel, type DefensePhase } from "@/lib/defense-match";
import { loadDefenseMatch } from "@/lib/defense-match-data";
import type { DefenseField } from "@/lib/defense-match-field";
import { replayHref } from "@/lib/game-replay";
import { pageMetadata } from "@/lib/site";
import { clockText, periodName, type SearchValues } from "@/lib/snap-explorer";
import { chartLabel, participationProvenance } from "@/lib/snap-participation";
import { teamIdentity } from "@/lib/teams";
import styles from "./defense.module.css";

const title = "Find this defense again";
const downs = ["", "First", "Second", "Third", "Fourth"];
export const metadata = pageMetadata({ path: defenseStudyPath, title: title + " · ajetsfan",
  description: "Compare two real throws against the same charted defense on two full-team fields. Read the alignment, then reveal both plays." });

type Ready = Extract<NonNullable<Awaited<ReturnType<typeof loadDefenseMatch>>>, { state: "ready" }>;
type Criteria = Ready["criteria"];

function snapId(game: SearchValues[string], play: SearchValues[string]) {
  if (game === undefined && play === undefined) return undefined;
  if (typeof game !== "string" || !/^\d{4}_\d{2}_(?:NYJ_[A-Z]{2,3}|[A-Z]{2,3}_NYJ)$/.test(game) ||
      typeof play !== "string" || !/^[1-9]\d{0,7}$/.test(play)) return null;
  return { game, play };
}

function matchup(criteria: Criteria) {
  return downs[criteria.down] + " and " + criteria.distance + " · " + chartLabel(criteria.coverage) + " · " +
    criteria.rushers + (criteria.rushers === 1 ? " rusher" : " rushers");
}

export default async function DefenseMatchPage({ searchParams }: { searchParams: Promise<SearchValues> }) {
  const query = await searchParams;
  const anchor = snapId(query.game, query.play), match = snapId(query.matchGame, query.matchPlay);
  const phase = query.phase ?? "snap";
  if (anchor === null || match === null || (!anchor && match) || (phase !== "snap" && phase !== "action")) notFound();
  const id = anchor ?? featuredDefense;
  const study = await loadDefenseMatch(id, phase, match);
  if (!study) notFound();
  return <FocusShell page="defense-match" name={title} section="/replay" checkedAt={null}
    entries={[{ id: "defense-study", title, answer: "Two plays on the field" }]}>
    <article id="defense-study" className={shared.page + " " + styles.page}>
      <StudyNavigation current="defense"/>
      <header className={shared.intro}><h1>{title}</h1></header>
      {study.state === "ready" ? <Comparison study={study} phase={phase}/> :
        <section className={styles.empty}>
          <h2>{study.state === "empty" ? "No earlier match" : "Comparison unavailable for this snap"}</h2>
          <p>{study.state === "empty" ? matchup(study.criteria) + ". No earlier throw with published charting matches this situation on the same side of the ball." :
            study.missing ? "The published chart is missing " + study.missing + " for this snap." :
            "A comparison needs a recorded throw with a clear ruling, field position, down, distance, coverage and rusher count."}</p>
          <nav className={styles.steps} aria-label="Other replays">
            <a href={replayHref(id.game, id.play, "all")}>Open this play in replay</a>
            {id.game === featuredDefense.game && id.play === featuredDefense.play ? <Link prefetch={false} href="/replay">Choose a game replay</Link> :
              <a href={defenseStudyPath}>Open the featured comparison</a>}
          </nav>
        </section>}
    </article>
  </FocusShell>;
}

function Comparison({ study, phase }: { study: Ready; phase: DefensePhase }) {
  const { criteria, current, earlier, navigation } = study;
  const matchHref = (match: NonNullable<typeof navigation.next>) => defenseMatchHref(current.game, current.play, match);
  return <section aria-labelledby="matched-look" data-defense-comparison={phase}>
    <div className={styles.setup}>
      <h2 id="matched-look">{matchup(criteria)}</h2>
      <p>The Jets are on {criteria.side === "jets" ? "offense" : "defense"} in both games. Coverage and rusher counts come from each game’s post-play charting.</p>
    </div>
    <div className={styles.controls} id="comparison-controls" tabIndex={-1}>
      <form action={defenseStudyPath + "#comparison-controls"} method="get">
        <input type="hidden" name="game" value={current.game}/><input type="hidden" name="play" value={current.play}/>
        <input type="hidden" name="matchGame" value={earlier.game}/><input type="hidden" name="matchPlay" value={earlier.play}/>
        <button type="submit" name={phase === "snap" ? "phase" : undefined} value={phase === "snap" ? "action" : undefined}>
          {phase === "snap" ? "Reveal both plays" : "Rewind both plays"}
        </button>
      </form>
      <nav className={styles.steps} aria-label="Earlier matches">
        <span>Earlier match {navigation.position} of {navigation.total}</span>
        {navigation.previous && <a href={matchHref(navigation.previous)}>Previous match</a>}
        {navigation.next && <a href={matchHref(navigation.next)}>Next match</a>}
        {navigation.first && <a href={matchHref(navigation.first)}>First ranked match</a>}
      </nav>
    </div>
    <div className={styles.fields}>
      <PlayField field={current} label="Selected play" id="selected" phase={phase}/>
      <PlayField field={earlier} label="Earlier play" id="earlier" phase={phase}/>
    </div>
    <a href="#comparison-controls" className={styles.back}>Back to comparison controls</a>
    <footer className={styles.sources}>
      <h2>How the plays match</h2>
      <p>Each throw comes from a different Jets game. The Jets’ side of the ball, down, yards to go, coverage and rusher count match exactly.
        {" "}We rank matches by reported defensive personnel, then offensive personnel, then the most recent game.
        {navigation.total > navigation.shown && " You can browse the first " + navigation.shown + " matches."}</p>
      <p>{personnelComparison("Defensive", current.defensePersonnel, earlier.defensePersonnel)}{" "}
        {personnelComparison("Offensive", current.offensePersonnel, earlier.offensePersonnel)}</p>
      <p>Air yards measure the intended target’s depth from the line of scrimmage. Play accounts and air yards come from <a href="https://nflverse.nflverse.com/">nflverse play-by-play</a>.
        {" "}Participation and defensive charting are from{" "}
        {[...new Set([current.game.slice(0, 4), earlier.game.slice(0, 4)])].map((year, i) => {
          const source = participationProvenance(Number(year));
          return <span key={year}>{i > 0 && " and "}<a href={source.sourceUrl}>{year} {source.provider}</a></span>;
        })}. Selected Jets records are adapted under <a href={participationProvenance(Number(current.game.slice(0, 4))).licenseUrl}>CC BY-SA 4.0</a>.</p>
    </footer>
  </section>;
}

function personnelComparison(unit: string, current?: string, earlier?: string) {
  if (!current || !earlier) return unit + " personnel are unreported for " +
    (!current && !earlier ? "both plays." : !current ? "the selected play." : "the earlier play.");
  return unit + " personnel " + (sameReportedPersonnel(current, earlier) ? "match." : "differ between these plays.");
}

function intendedDepth(result: NonNullable<DefenseField["result"]>) {
  if (result.airYards == null) return "Intended depth unrecorded";
  const gap = result.airYards - result.toGain;
  const yards = (value: number) => Math.abs(value) + (Math.abs(value) === 1 ? " yard" : " yards");
  const relative = gap === 0 ? "at the line to gain" : yards(gap) + (gap > 0 ? " beyond" : " short of") + " the line to gain";
  return result.airYards + (Math.abs(result.airYards) === 1 ? " air yard" : " air yards") + " · " + relative;
}

function PlayField({ field, label, id, phase }: { field: DefenseField; label: string; id: string; phase: DefensePhase }) {
  const team = (code: string) => teamIdentity(code)?.nickname ?? code;
  const opponent = team(field.opponent), match = field.home ? opponent + " at Jets" : "Jets at " + opponent;
  const offense = team(field.offense), defense = team(field.defense);
  return <section className={styles.play} aria-labelledby={id + "-title"} data-defense-board={id} data-game={field.game} data-play={field.play}>
    <header>
      <p className={styles.date}>{label} · <time dateTime={field.date}>{formatDate(field.date)}</time></p>
      <h3 id={id + "-title"}>{match}</h3>
      <p className={styles.score}>{field.score ? "Jets " + field.score[0] + " · " + opponent + " " + field.score[1] : "Score unrecorded"}</p>
      <p className={styles.situation}>At the snap · {periodName(field.quarter)} · {field.clock == null ? "Clock unrecorded" : clockText(field.clock)}</p>
      <p className={styles.spot}>{offense} ball at {field.spot}</p>
    </header>
    <div className={styles.units}>
      <p><strong>O · {offense} offense <span aria-label="attacking upfield">↑</span></strong> {field.formation && field.formation + " · "}{field.offensePersonnel ?? "Personnel unreported"}</p>
      <p><strong>X · {defense} defense</strong> {field.defensePersonnel ?? "Personnel unreported"}</p>
    </div>
    {field.result && <div className={styles.result}>
      <p><strong>{intendedDepth(field.result)}</strong></p>
      <p>{field.result.account}</p>
    </div>}
    <FullSnapField id={id + "-field"} board={field.board} offense={offense} defense={defense}
      yardline={field.yardline} distance={field.distance} kicking={false} caption=""
      verifiedLineups={field.verifiedLineups} singlePhase={phase}/>
    <a className={styles.replay} href={replayHref(field.game, field.play, "all", true)}>Open {match} replay</a>
  </section>;
}
