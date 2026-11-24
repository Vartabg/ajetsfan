import "server-only";

import { currentSeasonSummary, formatDate, nextScheduledGame, recordLabel, type CurrentSnapshot } from "@/lib/current";
import { confirmedByeWeek } from "@/lib/focus";
import { on } from "@/lib/focus-format";
import { replayHref } from "@/lib/game-replay";
import type { Game } from "@/lib/games";
import { homeGameRecap } from "@/lib/home-game-recap";
import type { HomeRoster } from "@/lib/home-play";
import { loadSnapGame } from "@/lib/load-snaps";
import { publishedGames } from "@/lib/published-pages";
import { teamName } from "@/lib/teams";
import shared from "./Focus.module.css";
import styles from "./HomeWeekDetail.module.css";

type Props = { week: number; snapshot: CurrentSnapshot; games: Game[]; roster: HomeRoster };

const results = { win: "Jets win", loss: "Jets loss", tie: "Tie" };

export default async function HomeWeekDetail({ week, snapshot, games, roster }: Props) {
  const regular = snapshot.schedule.filter((game) =>
    game.season === snapshot.season && game.seasonType === "REG" && game.week >= 1 && game.week <= 18,
  );
  const bye = confirmedByeWeek(snapshot);
  const fixture = regular.find((game) => game.week === week);
  const next = nextScheduledGame(snapshot);
  if (!fixture) {
    const isBye = bye === week;
    const following = regular.filter((game) => game.week > week).sort((a, b) => a.week - b.week)[0];
    return <div className={styles.detail}>
      <h3 className={styles.matchup}>{isBye ? "Bye week" : "No game listed"}</h3>
      {isBye && <p>The Jets have a break in the schedule this week.</p>}
      {following && <p>Next on the schedule is Week {following.week}, {following.atHome ? "at home against" : "away against"} the {teamName(following.opponentDisplay)} on <time dateTime={following.date}>{formatDate(following.date)}</time>.</p>}
      {following && next?.game.id === following.id && <a className={shared.go} href="/game-day">Game Day</a>}
    </div>;
  }

  const opponent = teamName(fixture.opponentDisplay);
  const kickoff = fixture.kickoff && Number.isFinite(Date.parse(fixture.kickoff)) ? fixture.kickoff : null;
  const isNext = next?.game.id === fixture.id;
  const overdue = kickoff ? Date.parse(kickoff) <= Date.parse(snapshot.checkedAt) : fixture.date < snapshot.checkedAt.slice(0, 10);
  const through = regular.filter((game) => game.date <= fixture.date);
  const summary = currentSeasonSummary({ ...snapshot, schedule: through });
  const final = summary.finals.find((game) => game.id === fixture.id);
  const scheduledWeeksThroughGame = new Set(regular.filter((game) => game.week <= week).map((game) => game.week));
  const canShowRecord = final && summary.finals.length === through.length &&
    scheduledWeeksThroughGame.size === week - (bye !== null && bye < week ? 1 : 0);
  const report = final ? publishedGames(games, snapshot).find((game) => game.id === final.id) : undefined;
  const archive = report ? await loadSnapGame(report.id) : null;
  const recap = archive ? homeGameRecap(archive, roster) : null;
  const venue = final && games.find((game) => game.id === final.id && game.season === final.season &&
    game.week === final.week && game.seasonType === final.seasonType && game.date === final.date &&
    game.opponent === final.opponent && game.atHome === final.atHome)?.stadium;

  return <div className={styles.detail}>
    <p className={styles.status}>{final ? "Final · " + results[final.outcome] : overdue || fixture.status === "final" ? "Final score pending" : isNext ? "Next game" : "Scheduled"}</p>
    {final ? <h3 className={styles.matchup}>
      <span className={styles.score}><span>New York Jets</span>{" "}<strong>{final.jetsScore}</strong></span>{" "}
      <span className={styles.score}><span>{opponent}</span>{" "}<strong>{final.oppScore}</strong></span>
    </h3> : <h3 className={styles.matchup}>New York Jets {fixture.atHome ? "vs" : "at"} {opponent}</h3>}
    <p className={styles.meta}>
      <span>{fixture.atHome ? "Jets home game" : "Jets away game"}</span>
      <time dateTime={fixture.date}>{formatDate(fixture.date)}</time>
      {kickoff ? <time dateTime={kickoff}>{on(kickoff, { hour: "numeric", minute: "2-digit" })} ET kickoff</time> : <span>Kickoff TBD</span>}
      {venue && <span>{venue}</span>}
    </p>
    {canShowRecord && <p>Jets record after the game <strong>{recordLabel(summary)}</strong></p>}
    {recap && <p className={styles.recap}>{recap.text}</p>}
    {(archive || report || isNext && !final) && <div className={styles.actions}>
      {archive && <a className={styles.replay} href={replayHref(archive.id, undefined, "all")}>Replay the game</a>}
      {report && <a className={shared.go} href={`/games/${encodeURIComponent(report.id)}`}>Full game report</a>}
      {isNext && !final && <a className={shared.go} href="/game-day">Game Day</a>}
    </div>}
  </div>;
}
