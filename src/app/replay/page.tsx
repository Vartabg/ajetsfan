import Link from "next/link";
import FocusMoment from "@/components/FocusMoment";
import FocusShell from "@/components/FocusShell";
import shared from "@/components/Focus.module.css";
import { formatDate } from "@/lib/current";
import { driveReadHref } from "@/lib/drive-read-links";
import { CLEVELAND } from "@/lib/snap-explorer";
import { loadReplayDirectory } from "@/lib/load-snaps";
import { pageMetadata } from "@/lib/site";
import { teamName } from "@/lib/teams";
import styles from "./page.module.css";

export const metadata = pageMetadata({
  path: "/replay", title: "Replay a Jets game · ajetsfan",
  description: "Choose a season and opponent. Replay a Jets game from its first recorded play, at your own pace.",
});

type Props = { searchParams: Promise<{ season?: string | string[]; opponent?: string | string[] }> };

export default async function ReplayDirectory({ searchParams }: Props) {
  const params = await searchParams;
  const requested = typeof params.season === "string" && /^\d{4}$/.test(params.season) ? Number(params.season) : null;
  const { years, season, opponents, games, pending } = await loadReplayDirectory(requested);
  const opponent = typeof params.opponent === "string" && /^[a-z]{2,3}$/i.test(params.opponent) ? params.opponent.toUpperCase() : "";
  const coverage = years.length > 1 ? "Choose a game from " + years.at(-1) + " through " + years[0] + ". " :
    years.length === 1 ? "Choose a game from the " + years[0] + " season. " : "";
  const choices = [...opponents].sort((a, b) => teamName(a).localeCompare(teamName(b)));
  const filtered = opponent ? games.filter(game => game.opponentDisplay === opponent) : games;
  return <FocusShell page="replay-directory" section="/replay" name="Game replays" checkedAt={null}
    entries={[{ id: "choose-game", title: "Choose a game", answer: season ? String(season) : "Seasons" }]}>
    <FocusMoment id="choose-game" first heading="Replay a Jets game.">
      <p className={shared.caption}>{coverage}Start at the first recorded play, then follow the key plays or every snap.</p>
      {years.includes(2022) && <Link prefetch={false} className={shared.go} href={driveReadHref(CLEVELAND, { series: "cleveland-15" })}>Read three downs at Cleveland’s 15</Link>}
      {years.length > 0 && <form action="/replay" method="get" className={styles.filters} aria-label="Choose a season and opponent">
        <div><label htmlFor="replay-season">Season</label><select id="replay-season" name="season" defaultValue={season ?? ""}>
          {season !== null && !years.includes(season) && <option value={season}>{season}</option>}
          {years.map(year => <option key={year} value={year}>{year}</option>)}
        </select></div>
        <div><label htmlFor="replay-opponent">Opponent</label><select id="replay-opponent" name="opponent" defaultValue={opponent}>
          <option value="">All opponents</option>
          {opponent && !choices.includes(opponent) && <option value={opponent}>Unknown opponent</option>}
          {choices.map(code => <option key={code} value={code}>{teamName(code)}</option>)}
        </select></div>
        <button type="submit" className={shared.button}>Show games</button>
      </form>}
      <section aria-labelledby="replay-games-heading" className={styles.games}>
        <h2 id="replay-games-heading">{season !== null ? season + " games" : "Games"}</h2>
        {filtered.length ? <ul role="list" aria-label="Games to replay">{filtered.map(game =>
          <li key={game.id}><Link prefetch={false} href={"/replay/" + game.id}>
            <strong>Jets {game.atHome ? "vs." : "at"} {teamName(game.opponentDisplay)}</strong>
            <span><time dateTime={game.date}>{formatDate(game.date)}</time> · {game.seasonType === "POST" ? "Playoffs" : "Week " + game.week}</span>
          </Link></li>)}</ul>
          : <p className={shared.caption}>{!years.length ? "No verified play-by-play is currently available." : pending > 0 && !games.length ? "The play-by-play for this season is currently unavailable."
            : "No games with verified play-by-play match this selection."}</p>}
        {pending > 0 && games.length > 0 && <p className={shared.note}>Verified play-by-play is pending for {pending} {pending === 1 ? "game" : "games"} in this season.</p>}
      </section>
    </FocusMoment>
  </FocusShell>;
}
