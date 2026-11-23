import { notFound } from "next/navigation";
import FocusShell from "@/components/FocusShell";
import FocusMoment from "@/components/FocusMoment";
import StudyNavigation from "@/components/StudyNavigation";
import shared from "@/components/Focus.module.css";
import { driveReadHref } from "@/lib/drive-read-links";
import { loadPlayerSeason } from "@/lib/load-player-history";
import { loadPublishedGames } from "@/lib/load-published-pages";
import { loadStudySeason } from "@/lib/load-snaps";
import { defaultPlayerRole, findPlayerChoices, playerChoices, playerSituations, playerStudyHref, roles, situations, type PlayerChoice, type PlayerRole, type PlayerSituation } from "@/lib/player-situations";
import { pageMetadata } from "@/lib/site";
import { snapSituation } from "@/lib/snap-context";
import { snapTime } from "@/lib/snap-explorer";
import { teamIdentity } from "@/lib/teams";
import styles from "./player.module.css";

const path = "/replay/studies/player";
const pageSize = 12;
const allen = "00-0039794";
export const metadata = pageMetadata({ path, title: "Player situations · ajetsfan",
  description: "Find a Jets player’s carries, throws and targets by down or field position, then replay the snaps." });

type Query = Record<string, string | string[] | undefined>;
function value(params: Query, key: string) {
  const input = params[key];
  if (Array.isArray(input) || (input?.length ?? 0) > 120) notFound();
  return input?.trim() ?? "";
}

function resultName(outcome: boolean | null, redZone: boolean) {
  if (outcome === null) return "Outcome unknown";
  if (redZone) return outcome ? "Touchdown" : "No touchdown";
  return outcome ? "Converted" : "Stopped";
}

export default async function PlayerStudy({ searchParams }: { searchParams: Promise<Query> }) {
  const [params, fixtures] = await Promise.all([searchParams, loadPublishedGames()]);
  const regular = fixtures.filter(game => game.seasonType === "REG");
  const years = [...new Set(regular.map(game => game.season))].sort((a, b) => b - a);
  const seasonParam = value(params, "season");
  const playerId = value(params, "player");
  const name = value(params, "name");
  const roleParam = value(params, "role");
  const situationParam = value(params, "situation") || "third-short";
  const pageParam = value(params, "page") || "1";
  if ((seasonParam && !/^\d{4}$/.test(seasonParam)) || (playerId && !/^00-\d{7}$/.test(playerId)) ||
      (roleParam && !Object.hasOwn(roles, roleParam)) || !Object.hasOwn(situations, situationParam) ||
      !/^[1-9]\d{0,4}$/.test(pageParam) || (playerId && name)) notFound();
  const season = seasonParam ? Number(seasonParam) : years[0];
  if (seasonParam && !years.includes(season)) notFound();
  const [games, roster] = season ? await Promise.all([loadStudySeason(season, false, true), loadPlayerSeason(season)]) : [[], null];
  const choices = playerChoices(games, roster);
  const selectedId = playerId || (!name && !seasonParam ? allen : "");
  const found: PlayerChoice[] = selectedId ? choices.filter(player => player.id === selectedId) : findPlayerChoices(choices, name);
  const person = found.length === 1 ? found[0] : null;
  const role = (roleParam || defaultPlayerRole(person?.position ?? null)) as PlayerRole;
  const situation = situationParam as PlayerSituation;
  const data = person ? playerSituations(games, person.id, role, situation) : null;
  const redZone = situation === "red-zone";
  const page = Number(pageParam);
  const start = (page - 1) * pageSize;
  if (page > 1 && (!data || start >= data.clips.length)) notFound();
  const fixturesForSeason = regular.filter(game => game.season === season);
  const week = new Map(fixturesForSeason.map(game => [game.id, game.week]));
  const throughWeek = Math.max(0, ...games.map(game => week.get(game.id) ?? 0));
  const unknown = data ? data.clips.length - data.known : 0;
  const noun = role === "carry" ? "carries" : role === "pass" ? "passes" : "targets";

  return <FocusShell page="player-situations" name="Player situations" section="/replay" checkedAt={null}
    entries={[{ id:"finder", title:"Find a player", answer:person?.name ?? "Player and situation" },
      ...(person ? [{ id:"snaps", title:"Matching plays", answer:data?.clips.length + " plays" }] : [])]}>
    <FocusMoment first id="finder" heading="Player situations.">
      {person && data ? <div className={styles.summary}>
        <h2>{person.name} <span>· {roles[role]} · {situations[situation]}</span></h2>
        {data.known > 0 ? <>
          <p className={styles.rate}><strong>{data.converted} of {data.known}</strong> {redZone ? "ended in a touchdown" : "converted"}</p>
          <p>{Math.round(100*data.converted/data.known)}% · {data.stopped} {redZone ? "without a touchdown" : "stopped short"}{unknown > 0 && ` · ${unknown} with an unknown outcome`}</p>
        </> : <p>{data.clips.length ? `The ${data.clips.length} matching plays have no recorded outcome for this rate.` :
          `No verified ${noun} for ${person.name} match this selection.`}</p>}
        <p className={styles.scope}>{season} regular season{throughWeek > 0 && ` through Week ${throughWeek}`} · {games.length} of {fixturesForSeason.length} published games have play-by-play.
          {" "}{data.identified} of {data.eligible} eligible Jets {role === "target" ? "pass attempts have an identified target" :
            role === "carry" ? "carries have an identified runner" : "throws have an identified passer"}.</p>
        {data.clips.length > 0 && <a className={shared.go} href="#snaps">See the {data.clips.length === 1 ? "play" : "plays"} <span aria-hidden="true">↓</span></a>}
      </div> : <div className={styles.summary}>
        {found.length > 1 ? <><h2>Which player?</h2><ul>{found.map(p =>
          <li key={p.id}><a href={playerStudyHref(p.id, season, roleParam ? role : defaultPlayerRole(p.position), situation)}>{p.name} · {p.position ?? "Position unknown"}{found.some(other => other.id !== p.id && other.name === p.name && other.position === p.position) && " · " + p.id}</a></li>)}</ul></> :
          <p>{playerId ? "There are no individually credited plays for this player in the selected season’s records." : name ? "No players match that name in this season’s records. Try another name or season." :
            "Choose a player to find the snaps behind his numbers."}</p>}
      </div>}
      <form action={path} method="get" className={styles.filters} aria-label="Find player situations">
        <label>Season<select name="season" defaultValue={season}>{years.map(y => <option key={y}>{y}</option>)}</select></label>
        <label>Player<input type="search" name="name" list="jets-players" defaultValue={person?.name ?? name}
          placeholder="Name or part of a name" maxLength={120} autoComplete="off"/></label>
        <datalist id="jets-players">{choices.map(p => <option key={p.id} value={p.name}>{p.position ?? ""}</option>)}</datalist>
        <label>Role<select name="role" defaultValue={roleParam}>
          <option value="">Player’s usual role</option>
          {Object.entries(roles).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Situation<select name="situation" defaultValue={situation}>{Object.entries(situations).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button className={shared.button} type="submit">Find plays</button>
      </form>
      <p className={styles.scope}>{redZone ? "Red zone means the snap started at the opponent’s 20 or closer. The rate counts offensive touchdowns per play." :
        `${situation === "third-short" ? "Third-and-short means one or two yards to go. " : ""}A conversion or stop counts when the scorer records a third-down attempt and its outcome.`}
        {" "}Player samples omit penalties, fumbles, kneels, spikes, sacks and unclear player credits.
        {" "}<a href="https://github.com/nflverse/nflverse-data/releases/tag/pbp">nflverse play-by-play</a></p>
      <StudyNavigation current="player" />
    </FocusMoment>
    {person && data && <FocusMoment id="snaps" heading="Matching plays." label={`${person.name} · ${season}`}>
      {data.clips.length ? <>
        <p className={styles.scope}>Showing {start+1}–{Math.min(start+pageSize,data.clips.length)} of {data.clips.length}. Select a play to open its replay.</p>
        <ol className={styles.plays} start={start+1} role="list">{data.clips.slice(start,start+pageSize).map(({game,play,result}) =>
          <li key={game.id+"/"+play.key}><a href={driveReadHref(game.id,{play:play.key,phase:"action"})}>
            <span><strong>{`Week ${week.get(game.id)} · ${game.home ? "vs." : "at"} ${teamIdentity(game.opponent)?.nickname ?? game.opponent}`}</strong>
              <small>{snapTime(play)} · {snapSituation(game, play)}</small>
              <small>{[play.drive != null && "Drive " + play.drive,
                play.before && `Before the snap · NYJ ${play.before[0]}, ${game.opponent} ${play.before[1]}`].filter(Boolean).join(" · ")}</small></span>
            <span className={styles.outcome}>{resultName(result,redZone)}{play.facts?.yards !== undefined && <small>{play.facts.yards} yd</small>}</span>
          </a></li>)}</ol>
        <nav className={styles.pages} aria-label="Player play pages">
          {page > 1 && <a href={playerStudyHref(person.id,season,role,situation,page-1)+"#snaps"}>Previous plays</a>}
          {start+pageSize < data.clips.length && <a href={playerStudyHref(person.id,season,role,situation,page+1)+"#snaps"}>More plays</a>}
        </nav>
      </> : <a className={shared.go} href="#finder">Change the player or situation</a>}
    </FocusMoment>}
  </FocusShell>;
}
