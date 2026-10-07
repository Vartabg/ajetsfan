import Link from "@/components/IntentLink";
import FocusMoment from "@/components/FocusMoment";
import FocusShell, { type FocusEntry } from "@/components/FocusShell";
import ResultStrip from "@/components/ResultStrip";
import shared from "@/components/Focus.module.css";
import { placeName } from "@/lib/focus";
import { record } from "@/lib/focus-format";
import { loadSeasonArchive } from "@/lib/load-season-archive";
import { phaseResults, seasonNumbers, type ArchiveSeason } from "@/lib/season-archive";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "../focus-fonts";
import styles from "./overview.module.css";

export const metadata = pageMetadata({ path: "/seasons", title: "Jets Season Archive — results, playoffs, stories and film", description: "Explore the Jets by football season: final scores, scoring margins, playoff runs, game evidence, sourced facts, reporting and replays. Historical game coverage begins in 1999 with selected earlier moments." });

const regularRecord = (season: ArchiveSeason) => seasonNumbers(phaseResults(season, "regular"));
const pct = (n: ReturnType<typeof seasonNumbers>) => (n.wins + n.ties / 2) / n.games;

export default async function SeasonsPage() {
  const seasons = await loadSeasonArchive();
  const full = seasons.filter((season) => !season.current && regularRecord(season).games >= 14);
  const ranked = [...full].sort((a, b) => pct(regularRecord(b)) - pct(regularRecord(a)) || b.year - a.year);
  const best = ranked[0], worst = ranked.at(-1);
  const featured = seasons.find((season) => season.year === 2010);
  const run = featured ? phaseResults(featured, "playoffs") : [];
  const runNumbers = seasonNumbers(run);
  const recorded = seasons.filter((season) => season.results.length);

  const entries: FocusEntry[] = [
    { id: "years", title: "Seasons", answer: `${seasons.length} years` },
    run.length ? { id: "run", title: "Start here", answer: "The 2010 playoffs" } : null,
    best && worst && best !== worst ? { id: "extremes", title: "Best and worst", answer: `${best.year} and ${worst.year}` } : null,
  ].filter((entry): entry is FocusEntry => entry !== null);

  return <FocusShell page="seasons" entries={entries} checkedAt={null} className={focusFonts}>
    <FocusMoment id="years" first label="Seasons" heading={<>{seasons.length} Jets seasons. <em>Pick one.</em></>}
      actions={<><Link href="/history" className={shared.go}>Classic games &amp; rivalries <span aria-hidden="true">→</span></Link><Link href="/stories" className={shared.go}>Visual game stories <span aria-hidden="true">→</span></Link></>}>
      <p className={shared.caption}>One square per game: green a win, rust a loss, ringed in the playoffs. Full results begin in {recorded.at(-1)?.year ?? 1999}; earlier years hold selected moments.</p>
      <ol className={styles.years}>{seasons.map((season) => {
        const regular = regularRecord(season), playoffs = seasonNumbers(phaseResults(season, "playoffs"));
        return <li key={season.year}><Link href={`/seasons/${season.year}`} data-archive-year={season.year}>
          <b>{season.year}</b>
          <span className={styles.record}>{regular.games ? `${record(regular.wins, regular.losses, regular.ties)}${playoffs.games ? `, ${record(playoffs.wins, playoffs.losses)} playoffs` : ""}${season.current ? " so far" : ""}` : "Selected moments"}</span>
          <ResultStrip results={season.results} className={styles.strip} />
        </Link></li>;
      })}</ol>
    </FocusMoment>

    {featured && run.length ? <FocusMoment id="run" label="Start here · the 2010 playoffs"
      heading={<>{run.map((game, at) => `${at ? (game.outcome === "win" ? "won" : "lost") : (game.outcome === "win" ? "Won" : "Lost")} at ${placeName(game.opponentDisplay)}`).join(", ")}. <em>{record(runNumbers.wins, runNumbers.losses)} in January 2011.</em></>}
      actions={<Link href="/seasons/2010?phase=playoffs" className={shared.go}>Explore the playoff run <span aria-hidden="true">→</span></Link>}>
      <figure className={shared.shape}>
        <ol className={styles.run}>{run.map((game) => <li key={game.id} data-outcome={game.outcome}><b>{game.outcome === "win" ? "W" : "L"} {game.jetsScore}–{game.oppScore}</b><span>at {placeName(game.opponentDisplay)}</span></li>)}</ol>
        <figcaption>Three road playoff games, with the original reporting and NFL replay on the season page.</figcaption>
      </figure>
    </FocusMoment> : null}

    {best && worst && best !== worst ? <FocusMoment id="extremes" label="Best and worst since 1999"
      heading={<>Best: {best.year}, {record(regularRecord(best).wins, regularRecord(best).losses, regularRecord(best).ties)}. <em>Worst: {worst.year}, {record(regularRecord(worst).wins, regularRecord(worst).losses, regularRecord(worst).ties)}.</em></>}
      actions={<><Link href={`/seasons/${best.year}`} className={shared.go}>Open {best.year} <span aria-hidden="true">→</span></Link><Link href={`/seasons/${worst.year}`} className={shared.go}>Open {worst.year} <span aria-hidden="true">→</span></Link></>}>
      <figure className={shared.shape}>
        {[best, worst].map((season) => <div key={season.year} className={styles.extreme}><b>{season.year}</b><ResultStrip results={season.results} size="large" /></div>)}
        <figcaption>By regular-season winning percentage among complete seasons.</figcaption>
      </figure>
    </FocusMoment> : null}
  </FocusShell>;
}
