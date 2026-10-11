import Link from "@/components/IntentLink";
import FocusMoment from "@/components/FocusMoment";
import { NewsBrief } from "@/components/NewsDesk";
import FocusShell, { type FocusEntry } from "@/components/FocusShell";
import shared from "@/components/Focus.module.css";
import { dayOf } from "@/lib/focus-format";
import { loadCoverage } from "@/lib/load-coverage";
import { loadCurrent } from "@/lib/load-games";
import { pageMetadata } from "@/lib/site";
import { buildTeamFocus } from "@/lib/team-focus";
import { focusFonts } from "../focus-fonts";
import styles from "./overview.module.css";

export const metadata = pageMetadata({
  path: "/team",
  title: "Jets Team — leaders, roster and news",
  description: "Who leads the Jets in passing, rushing and receiving, the roster by position, and the latest official team headlines.",
});

const KIND = { passing: "Passing", rushing: "Rushing", receiving: "Receiving" } as const;
const NEW_TAB = <span className="sr-only"> (opens in a new tab)</span>;

export default async function TeamPage() {
  const [coverage, current] = await Promise.all([loadCoverage(), loadCurrent()]);
  const season = current?.season ?? coverage?.season ?? null;
  const { stats, roster, news } = buildTeamFocus(coverage, season);

  const entries: FocusEntry[] = [
    { id: "leaders", title: "Leaders", answer: stats.names || "Not yet" },
    { id: "players", title: "Roster", answer: roster ? `${roster.count} players` : "Pending" },
    { id: "headlines", title: "Team news", answer: news.lead ? dayOf(news.lead.publishedAt) : "None yet" },
  ];

  return <FocusShell page="team" entries={entries} checkedAt={null} className={focusFonts}>
    <FocusMoment id="leaders" first label={`${season ? `${season} Jets` : "The Jets"}${stats.throughWeek != null ? ` · through Week ${stats.throughWeek}` : ""}`}
      heading={stats.say ?? "No player numbers yet."}
      status={stats.retained ? <p className={shared.stale}>The latest stats check failed, so these are the last verified numbers.</p> : null}
      actions={stats.ready ? <Link href="/team/stats" className={shared.go}>Every player’s numbers <span aria-hidden="true">→</span></Link> : null}>
      {stats.leaders.length ? <figure className={shared.shape}>
        <ul className={styles.yards}>{stats.leaders.map((leader) => {
          const share = leader.team > 0 ? Math.min(1, Math.max(0, leader.yards / leader.team)) : 0;
          return <li key={leader.kind}>
            <span className={styles.kind}>{KIND[leader.kind]}</span>
            {leader.href ? <Link href={leader.href} className={styles.who}>{leader.name}</Link> : <span className={styles.who}>{leader.name}</span>}
            <span className={styles.count}>{leader.yards.toLocaleString("en-US")} <small>{leader.team >= leader.yards && leader.team > 0 ? `of ${leader.team.toLocaleString("en-US")} yards` : "yards"}</small></span>
            <span className={styles.bar} aria-hidden="true"><i style={{ width: `${share * 100}%` }} /></span>
          </li>;
        })}</ul>
        <figcaption>Each bar is the team’s total. The green part is the leader’s share.</figcaption>
      </figure> : <p className={shared.caption}>{stats.unavailable ? "Player statistics will appear after the next successful source check." : `They start with the first confirmed ${season ?? ""} game.`}</p>}
    </FocusMoment>

    <FocusMoment id="players" label={roster?.week != null ? `Roster · Week ${roster.week}` : "Roster"}
      heading={roster ? <>{roster.count} players <em>on the roster, by position.</em></> : "The roster is not available yet."}
      status={roster?.retained ? <p className={shared.stale}>The latest roster check failed, so this is the last verified roster.</p> : null}
      actions={roster ? <Link href="/team/roster" className={shared.go}>Find a player <span aria-hidden="true">→</span></Link> : null}>
      {roster ? <figure className={shared.shape}>
        <div className={styles.units}><div className={styles.unitGrid}>{roster.units.map((unit) => <div key={unit.group} data-unit={unit.group}>
          <p className={styles.unit}>{unit.label} <b>{unit.count}</b></p>
          <ul>{unit.rows.map((row) => <li key={row.position}>
            <Link href={`/team/roster?${new URLSearchParams({ position: row.position })}#roster`}>
              <span className={styles.position}>{row.label}</span>{" "}
              <b>{row.count}<span className="sr-only"> {row.count === 1 ? "player" : "players"}</span></b>
              <span className={styles.dots} aria-hidden="true">{Array.from({ length: row.count }, (_, index) => <i key={index} />)}</span>
            </Link>
          </li>)}</ul>
        </div>)}</div></div>
        <figcaption>Each dot is one player: {roster.lists}.</figcaption>
      </figure> : <p className={shared.caption}>The roster will appear after the next successful source check.</p>}
    </FocusMoment>

    <FocusMoment id="headlines" label={news.lead ? `Team news · ${dayOf(news.lead.publishedAt)}` : "Team news"}
      heading={news.lead?.title ?? "No team news yet."}
      status={news.retained ? <p className={shared.stale}>The latest news check failed, so newer headlines may be missing.</p> : null}
      actions={news.lead ? <>
        <Link href="/team/news" className={shared.go}>All team news <span aria-hidden="true">→</span></Link>
      </> : <a href="https://www.newyorkjets.com/news/" target="_blank" rel="noopener noreferrer" className={shared.go}>Official Jets news <span aria-hidden="true">↗</span>{NEW_TAB}</a>}>
      {news.lead ? <NewsBrief item={news.lead} className={styles.leadDetails} summaryClassName={shared.go}>Story details <span aria-hidden="true">+</span></NewsBrief> : null}
      {news.more.length ? <div className={shared.shape}><ul className={styles.wire} aria-label="More headlines">{news.more.map((item) => <li key={item.id}>
        <NewsBrief item={item} className={styles.wireDetails}><time dateTime={item.publishedAt}>{dayOf(item.publishedAt)}</time><span className={styles.headline}>{item.title}</span><span className="sr-only">Show story details</span></NewsBrief>
      </li>)}</ul></div> : !news.lead ? <p className={shared.caption}>{news.unavailable ? "Official team news will appear after a successful source check." : "No articles are available in this edition."}</p> : null}
    </FocusMoment>
  </FocusShell>;
}
