import Link from "@/components/IntentLink";
import FocusShell from "@/components/FocusShell";
import FocusMoment from "@/components/FocusMoment";
import FocusPlay from "@/components/FocusPlay";
import VisualGameStory from "@/components/VisualGameStory";
import JourneyComparison from "@/components/JourneyComparison";
import JourneyActions from "@/components/JourneyActions";
import { loadGames, loadCurrent, loadCurve } from "@/lib/load-games";
import { publishedGames } from "@/lib/published-pages";
import { buildVisualStory } from "@/lib/visual-story";
import { getJetsPlayDesign, jetsPlays } from "@/lib/jets-playbook";
import { getJetsStudy } from "@/lib/jets-snap-study";
import { CLEVELAND_GAME, JOURNEY_PATH, JOURNEY_STEPS, MIAMI_GAME, journeyStep } from "@/lib/miracle-journey";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "../../focus-fonts";
import shared from "@/components/Focus.module.css";
import styles from "@/components/MiracleJourney.module.css";

export const metadata = pageMetadata({ path: JOURNEY_PATH, title: "The Monday Night Miracle — a Jets journey", description: "Relive the 23-point comeback, explore Jumbo Elliott’s catch, and compare Miami in 2000 with Cleveland in 2022. Save your place and share a step." });

export default async function MiracleJourney({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const step = journeyStep(params.step);
  const selectedStep = JOURNEY_STEPS.find((item) => item.id === step)!;
  const [games, current] = await Promise.all([loadGames(), loadCurrent()]);
  const available = publishedGames(games, current);
  const load = async (id: string) => {
    const game = available.find((item) => item.id === id);
    return game ? buildVisualStory(game, await loadCurve(id)) : null;
  };
  const [miami, cleveland] = await Promise.all([load(MIAMI_GAME), step === "compare" ? load(CLEVELAND_GAME) : Promise.resolve(null)]);
  const play = jetsPlays.find((item) => item.id === "elliott-miami")!;
  const design = getJetsStudy(play.id)?.design ?? getJetsPlayDesign(play.id);
  const next = step === "story" ? { href: `${JOURNEY_PATH}?step=film#journey-stage`, label: "Next: explore Elliott’s catch" }
    : step === "film" ? { href: `${JOURNEY_PATH}?step=compare#journey-stage`, label: "Next: compare with Cleveland" }
    : { href: `/stories?story=${CLEVELAND_GAME}#visual-story`, label: "Explore Cleveland’s final 1:55" };

  return <FocusShell page="miracle-journey" section="/stories" name="Monday Night Miracle" className={focusFonts} checkedAt={null}
    entries={[{ id: "journey", title: "Monday Night Miracle", answer: "A 23-point comeback" }, { id: "journey-stage", title: `Part ${JOURNEY_STEPS.indexOf(selectedStep) + 1} of 3`, answer: selectedStep.short }, { id: "journey-next", title: "Keep exploring", answer: "Save, share, or go further" }]}>
    <FocusMoment id="journey" first label="October 23, 2000 · Miami at New York" heading={<>The Monday <em>Night Miracle.</em></>}>
      <p className={styles.intro}>Down 30–7 after three quarters. Winners, 40–37, in overtime. Follow the rally, explore the eligible tackle’s catch, then put this night beside another Jets comeback.</p>
      <nav className={styles.steps} aria-label="Comeback journey steps"><ol>{JOURNEY_STEPS.map((item, index) => <li key={item.id}>
        <Link href={`${JOURNEY_PATH}?step=${item.id}#journey-stage`} aria-current={step === item.id ? "step" : undefined}><span>Part {index + 1}</span><b>{item.title}</b></Link>
      </li>)}</ol></nav>
    </FocusMoment>

    {step === "story" ? <FocusMoment id="journey-stage" hosts>
      {miami ? <div data-focus-tools><VisualGameStory stories={[miami]} /></div> : <><h2>The recorded story is unavailable in this edition.</h2><p className={styles.intro}>You can still explore Elliott’s illustrated play or read the sourced account below.</p><Link href="/history" className={shared.go}>Explore Jets history</Link></>}
    </FocusMoment> : step === "film" && design ? <FocusPlay id="journey-stage" label="Part 2 · The eligible tackle" play={{ title: play.title, date: play.date, situation: play.situation, result: play.result, summary: play.summary, star: play.focusPlayerIds[0], design }}
      more={<Link href="/film-room#play-elliott-miami" className={shared.go}>Open this play in the Film Room <span aria-hidden="true">→</span></Link>} />
      : step === "film" ? <FocusMoment id="journey-stage" heading="Elliott’s illustrated play is unavailable."><Link href="/film-room#play-elliott-miami" className={shared.go}>Open the Film Room</Link></FocusMoment>
      : <FocusMoment id="journey-stage" heading={<>Two comebacks. <em>Different paths.</em></>} label="Part 3 · Miami, 2000 / Cleveland, 2022">
        {miami && cleveland ? <JourneyComparison games={[{ id: miami.id, label: "Miami, 2000 · comeback sequence", points: miami.points }, { id: cleveland.id, label: "Cleveland, 2022 · comeback sequence", points: cleveland.points }]} />
          : <p className={styles.intro}>Both verified sequences are needed for this comparison. One is unavailable in this edition; the sourced accounts remain below.</p>}
        <dl className={styles.facts}><div><dt>Miami · 2000</dt><dd>Down 23 after three quarters. A fourth-quarter rally and an overtime field goal. Final: Jets 40, Miami 37.</dd></div><div><dt>Cleveland · 2022</dt><dd>Down 13 in the final 1:55. Two touchdowns and an onside recovery. Final: Jets 31, Cleveland 30.</dd></div></dl>
        <ul className={styles.sources}>{[miami, cleveland].map((story) => story ? <li key={story.id}><Link href={`/games/${story.id}`}>{story.game.season} game evidence</Link></li> : null)}</ul>
      </FocusMoment>}

    <FocusMoment id="journey-next" heading={step === "compare" ? "Keep these comebacks." : "There’s another part to this story."}>
      <div className={styles.next}><Link href={next.href} className={shared.go} pendingHint>{next.label} <span aria-hidden="true">→</span></Link>{step === "compare" ? <Link href="/puzzle" className={shared.go}>Try today’s puzzle</Link> : null}</div>
      <JourneyActions maxMoment={miami?.points.length ?? 1} />
      <ul className={styles.sources}>
        <li><a href={play.sources[0].url} target="_blank" rel="noreferrer">Jets account of the Monday Night Miracle<span className="sr-only"> (opens in a new tab)</span></a></li>
        {step === "film" ? <li><a href={play.sources[1].url} target="_blank" rel="noreferrer">Watch the official NFL highlight<span className="sr-only"> (opens in a new tab)</span></a></li> : null}
        {step === "compare" ? <li><a href="https://www.newyorkjets.com/news/jets-shock-browns-with-13-point-comeback-in-last-2-minutes-for-31-30-win" target="_blank" rel="noreferrer">Jets account of the Cleveland comeback<span className="sr-only"> (opens in a new tab)</span></a></li> : null}
      </ul>
    </FocusMoment>
  </FocusShell>;
}
