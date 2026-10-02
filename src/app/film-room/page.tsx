import Link from "next/link";
import FilmRoom from "@/components/FilmRoom";
import { loadCurrent, loadCurve, loadGames } from "@/lib/load-games";
import { publishedGames } from "@/lib/published-pages";
import { buildFilmCases, filmGameIds } from "@/lib/film-room";
import { filmScenes } from "@/lib/film-scenes";
import { pageMetadata } from "@/lib/site";
import styles from "./page.module.css";

export const metadata = pageMetadata({
  path: "/film-room", title: "Film Room — Jets plays, sources and scouting concepts",
  description: "Relive great and painful Jets plays with official replays, verified game situations, source notes and an interactive coverage and pressure teaching board.",
});

export default async function FilmRoomPage() {
  const [games, current] = await Promise.all([loadGames(), loadCurrent()]);
  const eligible = publishedGames(games, current).filter((game) => filmGameIds.some((id) => id === game.id));
  const curves = Object.fromEntries(await Promise.all(eligible.map(async (game) => [game.id, await loadCurve(game.id)] as const)));
  const cases = buildFilmCases(eligible, curves).map((film) => ({ ...film, scene: filmScenes[film.id] }));
  return <main id="main" className={styles.main}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">The Back Page</Link><span aria-hidden="true">/</span><span>Film Room</span></nav>
    <header className={styles.header}>
      <p className={styles.kicker}>The Jets, one snap at a time</p>
      <h1 className="hed">Film Room<span aria-hidden="true">.</span></h1>
      <p>Great plays. Painful plays. Rewatch the source, examine the situation, and work through the football.</p>
      <nav aria-label="Film Room sections"><Link href="#film-room">Study a play <span aria-hidden="true">↓</span></Link><Link href="#scouting-board">Work the coverage board <span aria-hidden="true">↓</span></Link></nav>
    </header>
    {cases.length ? <FilmRoom cases={cases} /> : <p className={styles.empty}>Verified film cases are unavailable in this edition. <Link href="/morgue">Explore the game archive</Link>.</p>}
    <footer className={styles.footer}><p>Official replays and gamebooks document the plays. Model probability describes the recorded estimate. The teaching board illustrates concepts; a playbook and suitable film are needed to establish actual assignments.</p><Link href="/how-made#film-sources">Film sources and methods <span aria-hidden="true">↗</span></Link></footer>
  </main>;
}
