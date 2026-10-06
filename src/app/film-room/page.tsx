import Link from "next/link";
import FilmReel from "@/components/FilmReel";
import FilmWorkspace from "@/components/FilmWorkspace";
import FocusMoment from "@/components/FocusMoment";
import FocusShell, { type FocusEntry } from "@/components/FocusShell";
import SeasonReturn from "@/components/SeasonReturn";
import shared from "@/components/Focus.module.css";
import { jetsPlays, type JetsPlay } from "@/lib/jets-playbook";
import { loadCurrent, loadCurve, loadGames } from "@/lib/load-games";
import { publishedGames } from "@/lib/published-pages";
import { buildFilmCases, filmGameIds } from "@/lib/film-room";
import { filmScenes } from "@/lib/film-scenes";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "../focus-fonts";
import styles from "./page.module.css";

export const metadata = pageMetadata({
  path: "/film-room", title: "Film Room — Jets plays, sources and scouting concepts",
  description: "Relive iconic Jets plays on an editable animated chalkboard: Jumbo Elliott, Wesley Walker, the Cleveland comeback, the Butt Fumble and the fake spike. Draw your own plays and study the sources.",
});

/** "The Cleveland comeback", "Jumbo Elliott", "The Butt Fumble". */
const shortTitle = (play: JetsPlay) => play.title.split(":")[0];
const outcome = (play: JetsPlay) => play.result.split(" · ").at(-1);

export default async function FilmRoomPage() {
  const [games, current] = await Promise.all([loadGames(), loadCurrent()]);
  const eligible = publishedGames(games, current).filter((game) => filmGameIds.some((id) => id === game.id));
  const curves = Object.fromEntries(await Promise.all(eligible.map(async (game) => [game.id, await loadCurve(game.id)] as const)));
  const cases = buildFilmCases(eligible, curves).map((film) => ({ ...film, scene: filmScenes[film.id] }));
  const [opener] = jetsPlays;

  const entries: FocusEntry[] = [
    { id: "reel", title: "Film Room", answer: `${jetsPlays.length} plays` },
    ...jetsPlays.map((play) => ({ id: `play-${play.id}`, title: `${play.date.slice(0, 4)} · ${play.opponent}`, answer: shortTitle(play) })),
    { id: "tools", title: "Chalkboard", answer: "Take a play apart" },
  ];

  return <FocusShell page="film-room" entries={entries} checkedAt={null} className={focusFonts}>
    <FocusMoment id="reel" first label="Film Room" heading={<>Big Jets plays, <em>drawn out.</em></>}
      status={<SeasonReturn fallback={null} className={styles.seasonReturn} />}
      actions={opener ? <a href={`#play-${opener.id}`} className={shared.go}>Start with {shortTitle(opener)} <span aria-hidden="true">↓</span></a> : null}>
      <div className={shared.shape}>
        <ol className={styles.reel}>{jetsPlays.map((play) => <li key={play.id} data-category={play.category}>
          <a href={`#play-${play.id}`}><b>{shortTitle(play)}</b><span>{play.date.slice(0, 4)} · {outcome(play)}</span></a>
        </li>)}</ol>
        <p className={shared.caption}>Each play is drawn as twenty-two dots: the offense filled, the defense in outline, the key route in green. Press Play to run it, then take it apart on the chalkboard.</p>
      </div>
    </FocusMoment>

    <FilmReel />

    <FocusMoment id="tools" label="Chalkboard · game record" heading={<>Take any play apart. <em>Or draw your own.</em></>}
      actions={<Link href="/how-made#film-sources" className={shared.go}>Sources &amp; methods <span aria-hidden="true">→</span></Link>}>
      <p className={shared.caption}>The chalkboard runs each play step by step and lets you move players and draw routes. The game record has the photo, the official replay and how the win chances swung.</p>
      <div className={styles.tools} data-focus-tools><FilmWorkspace cases={cases} /></div>
    </FocusMoment>
  </FocusShell>;
}
