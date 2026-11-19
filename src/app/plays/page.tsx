import Link from "next/link";
import FocusShell from "@/components/FocusShell";
import FocusMoment from "@/components/FocusMoment";
import SnapMatches from "@/components/SnapMatches";
import shared from "@/components/Focus.module.css";
import styles from "@/components/SnapReader.module.css";
import { loadPublishedGames } from "@/lib/load-published-pages";
import { loadSnapArchive } from "@/lib/load-snaps";
import { lateGameMatches, oneOf, type SearchValues } from "@/lib/snap-explorer";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({ path: "/plays", title: "Two-minute comebacks · ajetsfan", description: "Find Jets games that crossed a late win-probability threshold and open the exact recorded play." });

export default async function PlaysPage({ searchParams }: { searchParams: Promise<SearchValues> }) {
  const [archive, published, params] = await Promise.all([loadSnapArchive(), loadPublishedGames(), searchParams]);
  const games = archive.filter(game => Number(game.id.slice(0, 4)) <= 2025);
  const unavailable = published.filter(game => game.season <= 2025).length - games.length;
  const threshold = oneOf(params.below, ["1", "5", "10"], "1");
  const result = lateGameMatches(games, Number(threshold));
  return <FocusShell page="plays" name="Two-minute comebacks" section="/discover" checkedAt={null} entries={[{ id: "two-minutes", title: "Two minutes left", answer: "Below " + threshold + "%" }]}>
    <FocusMoment id="two-minutes" first label="Jets history · 1999–2025 seasons" heading="Have the Jets ever won from here?">
      <p className={shared.caption}>Find games where the Jets’ estimated chance of winning fell below your cutoff before a run or pass in the final two minutes of regulation.</p>
      <nav className={styles.choices} aria-label="Jets win probability cutoff">{["1", "5", "10"].map(value =>
        <Link key={value} prefetch={false} aria-current={value === threshold ? "true" : undefined} href={"/plays?below=" + value + "#two-minutes"}>Below {value}%</Link>)}</nav>
      {games.length > 0
        ? <SnapMatches result={result} path="/plays" params={params} filters={{ below: threshold }} unavailable={unavailable} retrospective />
        : <p className={shared.caption}>The historical play files are currently unavailable.</p>}
      <Link prefetch={false} href="/replay" className={shared.go}>Browse game replays</Link>
      <p className={shared.note}>Either team may have the ball. Each link opens that game’s lowest qualifying pre-play estimate. Wins are listed first, then losses. Estimates come from nflverse play-by-play.</p>
    </FocusMoment>
  </FocusShell>;
}
