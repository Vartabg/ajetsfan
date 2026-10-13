import Link from "@/components/IntentLink";
import FocusMoment from "@/components/FocusMoment";
import FocusShell from "@/components/FocusShell";
import QbCarousel from "@/components/QbCarousel";
import shared from "@/components/Focus.module.css";
import styles from "@/components/QbCarousel.module.css";
import { formatDate } from "@/lib/current";
import { loadLeagueHistory } from "@/lib/load-league-history";
import { buildCarousel } from "@/lib/quarterbacks";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "../../focus-fonts";

export const metadata = pageMetadata({ path: "/history/quarterbacks", title: "Jets Quarterbacks — every starter since 1999", description: "Every Jets game since 1999 coloured by its starting quarterback, from the NFL schedule record: who started most, the busiest season and the longest run." });

const NUMBER = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven"];

export default async function QuarterbacksPage() {
  const history = await loadLeagueHistory();
  const carousel = history ? buildCarousel(history.games) : null;
  if (!carousel) {
    return <FocusShell page="quarterbacks" entries={[{ id: "carousel", title: "Quarterbacks", answer: "Unavailable" }]} checkedAt={null} className={focusFonts}>
      <FocusMoment id="carousel" first label="Jets history · quarterbacks" heading="The quarterback record is unavailable in this edition." />
    </FocusShell>;
  }
  const qbs = carousel.quarterbacks;
  const top = qbs.filter((qb) => qb.starts === qbs[0].starts);
  const most = Math.max(...qbs.map((qb) => qb.starts));
  const runner = qbs[carousel.run.qb];
  const busy = carousel.busiest;
  const busyNames = [...new Set(busy.stints.map((stint) => stint.qb))].length;
  const games = busy.stints.reduce((total, stint) => total + stint.games, 0);
  return <FocusShell page="quarterbacks" entries={[
    { id: "carousel", title: "Quarterbacks", answer: `${qbs.length} starters since ${carousel.from}` },
    { id: "most", title: "Most starts", answer: top.map((qb) => qb.name.split(" ").at(-1)).join(" and ") },
    { id: "busiest", title: "Busiest season", answer: `${busyNames} starters in ${busy.season}` },
    { id: "run", title: "Longest run", answer: `${carousel.run.games} straight` },
  ]} checkedAt={history!.checkedAt} className={`${focusFonts} ${styles.palette}`}>
    <FocusMoment id="carousel" first label={`Jets history · quarterbacks · ${carousel.from}–${carousel.to}`}
      heading={<>{qbs.length} quarterbacks have started for the Jets <em>since {carousel.from}.</em></>}>
      <figure className={shared.shape}>
        <QbCarousel carousel={carousel} />
        <figcaption>Each row is a season and each square a game, playoffs included (notched). A colour is one starting quarterback; two who followed each other never share one. The starter changed {carousel.changes} times between one game and the next. From the NFL schedule record.</figcaption>
      </figure>
    </FocusMoment>

    <FocusMoment id="most" label="Most starts"
      heading={top.length > 1 ? <>{top.map((qb) => qb.name).join(" and ")}: <em>{top[0].starts} starts each.</em></> : <>{top[0].name}: <em>{top[0].starts} starts.</em></>}>
      <figure className={shared.shape}>
        <ol className={styles.bars}>{qbs.slice(0, 10).map((qb) => <li key={qb.id} className={styles[`q${qb.color}`]}>
          <span>{qb.name}</span><span className={styles.track}><i style={{ width: `${qb.starts / most * 100}%` }} /></span>
          <small>{qb.starts} · {qb.wins}–{qb.losses}{qb.ties ? `–${qb.ties}` : ""}</small>
        </li>)}</ol>
        <figcaption>Starts and the Jets’ record in them, regular season and playoffs, for the ten with the most. The other {qbs.length - 10} started {qbs.slice(10).reduce((total, qb) => total + qb.starts, 0)} games between them.</figcaption>
      </figure>
    </FocusMoment>

    <FocusMoment id="busiest" label={`Busiest season · ${busy.season}`}
      heading={<>{NUMBER[busyNames] ?? busyNames} starters <em>in {busy.season}.</em></>}
      actions={<Link href={`/seasons/${busy.season}`} className={shared.go}>{busy.season} season <span aria-hidden="true">→</span></Link>}>
      <figure className={shared.shape}>
        <div className={styles.stints} aria-hidden="true">{busy.stints.map((stint, index) => <div key={index} className={styles[`q${qbs[stint.qb].color}`]} style={{ flex: stint.games }}><i />{stint.games >= 2 ? <span>{qbs[stint.qb].name.split(" ").at(-1)}</span> : null}</div>)}</div>
        <ol className={styles.stintList}>{busy.stints.map((stint, index) => <li key={index} className={styles[`q${qbs[stint.qb].color}`]}>
          <span>{qbs[stint.qb].name}</span><small>{stint.from === stint.to ? `week ${stint.from}` : `weeks ${stint.from}–${stint.to}`} · {stint.games} {stint.games === 1 ? "game" : "games"}</small>
        </li>)}</ol>
        <figcaption>The {games} games of {busy.season} in order, each block one quarterback’s run as the starter.</figcaption>
      </figure>
    </FocusMoment>

    <FocusMoment id="run" label="Longest run"
      heading={<>{carousel.run.games} straight starts: <em>{runner.name}.</em></>}
      actions={<Link href="/history" className={shared.go}>Jets history <span aria-hidden="true">→</span></Link>}>
      <figure className={shared.shape}>
        <div className={`${styles.run} ${styles[`q${runner.color}`]}`} role="img" aria-label={`${carousel.run.games} consecutive starts`}>
          {Array.from({ length: carousel.run.games }, (_, index) => <i key={index} />)}
        </div>
        <figcaption>The most games in a row with the same Jets starter since {carousel.from}, playoffs included: {formatDate(carousel.run.first)} to {formatDate(carousel.run.last)}.{carousel.run.next !== null ? ` ${qbs[carousel.run.next].name} started the next game.` : " The run is still going."}</figcaption>
      </figure>
    </FocusMoment>
  </FocusShell>;
}
