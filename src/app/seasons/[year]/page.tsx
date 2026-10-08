import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import Link from "@/components/IntentLink";
import FocusMoment from "@/components/FocusMoment";
import FocusShell, { type FocusEntry } from "@/components/FocusShell";
import ResultStrip from "@/components/ResultStrip";
import SeasonArchive from "@/components/SeasonArchive";
import shared from "@/components/Focus.module.css";
import { placeName } from "@/lib/focus";
import { dayOf, record } from "@/lib/focus-format";
import { eraOf } from "@/lib/jets-eras";
import { loadSeasonArchive } from "@/lib/load-season-archive";
import { loadSeasonRankings, loadNextGenSeason } from "@/lib/load-season-statistics";
import { mediaCollection } from "@/lib/media-catalog";
import { phaseResults, seasonNumbers } from "@/lib/season-archive";
import { seasonArchivePresentation } from "@/lib/season-presentation";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "../../focus-fonts";
import styles from "./year.module.css";

type Props = { params: Promise<{ year: string }> };
export async function generateStaticParams() {
  return (await loadSeasonArchive()).map((season) => ({ year: String(season.year) }));
}
async function findSeason(year: string) {
  if (!/^\d{4}$/.test(year)) notFound();
  const seasons = await loadSeasonArchive();
  const season = seasons.find((entry) => String(entry.year) === year);
  if (!season) notFound();
  return { season, years: seasons.map((entry) => entry.year) };
}
export async function generateMetadata({ params }: Props) {
  const { year } = await params;
  await findSeason(year);
  return pageMetadata({ path: `/seasons/${year}`, title: `${year} Jets Season — results, playoffs, facts and media`, description: `Explore the ${year} Jets football season: recorded final scores, scoring margins, playoff evidence, sourced moments, historical reporting and replays. Coverage gaps are visible.` });
}

export default async function SeasonPage({ params }: Props) {
  const { season, years } = await findSeason((await params).year);
  const [rankings, tracking] = await Promise.all([loadSeasonRankings(season.year), loadNextGenSeason(season.year)]);
  const era = eraOf(season.year);
  const regular = seasonNumbers(phaseResults(season, "regular")), playoffs = seasonNumbers(phaseResults(season, "playoffs"));
  type Game = (typeof season.results)[number];
  const margin = (game: Game) => game.jetsScore - game.oppScore;
  const versus = (game: Game) => `${game.atHome ? "vs" : "at"} ${placeName(game.opponentDisplay)}`;
  const ordered = [...season.results].sort((a, b) => margin(b) - margin(a));
  const best = ordered[0] && margin(ordered[0]) > 0 ? ordered[0] : null;
  const last = ordered.at(-1);
  const worst = last && margin(last) < 0 ? last : null;
  const fact = season.facts[0];
  const so = season.current ? " so far" : "";

  const entries: FocusEntry[] = [
    { id: "year", title: String(season.year), answer: regular.games ? `${record(regular.wins, regular.losses, regular.ties)}${so}` : "Selected moments" },
    best || worst ? { id: "swing", title: "Best and worst", answer: [best && `+${margin(best)}`, worst && `${margin(worst)}`].filter(Boolean).join(" · ") } : null,
    fact ? { id: "moment", title: "Remember", answer: fact.title } : null,
    { id: "explore", title: "Every game", answer: "Scores, rankings, coverage" },
  ].filter((entry): entry is FocusEntry => entry !== null);

  // The season wears the green the team wore that year.
  return <FocusShell page="season" entries={entries} checkedAt={null} className={`${focusFonts} ${styles.era}`} style={{ "--era": era.green } as CSSProperties}>
    <FocusMoment id="year" first label={`${season.year} season · ${era.name}`}
      heading={regular.games ? <>{record(regular.wins, regular.losses, regular.ties)}{so}. <em>{playoffs.games ? `${record(playoffs.wins, playoffs.losses)} in the playoffs.` : season.current ? "Season in progress." : "No playoff games."}</em></> : <>{season.year}. <em>Selected moments.</em></>}>
      {season.results.length ? <figure className={shared.shape}>
        <ResultStrip results={season.results} size="large" />
        <figcaption>{season.results.length} {season.results.length === 1 ? "game" : "games"} in date order: {era.name.toLowerCase()} a win, rust a loss, ringed in the playoffs.</figcaption>
      </figure> : <p className={shared.caption}>Full results for {season.year} are not recorded here; its moments are.</p>}
    </FocusMoment>

    {best || worst ? <FocusMoment id="swing" label="Best and worst day"
      heading={<>{best ? `Won by ${margin(best)} ${versus(best)}.` : "No wins recorded."} <em>{worst ? `Lost by ${-margin(worst)} ${versus(worst)}.` : "No losses recorded."}</em></>}>
      <figure className={shared.shape}>
        <ol className={styles.swing}>{[best, worst].filter((game): game is Game => game !== null).map((game) => <li key={game.id} data-outcome={game.outcome}>
          <b>{game.outcome === "win" ? "W" : "L"} {game.jetsScore}–{game.oppScore}</b><span>{versus(game)} · {game.seasonType === "POST" ? "Playoffs" : `Week ${game.week}`} · {dayOf(game.date)}</span>
        </li>)}</ol>
        <figcaption>By scoring margin.</figcaption>
      </figure>
    </FocusMoment> : null}

    {fact ? <FocusMoment id="moment" label={`Remember · ${fact.phase === "playoffs" ? "Playoffs" : "Regular season"}`} heading={<>{fact.title}</>}
      actions={fact.href ? <Link href={fact.href} className={shared.go}>See the game <span aria-hidden="true">→</span></Link> : undefined}>
      <p className={shared.caption}>{fact.text} <a href={fact.url} rel="noreferrer" target="_blank">{fact.source}</a></p>
    </FocusMoment> : null}

    <FocusMoment id="explore" hosts label={`Every game from ${season.year}`}>
      <div className={styles.tools} data-focus-tools>
        <SeasonArchive season={seasonArchivePresentation(season)} years={years} outlets={mediaCollection.outlets} rankings={rankings} nextgen={tracking.nextgen} nextgenCheckedAt={tracking.checkedAt} />
      </div>
    </FocusMoment>
  </FocusShell>;
}
