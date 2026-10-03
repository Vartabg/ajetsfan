import { pageMetadata } from "@/lib/site";
import { publishedPlayers } from "@/lib/published-pages";
import Link from "@/components/IntentLink";
import { leaders } from "@/lib/coverage";
import { loadCoverage } from "@/lib/load-coverage";
import { loadCurrent } from "@/lib/load-games";
import { formatDate } from "@/lib/current";
import { teamEditorialPhoto } from "@/lib/editorial-photos";
import EditorialPhoto from "@/components/EditorialPhoto";
import styles from "./page.module.css";

export const metadata = pageMetadata({
  path: "/team",
  title: "The Team — The Back Page",
  description: "Meet the Jets, check player production, and catch up with the latest official team headlines.",
});

export default async function TeamPage() {
  const [coverage, current] = await Promise.all([loadCoverage(), loadCurrent()]);
  const season = current?.season ?? coverage?.season;
  const coverPhoto = season != null ? teamEditorialPhoto(season) : null;
  const rosterAvailable = !!coverage && coverage.roster.status !== "unavailable";
  const currentRoster = rosterAvailable && coverage.roster.season === season;
  const profileIds = new Set(coverage ? publishedPlayers(coverage, season ?? coverage.season).map((player) => player.id) : []);
  const featured = coverage && currentRoster ? (["passing", "rushing", "receiving"] as const).flatMap((kind) => {
    const leader = coverage.stats.season === season && coverage.stats.status !== "unavailable" ? leaders(coverage.stats, kind)[0] : undefined;
    const player = leader && coverage.roster.players.find((entry) => entry.id === leader.id);
    return player && leader ? [{ player, kind, yards: leader[kind].yards }] : [];
  }).filter((entry, index, players) => players.findIndex((candidate) => candidate.player.id === entry.player.id) === index) : [];
  const latest = coverage?.news.items.toSorted((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id))[0];

  return <>
    <header className={`${styles.overviewHero} ${!coverPhoto ? styles.solo : ""}`}>
      <div><p className={styles.kicker}>{season ? `${season} Jets` : "New York Jets"}</p><h1 className="hed" tabIndex={-1}>The team.</h1><p>The players. Their production. What’s happening in Florham Park.</p></div>
      {coverPhoto ? <EditorialPhoto photo={coverPhoto} eager className={styles.coverPhoto} sizes="(max-width: 640px) calc(100vw - 2rem), (max-width: 1288px) calc(50vw - 2.5rem), 604px" /> : null}
    </header>
    {featured.length ? <section className={styles.featured} aria-labelledby="featured-players-heading">
      <div className={styles.sectionHeading}><h2 id="featured-players-heading">Leading the way</h2><span>{season} yardage leaders</span></div>
      <div className={styles.lineupPlayers}>{featured.map(({ player, kind, yards }) => <Link className={styles.featuredPlayer} href={profileIds.has(player.id) ? `/players/${encodeURIComponent(player.id)}` : `/team/roster?${new URLSearchParams({ player: player.id })}#roster`} key={player.id}>
        <span className={styles.jersey} aria-hidden="true">{player.jersey ?? player.position}</span>
        <span className={styles.featuredName}><strong>{player.name}</strong><span>{yards.toLocaleString("en-US")} {kind} yards</span><span className={styles.profileCue}>View profile <span aria-hidden="true">→</span></span></span>
      </Link>)}</div>
    </section> : null}
    <div className={styles.destinations}>
      <Link href="/team/roster" className={styles.destination}><span className={styles.kicker}>The players</span><h2 className="hed">Roster <span aria-hidden="true">→</span></h2><p>{rosterAvailable ? `${coverage.roster.players.length} profiles in the ${coverage.roster.season} roster.` : "Find a player by name, number or position."}</p><span className={styles.destinationCue}>Find your player</span></Link>
      <Link href="/team/stats" className={styles.destination}><span className={styles.kicker}>On the field</span><h2 className="hed">Player stats <span aria-hidden="true">→</span></h2><p>Passing, rushing and receiving leaders.{coverage && coverage.stats.season === season && coverage.stats.throughWeek != null ? ` Through Week ${coverage.stats.throughWeek}.` : ""}</p><span className={styles.destinationCue}>See the numbers</span></Link>
      <Link href="/team/news" className={styles.destination}><span className={styles.kicker}>Official team coverage</span><h2 className="hed">News <span aria-hidden="true">→</span></h2><p>{latest?.title ?? "The latest checked headlines from Florham Park."}</p>{latest ? <time dateTime={latest.publishedAt}>{formatDate(latest.publishedAt)}</time> : null}<span className={styles.destinationCue}>Catch up</span></Link>
    </div>
  </>;
}
