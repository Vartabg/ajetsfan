import FocusMoment from "./FocusMoment";
import Link from "./IntentLink";
import { NewsBrief } from "./NewsDesk";
import { dayOf } from "@/lib/focus-format";
import type { TeamFocus } from "@/lib/team-focus";
import shared from "./Focus.module.css";
import styles from "./TeamMoments.module.css";

const KIND = { passing: "Passing", rushing: "Rushing", receiving: "Receiving" } as const;
const NEW_TAB = <span className="sr-only"> (opens in a new tab)</span>;

/** Current-season passing, rushing, and receiving yard leaders as a focus moment. */
export function TeamLeadersMoment({ season, stats, first = false, rosterLink = false }: {
  season: number | null;
  stats: TeamFocus["stats"];
  first?: boolean;
  rosterLink?: boolean;
}) {
  return <FocusMoment id="leaders" first={first} label={`${season ? `${season} Jets` : "The Jets"}${stats.throughWeek != null ? ` · through Week ${stats.throughWeek}` : ""}`}
    heading={stats.say ?? "No player numbers yet."}
    status={stats.retained ? <p className={shared.stale}>The latest stats check failed, so these are the last verified numbers.</p> : null}
    actions={stats.ready ? <><Link href="/team/stats#leaders" className={shared.go}>Every player’s numbers <span aria-hidden="true">→</span></Link>{rosterLink ? <Link href="/team/roster" className={shared.go}>Find a player <span aria-hidden="true">→</span></Link> : null}</> : null}>
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
  </FocusMoment>;
}

/** Newest official Jets headlines as a focus moment with expandable publisher details. */
export function TeamNewsMoment({ news, first = false }: {
  news: TeamFocus["news"];
  first?: boolean;
}) {
  return <FocusMoment id="headlines" first={first} label={news.lead ? `Team news · ${dayOf(news.lead.publishedAt)}` : "Team news"}
    heading={news.lead?.title ?? "No team news yet."}
    status={news.retained ? <p className={shared.stale}>The latest news check failed, so newer headlines may be missing.</p> : null}
    actions={news.lead ? <Link href="/team/news" className={shared.go}>All team news <span aria-hidden="true">→</span></Link>
      : <a href="https://www.newyorkjets.com/news/" target="_blank" rel="noopener noreferrer" className={shared.go}>Official Jets news <span aria-hidden="true">↗</span>{NEW_TAB}</a>}>
    {news.lead ? <NewsBrief item={news.lead} className={styles.leadDetails} summaryClassName={shared.go}>Story details <span aria-hidden="true">+</span></NewsBrief> : null}
    {news.more.length ? <div className={shared.shape}><ul className={styles.wire} aria-label="More headlines">{news.more.map((item) => <li key={item.id}>
      <NewsBrief item={item} className={styles.wireDetails}><time dateTime={item.publishedAt}>{dayOf(item.publishedAt)}</time><span className={styles.headline}>{item.title}</span><span className="sr-only">Show story details</span></NewsBrief>
    </li>)}</ul></div> : !news.lead ? <p className={shared.caption}>{news.unavailable ? "Official team news will appear after a successful source check." : "No articles are available in this edition."}</p> : null}
  </FocusMoment>;
}
