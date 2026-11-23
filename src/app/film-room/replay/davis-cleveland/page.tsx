import Link from "next/link";
import { focusFonts } from "@/app/focus-fonts";
import FocusMoment from "@/components/FocusMoment";
import FocusShell from "@/components/FocusShell";
import shared from "@/components/Focus.module.css";
import { beforeFullSnap } from "@/lib/full-snap";
import { loadChartedSnapGame } from "@/lib/load-snaps";
import { pageMetadata } from "@/lib/site";
import { chartLabel, participationProvenance } from "@/lib/snap-participation";
import type { SearchValues } from "@/lib/snap-explorer";
import DavisField from "./DavisField";
import { davisCasePlay, davisGame, davisPlay } from "./record";
import styles from "./case.module.css";

const casePath = "/film-room/replay/davis-cleveland";
const gamebook = "https://static.www.nfl.com/image/upload/v1677628106/gamecenter/7ae81ee8-d24c-11ec-b23d-d15a91047884.pdf#page=14";
const substitution = "https://www.newyorkjets.com/news/5-plays-that-made-a-difference-in-jets-victory-over-browns";
const snapCounts = "https://www.newyorkjets.com/news/snap-count-analysis-which-jets-played-the-most-snaps-in-win-against-cleveland";
const provenance = participationProvenance(2022);

export const metadata = pageMetadata({
  path: casePath, title: "Ashtyn Davis’s one defensive snap in Cleveland — Film Room",
  description: "Read the field with 13 seconds left in Cleveland and see why the Jets sent in safety Ashtyn Davis.",
});

export default async function DavisClevelandPage({ searchParams }: { searchParams: Promise<SearchValues> }) {
  const [game, query] = await Promise.all([loadChartedSnapGame(davisGame), searchParams]);
  const play = davisCasePlay(game);
  const board = game && play ? beforeFullSnap(game, play) : null;
  if (!board || !play) {
    return <FocusShell page="davis-cleveland" section="/film-room" name="Davis in Cleveland" checkedAt={null}
      className={focusFonts} entries={[{ id: "case", title: "The Cleveland snap", answer: "Record unavailable" }]}>
      <FocusMoment id="case" first label="Film Room · Cleveland, 2022" heading="The Cleveland snap is unavailable."
        actions={<Link href="/film-room" className={shared.go}>Back to the Film Room</Link>}>
        <p className={shared.caption}>This study needs the verified play and the snap that follows it.</p>
      </FocusMoment>
    </FocusShell>;
  }

  const revealed = query.phase === "action";
  const chart = play.facts?.charting;
  const coverage = chartLabel(chart?.coverage);
  const entries = [{ id: "case", title: "One defensive snap", answer: revealed ? "Davis returns to midfield" : "Davis enters the game" }];
  if (revealed) entries.push({ id: "sources", title: "Sources", answer: "Gamebook and reporting" });

  return <FocusShell page="davis-cleveland" section="/film-room" name="Davis in Cleveland" checkedAt={null}
    className={focusFonts} entries={entries}>
    <FocusMoment id="case" first label="Film Room · Jets at Browns · Sept. 18, 2022"
      heading={revealed ? <>Davis takes it <em>back to midfield.</em></> : <>One defensive snap <em>for Ashtyn Davis.</em></>}>
      <div className={styles.study}>
        <div className={styles.read}>
          <p className={styles.situation}><strong>Jets 31 · Browns 30</strong><span>4th quarter · 0:13</span></p>
          {revealed ? <>
            <p>Jacoby Brissett threw deep to his left for Amari Cooper. Davis intercepted the pass at the Jets 36 and returned it 14 yards to midfield.</p>
            <p>With six seconds left, Joe Flacco took a knee for the Jets.</p>
            {coverage && chart?.rushers !== undefined &&
              <p className={styles.annotation}>The participation chart records {coverage} with {chart.rushers} pass rushers.</p>}
          </> : <>
            <p>Jacoby Brissett has first-and-10 at Cleveland’s own 46. The Browns need a field goal to take the lead.</p>
            <p>The Jets reported that defensive coordinator Jeff Ulbrich brought in Davis as an extra defensive back. It was the safety’s first defensive snap of the season.</p>
            {chart?.defensePersonnel === "3 DL, 2 LB, 6 DB" &&
              <p className={styles.annotation}>The Jets had six defensive backs, two linebackers and three linemen on this snap.</p>}
          </>}
        </div>
        <DavisField board={board} revealed={revealed} />
        <div className={styles.controls}>
          {revealed ? <>
            <Link href={casePath} prefetch={false} className={shared.go}>Back to the snap</Link>
            <Link href={"/replay/" + davisGame + "?play=" + davisPlay + "&pace=all"} prefetch={false} className={shared.go}>Open the full replay</Link>
          </> : <Link href={casePath + "?phase=action"} prefetch={false} className={shared.go}>Reveal the play <span aria-hidden="true">→</span></Link>}
        </div>
      </div>
    </FocusMoment>
    {revealed && <FocusMoment id="sources" heading="The game record">
      <dl className={styles.sources}>
        <div><dt>Clock, field position and return</dt>
          <dd><a href={gamebook}>Jets at Browns gamebook, page 14 (PDF)</a> · <Link href={"/plays/" + davisGame + "/" + davisPlay} prefetch={false}>Play-by-play record</Link></dd></div>
        <div><dt>Why Davis entered</dt>
          <dd><a href={substitution}>Jack Bell’s account for the Jets</a></dd></div>
        <div><dt>One snap on defense</dt>
          <dd><a href={snapCounts}>Jets snap-count report</a></dd></div>
        {chart && <div><dt>Personnel and coverage</dt>
          <dd><a href={provenance.sourceUrl}>{provenance.provider}</a> · <a href={provenance.licenseUrl}>{provenance.license}</a>
            <small>{provenance.changes}</small></dd></div>}
      </dl>
    </FocusMoment>}
  </FocusShell>;
}
