import Link from "next/link";
import { formatDate } from "@/lib/current";
import { chance, oneOf, snapPath, snapTime, type SearchValues, type SnapMatches as Matches } from "@/lib/snap-explorer";
import { teamName } from "@/lib/teams";
import type { Snap } from "@/lib/snap-types";
import shared from "./Focus.module.css";
import styles from "./SnapReader.module.css";

const pageSize = 8;

export default function SnapMatches({ result, path, params, filters, unavailable = 0, retrospective = false }: {
  result: Matches; path: string; params: SearchValues; filters: Record<string, string>; unavailable?: number; retrospective?: boolean;
}) {
  const wins = result.matches.filter(match => match.won === true).length;
  const losses = result.matches.filter(match => match.won === false).length;
  const ties = result.matches.length - wins - losses;
  const modes = ties ? ["all", "wins", "losses", "ties"] as const : ["all", "wins", "losses"] as const;
  const mode = oneOf(params.outcome, modes, "all");
  const shown = result.matches.filter(match => mode === "all" || (mode === "ties" ? match.won === null : match.won === (mode === "wins")))
    .sort((a, b) => Number(b.won) - Number(a.won) || b.game.date.localeCompare(a.game.date) || a.game.id.localeCompare(b.game.id));
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const page = typeof params.p === "string" && /^[1-9]\d{0,5}$/.test(params.p) ? Math.min(Number(params.p), pages) : 1;
  const href = (outcome: string, number = 1) => {
    const query = new URLSearchParams(filters);
    if (outcome !== "all") query.set("outcome", outcome);
    if (number > 1) query.set("p", String(number));
    return path + "?" + query + "#matches";
  };
  return <div id="matches" className={styles.results}>
    <h3>{wins} {wins === 1 ? "win" : "wins"} and {losses} {losses === 1 ? "loss" : "losses"}{ties > 0 && (", " + ties + (ties === 1 ? " tie" : " ties"))}.</h3>
    <p className={shared.caption}>{result.matches.length} matching {result.matches.length === 1 ? "game" : "games"} among {result.eligible} with the required play data in this window. Each game counts once.</p>
    {unavailable > 0 && <p className={shared.note}>Play files are unavailable for {unavailable} additional published {unavailable === 1 ? "game" : "games"}. The counts cover the available files.</p>}
    {result.matches.length > 0 && <nav className={styles.choices} aria-label="Filter matching outcomes">
      {modes.map((item, i) => <Link prefetch={false} key={item} href={href(item)} aria-current={item === mode ? "true" : undefined}>{["All games", "Wins", "Losses", "Ties"][i]}</Link>)}
    </nav>}
    {shown.length > 0 ? <>
      <ol className={styles.resultList} start={(page - 1) * pageSize + 1} aria-label="Matching game evidence">
        {shown.slice((page - 1) * pageSize, page * pageSize).map(({ game, play, won }) => <li key={game.id}>
          <Link prefetch={false} href={snapPath(game.id, play.key)}>
            <span>{teamName(game.opponent)} · {game.home ? "Home" : "Away"} · {won === null ? "Tied" : won ? "Won" : "Lost"} {game.final![0]}–{game.final![1]}</span>
            <small>{formatDate(game.date)} · {snapTime(play)}{retrospective && play.wp !== null ? " · " + chance(play.wp) + " before the play" : ""}</small>
          </Link>
        </li>)}
      </ol>
      {pages > 1 && <nav className={styles.choices} aria-label="Matching game pages">
        {page > 1 && <Link prefetch={false} href={href(mode, page - 1)}>Previous results</Link>}
        <span>Page {page} of {pages}</span>
        {page < pages && <Link prefetch={false} href={href(mode, page + 1)}>Next results</Link>}
      </nav>}
    </> : <p>{result.eligible ? "No games meet these selections." : "No earlier games have the required recorded evidence in this window."}</p>}
  </div>;
}

export function SituationForm({ selected, path, rules }: {
  selected: Snap; path: string; rules: import("@/lib/snap-explorer").SituationRules;
}) {
  return <form action={path + "#matches"} className={styles.rules} method="get">
    <input type="hidden" name="compare" value="1" />
    <div><label htmlFor="rule-window">Clock in the same period</label><select id="rule-window" name="window" defaultValue={rules.window}>
      {selected.clock !== null && <><option value="60">Within 1 minute</option><option value="120">Within 2 minutes</option><option value="300">Within 5 minutes</option></>}
      <option value="quarter">Anywhere in the period</option>
    </select></div>
    <div><label htmlFor="rule-margin">Jets score margin</label><select id="rule-margin" name="margin" defaultValue={rules.margin}>
      {selected.before && <><option value="0">Exact margin</option><option value="3">Within 3 points</option><option value="7">Within 7 points</option></>}
      <option value="any">Any margin</option>
    </select></div>
    <div><label htmlFor="rule-possession">Possession</label><select id="rule-possession" name="possession" defaultValue={rules.possession}>
      {selected.possession && <option value="same">Same side on offense</option>}<option value="any">Either side</option>
    </select></div>
    <div><label htmlFor="rule-down">Down</label><select id="rule-down" name="down" defaultValue={rules.down}>
      {selected.down !== null && <option value="same">Same down</option>}<option value="any">Any down</option>
    </select></div>
    <div><label htmlFor="rule-distance">Yards to go</label><select id="rule-distance" name="distance" defaultValue={rules.distance}>
      {selected.distance !== null && <><option value="0">Exact distance</option><option value="3">Within 3 yards</option></>}
      <option value="any">Any distance</option>
    </select></div>
    <button type="submit" className={shared.button}>Compare games</button>
  </form>;
}
