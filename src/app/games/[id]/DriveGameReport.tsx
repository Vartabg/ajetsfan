import type { CSSProperties } from "react";
import Link from "@/components/IntentLink";
import DriveChart from "@/components/DriveChart";
import FocusMoment from "@/components/FocusMoment";
import FocusShell from "@/components/FocusShell";
import SeasonReturn from "@/components/SeasonReturn";
import shared from "@/components/Focus.module.css";
import { formatCheckedAt, formatDate, type FinalGame } from "@/lib/current";
import { scoringSummary, type Drive } from "@/lib/drives";
import { teamColor, teamIdentity, teamName } from "@/lib/teams";
import { focusFonts } from "../../focus-fonts";
import styles from "./page.module.css";

/** Confirmed results and witnessed drives stay readable while model analysis is pending. */
export default function DriveGameReport({ game, drives, checkedAt, source }: {
  game: FinalGame; drives: Drive[]; checkedAt: string; source: string;
}) {
  const jets = drives.filter((drive) => drive.jets);
  const verb = game.outcome === "win" ? "Won" : game.outcome === "loss" ? "Lost" : "Tied";
  const when = `${game.season} · ${game.seasonType === "POST" ? "Playoffs" : `Week ${game.week}`}`;
  const identity = teamIdentity(game.opponentDisplay);
  const opponent = identity?.nickname ? `the ${identity.nickname}` : identity?.city ?? game.opponentDisplay;
  return <FocusShell page="game" name={when} section="/seasons" className={focusFonts} checkedAt={null}
    entries={[{ id: "final", title: "Final", answer: `${verb} ${game.jetsScore}–${game.oppScore}` }, { id: "drives", title: "Drives", answer: `${jets.length} Jets drives` }]}>
    <FocusMoment id="final" first label={`${when} · ${formatDate(game.date)}`}
      heading={<>{verb} {game.jetsScore}–{game.oppScore} <em>{game.atHome ? "vs" : "at"} {teamName(game.opponentDisplay)}.</em></>}
      actions={<><SeasonReturn year={game.season} fallback={`/seasons/${game.season}`} fallbackLabel={`The ${game.season} season`} className={shared.go} /><Link href="#drives" className={shared.go}>See every drive <span aria-hidden="true">↓</span></Link></>}>
      <div className={shared.shape}>
        <div className={styles.score} style={{ "--rival": teamColor(game.opponentDisplay) } as CSSProperties}
          role="group" aria-label={`Final score: Jets ${game.jetsScore}, ${game.opponentDisplay} ${game.oppScore}`}>
          <span data-team="jets">NYJ <strong>{game.jetsScore}</strong></span><span data-team="opponent">{game.opponentDisplay} <strong>{game.oppScore}</strong></span>
        </div>
        <p className={shared.caption} data-game-analysis-pending>Final score confirmed. Win-probability and featured-play analysis are pending; verified drives are available below.</p>
      </div>
    </FocusMoment>
    <FocusMoment id="drives" label="Drives · where each one went" heading={<>{jets.length} Jets drives: <em>{scoringSummary(jets)}.</em></>}>
      <figure className={shared.shape}>
        <DriveChart drives={drives} opponent={opponent} />
        <figcaption>Each bar is one drive, from its first snap to its last (into the end zone for a touchdown), across the field from the Jets’ goal line on the left. Drives with no snap, such as a kickoff returned for a touchdown, are not shown. From nflverse play-by-play.</figcaption>
      </figure>
      <p className={shared.caption}>Source: <a href={source} target="_blank" rel="noreferrer">nflverse play-by-play<span className="sr-only"> (opens in a new tab)</span></a>. Drives checked <time dateTime={checkedAt}>{formatCheckedAt(checkedAt)}</time>.</p>
    </FocusMoment>
  </FocusShell>;
}
