import Link from "next/link";
import FilmWorkspace from "@/components/FilmWorkspace";
import SeasonReturn from "@/components/SeasonReturn";
import { loadCurrent, loadCurve, loadGames } from "@/lib/load-games";
import { publishedGames } from "@/lib/published-pages";
import { buildFilmCases, filmGameIds } from "@/lib/film-room";
import { filmScenes } from "@/lib/film-scenes";
import { pageMetadata } from "@/lib/site";
import styles from "./page.module.css";

export const metadata = pageMetadata({
  path: "/film-room", title: "Film Room — Jets plays, sources and scouting concepts",
  description: "Relive iconic Jets plays on an editable animated chalkboard: Jumbo Elliott, Wesley Walker, the Cleveland comeback, the Butt Fumble and the fake spike. Draw your own plays and study the sources.",
});

export default async function FilmRoomPage() {
  const [games, current] = await Promise.all([loadGames(), loadCurrent()]);
  const eligible = publishedGames(games, current).filter((game) => filmGameIds.some((id) => id === game.id));
  const curves = Object.fromEntries(await Promise.all(eligible.map(async (game) => [game.id, await loadCurve(game.id)] as const)));
  const cases = buildFilmCases(eligible, curves).map((film) => ({ ...film, scene: filmScenes[film.id] }));
  return <main id="main" className={styles.main}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">The Back Page</Link><span aria-hidden="true">/</span><span>Film Room</span></nav>
    <SeasonReturn fallback={null} className={styles.seasonReturn} />
    <header className={styles.header}>
      <p className={styles.kicker}>The Jets, one snap at a time</p>
      <h1 className="hed">Film Room<span aria-hidden="true">.</span></h1>
      <p>Run a Jets play. Follow a player. Draw your own answer.</p>
    </header>
    <FilmWorkspace cases={cases} />
    <footer className={styles.footer}><Link href="/how-made#film-sources">Sources &amp; methods <span aria-hidden="true">↗</span></Link></footer>
  </main>;
}
