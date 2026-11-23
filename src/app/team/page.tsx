import Link from "@/components/IntentLink";
import FocusMoment from "@/components/FocusMoment";
import FocusShell, { type FocusEntry } from "@/components/FocusShell";
import { TeamLeadersMoment, TeamNewsMoment } from "@/components/TeamMoments";
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
  title: "Jets Team — stats, leaders, roster and news",
  description: "Explore the Jets in key situations, find the passing, rushing and receiving leaders, browse the roster and read the latest team headlines.",
});

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
    <TeamLeadersMoment season={season} stats={stats} first />

    <FocusMoment id="players" label={roster?.week != null ? `Roster · Week ${roster.week}` : "Roster"}
      heading={roster ? <>{roster.count} players <em>on the roster, by position.</em></> : "The roster is not available yet."}
      status={roster?.retained ? <p className={shared.stale}>The latest roster check failed, so this is the last verified roster.</p> : null}
      actions={<>{roster ? <Link href="/team/roster" className={shared.go}>Find a player <span aria-hidden="true">→</span></Link> : null}
        <Link href="/legends" className={shared.go}>Meet the Jets legends <span aria-hidden="true">→</span></Link></>}>
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

    <TeamNewsMoment news={news} />
  </FocusShell>;
}
