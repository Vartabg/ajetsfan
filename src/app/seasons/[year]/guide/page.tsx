import Link from "next/link";
import { notFound } from "next/navigation";
import SeasonGuide from "@/components/SeasonGuide";
import FocusShell from "@/components/FocusShell";
import FocusMoment from "@/components/FocusMoment";
import shared from "@/components/Focus.module.css";
import { focusFonts } from "../../../focus-fonts";
import { loadSeasonArchive } from "@/lib/load-season-archive";
import { loadSeasonRankings, loadNextGenSeason } from "@/lib/load-season-statistics";
import { nextGenGuide, seasonRankingGuide } from "@/lib/season-presentation";
import { pageMetadata } from "@/lib/site";
import styles from "./page.module.css";

type Props = { params: Promise<{ year: string }> };
export async function generateStaticParams() {
  return (await loadSeasonArchive()).map((season) => ({ year: String(season.year) }));
}
async function seasonYear(value: string) {
  if (!/^\d{4}$/.test(value) || !(await loadSeasonArchive()).some((season) => String(season.year) === value)) notFound();
  return Number(value);
}
export async function generateMetadata({ params }: Props) {
  const year = await seasonYear((await params).year);
  return pageMetadata({ path: `/seasons/${year}/guide`, title: `${year} Jets statistics — sources and definitions`, description: `Definitions, source coverage and calculation notes for the ${year} Jets season.` });
}
export default async function GuidePage({ params }: Props) {
  const year = await seasonYear((await params).year);
  const [rankings, tracking] = await Promise.all([loadSeasonRankings(year), loadNextGenSeason(year)]);
  return <FocusShell page="season-guide" section="/seasons" entries={[
    { id: "guide", title: `${year} statistics`, answer: "The details" },
    { id: "results", title: "Scores", answer: "Football seasons & results" },
    { id: "rankings", title: "Rankings", answer: "Coverage & qualifications" },
    { id: "tracking", title: "Next Gen", answer: "Tracking measurements" },
    { id: "pff", title: "PFF", answer: "Reviewed grade excerpts" },
  ]} checkedAt={null} className={focusFonts}>
    <FocusMoment id="guide" first label={`${year} Jets football`} heading="The details.">
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/seasons">Seasons</Link><span aria-hidden="true">/</span><span>{year}</span><span aria-hidden="true">/</span><span>Sources &amp; definitions</span></nav>
    <p className={shared.caption}>Where this season’s numbers come from, who qualifies, and what each measurement means. Open the source files and publication checks behind the results.</p>
    <nav aria-label="Statistics definitions" className={shared.actions}><a href="#results" className={shared.go}>Scores</a><a href="#rankings" className={shared.go}>Rankings</a><a href="#tracking" className={shared.go}>Next Gen</a><a href="#pff" className={shared.go}>PFF</a></nav>
    </FocusMoment>
    <SeasonGuide year={year} rankings={seasonRankingGuide(rankings)} nextgen={nextGenGuide(tracking.nextgen)} nextgenCheckedAt={tracking.checkedAt} />
  </FocusShell>;
}
