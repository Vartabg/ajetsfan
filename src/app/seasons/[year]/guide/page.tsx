import Link from "next/link";
import { notFound } from "next/navigation";
import SeasonGuide from "@/components/SeasonGuide";
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
  return <main id="main" className={styles.main}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/seasons">Seasons</Link><span aria-hidden="true">/</span><span>{year}</span><span aria-hidden="true">/</span><span>Sources &amp; definitions</span></nav>
    <header className={styles.header}><p>{year} Jets football</p><h1 className="hed">The details.</h1></header>
    <SeasonGuide year={year} rankings={seasonRankingGuide(rankings)} nextgen={nextGenGuide(tracking.nextgen)} nextgenCheckedAt={tracking.checkedAt} />
  </main>;
}
