import Link from "next/link";
import { notFound } from "next/navigation";
import SeasonArchive from "@/components/SeasonArchive";
import { loadSeasonArchive } from "@/lib/load-season-archive";
import { loadSeasonRankings, loadNextGenSeason } from "@/lib/load-season-statistics";
import { mediaCollection } from "@/lib/media-catalog";
import { pageMetadata } from "@/lib/site";
import styles from "../page.module.css";

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
  return <main id="main" className={styles.main}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">The Back Page</Link><span aria-hidden="true">/</span><Link href="/seasons">Seasons</Link><span aria-hidden="true">/</span><span>{season.year}</span></nav>
    <header className={styles.header}><p className={styles.kicker}>{season.current ? "Current season · confirmed finals" : "The season archive"}</p><h1 className="hed">{season.year}<span>.</span><br />Jets football.</h1><p>One season, with its results, game evidence, sourced moments and reporting in view. Choose the regular season or playoffs to follow a specific chapter.</p></header>
    <SeasonArchive season={season} years={years} outlets={mediaCollection.outlets} rankings={rankings} nextgen={tracking.nextgen} nextgenCheckedAt={tracking.checkedAt} />
  </main>;
}
