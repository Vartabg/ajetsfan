import FocusMoment from "./FocusMoment";
import Link from "./IntentLink";
import { record } from "@/lib/focus-format";
import type { OnThisDay } from "@/lib/on-this-day";
import shared from "./Focus.module.css";
import styles from "./OnThisDayMoment.module.css";

/** Earlier Jets games played on today's New York date, mounted on History. */
export default function OnThisDayMoment({ today }: { today: OnThisDay }) {
  const span = Math.max(1, today.to - today.from);
  const only = today.games.length === 1 ? today.games[0] : null;
  const verb = (game: OnThisDay["games"][number]) => game.outcome === "win" ? "Beat" : game.outcome === "loss" ? "Lost to" : "Tied";
  const score = (game: OnThisDay["games"][number]) => game.outcome === "loss" ? `${game.them}–${game.us}` : `${game.us}–${game.them}`;
  return <FocusMoment id="today" label={`On this day · ${today.day}`}
    heading={only ? <>{today.day}, {only.year}: <em>{verb(only).toLowerCase()} {only.opponent} {score(only)}.</em></> : <>{record(today.wins, today.losses, today.ties)} on {today.day} <em>since {today.from}.</em></>}>
    <figure className={shared.shape}>
      <div className={styles.years} role="img" aria-label={`${today.games.length} Jets ${today.games.length === 1 ? "game" : "games"} on ${today.day} between ${today.from} and ${today.to}.`}>
        {today.games.map((game) => <i key={game.id} className={game.outcome === "win" ? styles.win : game.outcome === "tie" ? styles.tie : undefined} style={{ left: `${(game.year - today.from) / span * 100}%` }} />)}
        <span>{today.from}</span><span>{today.to}</span>
      </div>
      <ul className={styles.dated}>{today.games.map((game) => <li key={game.id}>
        <Link href={game.href}><b>{game.year}</b> <span>{verb(game)} {game.opponent} {score(game)}</span> <small>{game.home ? "Home" : "Away"}</small><span aria-hidden="true">→</span></Link>
      </li>)}</ul>
      <figcaption>Every Jets game played on {today.day} since the {today.from} season, from the NFL schedule record. Each dot is a year; filled dots are wins.</figcaption>
    </figure>
  </FocusMoment>;
}
