"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import Link from "./IntentLink";
import FocusMoment from "./FocusMoment";
import FocusNext from "./FocusNext";
import InlineMedia from "./InlineMedia";
import FocusPlay from "./FocusPlay";
import FocusShell from "./FocusShell";
import type { FocusData, FocusPoint } from "@/lib/focus";
import type { OnThisDay } from "@/lib/on-this-day";
import { LIVE_POLL_MS, type LiveGame } from "@/lib/live";
import { dayOf, halfGames, on, ORDINAL, record } from "@/lib/focus-format";
import { formatMediaDate } from "@/lib/media";
import { useMinuteClock } from "@/lib/use-minute-clock";
import shared from "./Focus.module.css";
import styles from "./FocusHome.module.css";

const pct = (wp: number) => `${Math.round(wp * 100)}%`;
const QUARTER = ["first quarter", "second quarter", "third quarter", "fourth quarter"];
const quarterName = (q: number) => QUARTER[q - 1] ?? "overtime";

function Toggle({ pressed, onChange, show, hide }: { pressed: boolean; onChange: (next: boolean) => void; show: string; hide: string }) {
  return <button type="button" className={shared.button} aria-pressed={pressed} onClick={() => onChange(!pressed)}>{pressed ? hide : show}</button>;
}

function Go({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className={shared.go}>{children} <span aria-hidden="true">→</span></Link>;
}

/** The game's shape: one point per play, evenly spaced, as the site's other charts do. */
function WinLine({ line, keys, label }: { line: FocusPoint[]; keys: boolean; label: string }) {
  const [at, setAt] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const last = line.length - 1;
  const x = (index: number) => index / last * 1000;
  const y = (wp: number) => (1 - wp) * 300;
  const path = line.map(([wp], index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(wp).toFixed(1)}`).join("");
  const quarters = line.flatMap(([, q], index) => index && q !== line[index - 1][1] ? [{ index, label: q > 4 ? "OT" : `Q${q}` }] : []);
  const best = line.reduce((top, point, index) => point[0] > line[top][0] ? index : top, 0);
  const marks = [{ index: 0, text: `Kickoff ${pct(line[0][0])}`, below: Math.abs(best) < last * .12 }, { index: best, text: `Best ${pct(line[best][0])}`, below: false }, { index: last, text: `Final ${pct(line[last][0])}`, below: line[last][0] > .85 }];
  const read = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    setAt(Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * last));
  };
  const move = (event: PointerEvent<HTMLDivElement>) => { if (event.pointerType === "mouse" || event.buttons) read(event.clientX); };
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setAt((current) => Math.min(last, Math.max(0, (current ?? (event.key === "ArrowLeft" ? last + 1 : -1)) + (event.key === "ArrowLeft" ? -1 : 1))));
  };
  const reading = at === null ? null : line[at];
  return <div ref={box} className={styles.chart} role="img" aria-label={label} tabIndex={0} onPointerMove={move} onPointerDown={(event) => read(event.clientX)} onPointerLeave={() => setAt(null)} onKeyDown={step} onBlur={() => setAt(null)} data-focus-chart>
    <svg viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
      {quarters.map((quarter) => <line key={quarter.index} className={styles.tick} x1={x(quarter.index)} x2={x(quarter.index)} y1="0" y2="300" />)}
      <line className={styles.even} x1="0" x2="1000" y1="150" y2="150" />
      <path className={styles.area} d={`${path}L1000 300L0 300Z`} />
      <path className={styles.line} d={path} />
    </svg>
    <i className={styles.final} style={{ top: `calc((100% - 24px) * ${(y(line[last][0]) / 300).toFixed(3)})` }} aria-hidden="true" />
    <div className={styles.axis} aria-hidden="true"><span style={{ left: 0 }}>Q1</span>{quarters.map((quarter) => <span key={quarter.index} style={{ left: `${x(quarter.index) / 10}%` }}>{quarter.label}</span>)}</div>
    {keys ? <div className={styles.keys} data-focus-keys>{marks.map((mark) => {
      // Labels near an edge hang inward so enlarged text cannot push them off the screen.
      const left = x(mark.index) / 10, edge = left < 20 ? styles.start : left > 80 ? styles.end : "";
      return <span key={mark.text} className={`${mark.below ? styles.below : ""} ${edge}`} style={{ left: `${left}%`, top: `${y(line[mark.index][0]) / 3}%` }}>{mark.text}</span>;
    })}</div> : null}
    {reading ? <><span className={styles.cursor} style={{ left: `${x(at!) / 10}%` }} aria-hidden="true" /><span className={styles.readout} role="status">{reading[1] > 4 ? "OT" : `Q${reading[1]}`} · {pct(reading[0])}</span></> : null}
  </div>;
}

/** The game in progress, from ESPN: polled while the page is visible, during the game's window only. */
export type LiveFixture = { id: string; kickoff: string; home: boolean; place: string; nickname: string };

const ORDINAL_QUARTER: Record<string, string> = { "1st": "1st quarter", "2nd": "2nd quarter", "3rd": "3rd quarter", "4th": "4th quarter", OT: "overtime" };
/** ESPN's "4:12 - 3rd" reads as "4:12 left in the 3rd quarter"; "Halftime" and "End of 3rd" stay as they are. */
const statusLine = (detail: string | undefined) => {
  const clock = detail?.match(/^(\d+:\d\d) - (1st|2nd|3rd|4th|OT)$/);
  return clock ? `${clock[1]} left in the ${ORDINAL_QUARTER[clock[2]]}` : detail ?? "";
};

function Live({ fixture }: { fixture: LiveFixture }) {
  const [live, setLive] = useState<LiveGame | null>(null);
  useEffect(() => {
    let stopped = false;
    // A failed check keeps the last score on screen; only a page with nothing yet says it is unavailable.
    const keep = (next: LiveGame) => setLive((current) => next.state === "unavailable" && (current?.state === "in" || current?.state === "post") ? current : next);
    // The first check always runs; later ones only while the page is on screen.
    const check = async (first = false) => {
      if (stopped || (!first && document.visibilityState !== "visible")) return;
      try {
        const response = await fetch(`/api/live?game=${encodeURIComponent(fixture.id)}`);
        if (!response.ok) throw new Error(String(response.status));
        const next = await response.json() as LiveGame;
        if (stopped) return;
        keep(next);
        // ESPN's final, or a game outside its window, needs no more checks.
        if (next.state === "post" || next.state === "idle") stop();
      } catch {
        if (!stopped) keep({ state: "unavailable", updatedAt: new Date().toISOString() });
      }
    };
    const poll = () => { check(); };
    const timer = setInterval(poll, LIVE_POLL_MS);
    const stop = () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
    document.addEventListener("visibilitychange", poll);
    check(true);
    return stop;
  }, [fixture.id]);

  const matchup = fixture.home ? `${fixture.place} at the Jets` : `Jets at ${fixture.place}`;
  const scored = live && (live.state === "in" || live.state === "post") && live.us !== undefined && live.them !== undefined;
  const line = scored && live.line && live.line.length >= 2 ? live.line : null;
  const heading = !live ? <>{matchup}. <em>Checking the live score…</em></>
    : live.state === "pre" ? <>{matchup}. <em>Kickoff at {on(fixture.kickoff, { hour: "numeric", minute: "2-digit" })} ET.</em></>
    : !scored ? <>{matchup}. <em>The live score is unavailable right now.</em></>
    : live.state === "post" ? <>Final: Jets {live.us}, {fixture.nickname} {live.them}.</>
    : <>Jets {live.us}, {fixture.nickname} {live.them}. <em>{statusLine(live.detail)}.</em></>;
  const updated = live ? on(live.updatedAt, { hour: "numeric", minute: "2-digit", second: "2-digit" }) : null;
  return <FocusMoment id="live" first label={`${live?.state === "post" ? "Final" : "Live"} · from ESPN`} heading={heading}
    status={<span className={styles.liveDot} data-live-state={live?.state ?? "loading"} aria-hidden="true" />}
    actions={live?.link ? <a href={live.link} className={shared.go} target="_blank" rel="noreferrer">ESPN Gamecast <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a> : null}>
    <figure className={shared.shape}>
      {line ? <WinLine line={line} keys={false} label={`ESPN's Jets win chance after each play so far: now ${pct(line.at(-1)![0])}.`} />
        : scored ? <div className={styles.score} role="img" aria-label={`Jets ${live.us}, ${fixture.nickname} ${live.them}`}><span style={{ width: `${live.us! / Math.max(live.us!, live.them!, 1) * 100}%` }}>NYJ {live.us}</span><span style={{ width: `${live.them! / Math.max(live.us!, live.them!, 1) * 100}%` }}>{fixture.nickname} {live.them}</span></div> : null}
      {scored && live.state === "in" && (live.situation || live.lastPlay) ? <p className={styles.situation} aria-live="polite">
        {live.situation ? <b>{live.ball === "jets" ? "Jets ball" : live.ball === "them" ? `${fixture.nickname} ball` : "Ball"} · {live.situation}</b> : null}
        {live.lastPlay ? <span>Last play: {live.lastPlay}</span> : null}
      </p> : null}
      <figcaption>{live?.state === "post"
        ? "ESPN’s final. The site’s own game report, from the official play-by-play, follows when that is published."
        : `Live score and win chance from ESPN, checked every ${LIVE_POLL_MS / 1000} seconds${updated ? ` (last at ${updated})` : ""}. The line is ESPN’s estimate of the Jets’ chance to win after each play, not this site’s model.`}</figcaption>
    </figure>
  </FocusMoment>;
}

function LastGame({ last, first, status }: { last: NonNullable<FocusData["last"]>; first: boolean; status: ReactNode }) {
  const [keys, setKeys] = useState(false);
  const verb = last.outcome === "win" ? "Won" : last.outcome === "loss" ? "Lost" : "Tied";
  const line = last.line.length >= 2 ? last.line : null;
  const best = line ? line.reduce((top, point) => point[0] > top[0] ? point : top) : null;
  return <FocusMoment id="last" first={first} status={status}
    label={`${last.archive ? "From the archive" : "Last game"} · ${last.postseason ? "Playoffs" : `Week ${last.week}`} · ${dayOf(last.date)}`}
    heading={<>{verb} {last.us}–{last.them} <em>{last.home ? "vs" : "at"} {last.place}.</em></>}
    actions={<>{line ? <Toggle pressed={keys} onChange={setKeys} show="Show the key moments" hide="Hide the key moments" /> : null}<Go href={last.href}>{last.hrefLabel}</Go></>}>
    <figure className={shared.shape}>
      {line && best ? <WinLine line={line} keys={keys} label={`Jets win chance, play by play: ${pct(line[0][0])} at kickoff, best ${pct(best[0])} in the ${quarterName(best[1])}, ${pct(line.at(-1)![0])} at the end.`} />
        : <div className={styles.score} role="img" aria-label={`Jets ${last.us}, ${last.place} ${last.them}`}><span style={{ width: `${last.us / Math.max(last.us, last.them, 1) * 100}%` }}>NYJ {last.us}</span><span style={{ width: `${last.them / Math.max(last.us, last.them, 1) * 100}%` }}>{last.opponent} {last.them}</span></div>}
      <figcaption>{line && best ? `The line is the Jets’ chance to win, play by play. It started at ${pct(line[0][0])}. The best it got was ${pct(best[0])}, in the ${quarterName(best[1])}.` : "The play-by-play line appears here once the game’s data is published."}</figcaption>
    </figure>
  </FocusMoment>;
}

function Season({ season }: { season: NonNullable<FocusData["season"]> }) {
  const [scores, setScores] = useState(false);
  const played = season.wins + season.losses + season.ties;
  const left = season.weeks.filter((week) => week.state === "next" || week.state === "upcoming").length;
  return <FocusMoment id="season" label={`${season.year} season`}
    heading={<>{record(season.wins, season.losses, season.ties)} <em>{played ? `after ${played} game${played === 1 ? "" : "s"}.` : "before the opener."}</em></>}
    actions={<><Toggle pressed={scores} onChange={setScores} show="Show each score" hide="Hide scores" /><Go href={`/seasons/${season.year}`}>Season page</Go></>}>
    <figure className={shared.shape}>
      <ol className={`${styles.marks} ${scores ? styles.scored : ""}`} aria-label={`${season.wins} wins, ${season.losses} losses${season.ties ? `, ${season.ties} ties` : ""}, ${left} games to play.`}>
        {season.weeks.map((week) => <li key={week.week} className={styles[week.state]} data-week-state={week.state}><i aria-hidden="true" /><span>{week.opponent ?? "Bye"}</span>{week.score ? <small>{week.score}</small> : null}<span className="sr-only">{week.state === "bye" ? `Week ${week.week}: bye` : `Week ${week.week}: ${week.opponent}${week.score ? `, ${week.state} ${week.score}` : week.state === "next" ? ", next game" : ""}`}</span></li>)}
      </ol>
      <figcaption className={styles.legend}><span className={styles.keyWin}>Win</span><span className={styles.keyLoss}>Loss</span><span>To play</span></figcaption>
    </figure>
  </FocusMoment>;
}

function Division({ division }: { division: NonNullable<FocusData["division"]> }) {
  const [points, setPoints] = useState(false);
  const most = Math.max(1, ...division.teams.map((team) => team.games));
  const heading = division.place === 1
    ? <>{division.tiedAtTop > 1 ? "Tied for first" : "First"} <em>in the {division.name}.</em></>
    : <>{ORDINAL[division.place - 1] ?? `No. ${division.place}`} <em>in the {division.name}, {halfGames(division.back)} behind {division.leader}.</em></>;
  return <FocusMoment id="division" label={division.name} heading={heading}
    actions={<><Toggle pressed={points} onChange={setPoints} show="Show points" hide="Hide points" /><Go href="/game-day#standings">Standings</Go></>}>
    <figure className={shared.shape}>
      <div className={styles.rows} role="img" aria-label={division.teams.map((team) => `${team.place} ${record(team.wins, team.losses, team.ties)}`).join(", ")}>
        {division.teams.map((team) => <div key={team.team} className={team.us ? styles.us : undefined}>
          <b>{team.team}</b><span className={styles.track}><span style={{ width: `${team.wins / most * 100}%` }} /></span><span>{record(team.wins, team.losses, team.ties)}</span>
          {points ? <small>{team.pointsFor} scored · {team.pointsAgainst} allowed</small> : null}
        </div>)}
      </div>
      <figcaption>Each bar is a team’s games so far; the filled part is wins.</figcaption>
    </figure>
  </FocusMoment>;
}

function Media({ media }: { media: NonNullable<FocusData["media"]> }) {
  return <FocusMoment id="media" label={`Watch & read · ${media.outlet}`} heading={<>{media.title}</>}
    actions={<Go href="/media">Browse the Media Room</Go>}>
    <figure className={shared.shape}>
      <InlineMedia item={media.item} outletName={media.outlet} feature sizes="(max-width: 959px) calc(100vw - 32px), 760px" />
      <figcaption>{formatMediaDate(media.publishedAt)} · {media.outlet}</figcaption>
    </figure>
  </FocusMoment>;
}

function Discovery({ discovery }: { discovery: NonNullable<FocusData["discovery"]> }) {
  return <FocusMoment id="discovery" label="Deep cuts · Beyond the box score" heading={<>Two {discovery.score} wins. <em>Two different stories.</em></>}
    actions={<Go href="/discover">See what the score hides</Go>}>
    <figure className={shared.shape}>
      <div className={styles.discovery}>{[discovery.low, discovery.high].map((game) => <div key={game.label}>
        <span>{game.label}</span><strong>{(game.chance * 100).toFixed(1)}%</strong>
        <i aria-hidden="true"><i style={{ width: `${game.chance * 100}%` }} /></i>
      </div>)}</div>
      <figcaption>Their lowest second-half Jets win chances, estimated by the model. The largest gap between two same-score games in {discovery.wins} eligible wins, from {discovery.firstSeason} through {dayOf(discovery.lastDate)} {discovery.lastDate.slice(0, 4)}. Open the paths, improbable finishes and play evidence.</figcaption>
    </figure>
  </FocusMoment>;
}

function Today({ today }: { today: OnThisDay }) {
  const span = Math.max(1, today.to - today.from);
  const only = today.games.length === 1 ? today.games[0] : null;
  const verb = (game: OnThisDay["games"][number]) => game.outcome === "win" ? "Beat" : game.outcome === "loss" ? "Lost to" : "Tied";
  const score = (game: OnThisDay["games"][number]) => game.outcome === "loss" ? `${game.them}–${game.us}` : `${game.us}–${game.them}`;
  return <FocusMoment id="today" label={`On this day · ${today.day}`}
    heading={only ? <>{today.day}, {only.year}: <em>{verb(only).toLowerCase()} {only.opponent} {score(only)}.</em></> : <>{record(today.wins, today.losses, today.ties)} on {today.day} <em>since {today.from}.</em></>}>
    <figure className={shared.shape}>
      <div className={styles.years} role="img" aria-label={`${today.games.length} Jets ${today.games.length === 1 ? "game" : "games"} on ${today.day} between ${today.from} and ${today.to}.`}>
        {today.games.map((game) => <i key={game.id} className={styles[game.outcome]} style={{ left: `${(game.year - today.from) / span * 100}%` }} />)}
        <span>{today.from}</span><span>{today.to}</span>
      </div>
      <ul className={styles.dated}>{today.games.map((game) => <li key={game.id}>
        <Link href={game.href}><b>{game.year}</b> <span>{verb(game)} {game.opponent} {score(game)}</span> <small>{game.home ? "Home" : "Away"}</small><span aria-hidden="true">→</span></Link>
      </li>)}</ul>
      <figcaption>Every Jets game played on {today.day} since the {today.from} season, from the NFL schedule record. Each dot is a year; filled dots are wins.</figcaption>
    </figure>
  </FocusMoment>;
}

export default function FocusHome({ data, today = null, live = null, className = "" }: { data: FocusData; today?: OnThisDay | null; live?: LiveFixture | null; className?: string }) {
  const now = useMinuteClock();
  const verb = (outcome: "win" | "loss" | "tie") => outcome === "win" ? "Won" : outcome === "loss" ? "Lost" : "Tied";
  const entries = [
    live ? { id: "live", title: "Live", answer: live.home ? `${live.place} at the Jets` : `At ${live.place}` } : null,
    data.last ? { id: "last", title: data.last.archive ? "From the archive" : "Last game", answer: `${verb(data.last.outcome)} ${data.last.us}–${data.last.them}` } : null,
    data.next ? { id: "next", title: "Next game", answer: `${data.next.place}, ${on(data.next.kickoff ?? `${data.next.date}T17:00:00Z`, { weekday: "short" })}` } : null,
    data.season ? { id: "season", title: `${data.season.year} season`, answer: record(data.season.wins, data.season.losses, data.season.ties) } : null,
    data.division ? { id: "division", title: data.division.name, answer: data.division.place === 1 ? "First" : `${ORDINAL[data.division.place - 1] ?? data.division.place}, ${halfGames(data.division.back)} back` } : null,
    today ? { id: "today", title: `On this day · ${today.day}`, answer: today.games.length === 1 ? `${today.games[0].outcome === "win" ? "A win" : today.games[0].outcome === "loss" ? "A loss" : "A tie"}, ${today.games[0].year}` : `${record(today.wins, today.losses, today.ties)} since ${today.from}` } : null,
    data.film ? { id: "film", title: "Film Room", answer: data.film.title.split(":")[0] } : null,
    data.discovery ? { id: "discovery", title: "Deep cuts", answer: `Two ${data.discovery.score} wins` } : null,
    data.media ? { id: "media", title: "Watch & read", answer: data.media.outlet } : null,
  ].filter((entry): entry is { id: string; title: string; answer: string } => entry !== null);

  const stale = data.checkedAt && now && now - Date.parse(data.checkedAt) > 86_400_000;
  const days = stale ? Math.floor((now - Date.parse(data.checkedAt!)) / 86_400_000) : 0;
  const status = stale ? <p className={shared.stale} role="status" aria-label="Results update status"><strong>Update overdue.</strong> Results were last checked {days} {days === 1 ? "day" : "days"} ago, so newer results may be missing.</p> : null;
  const wins = data.season?.wins ?? 0, losses = data.season?.losses ?? 0, ties = data.season?.ties ?? 0;

  return <FocusShell page="home" entries={entries} checkedAt={data.checkedAt} className={className}>
    {live ? <Live fixture={live} /> : null}
    {data.last ? <LastGame last={data.last} first={!live} status={status} /> : status}
    {data.next ? <FocusNext next={data.next} wins={wins} losses={losses} ties={ties} first={!data.last && !live} go={{ href: "/game-day", label: "Game Day" }} /> : null}
    {data.season ? <Season season={data.season} /> : null}
    {data.division ? <Division division={data.division} /> : null}
    {today ? <Today today={today} /> : null}
    {data.film ? <FocusPlay id="film" label={`Film Room · ${on(`${data.film.date}T16:00:00Z`, { month: "short", day: "numeric", year: "numeric" })}`} play={data.film} more={<Go href="/film-room">Open the Film Room</Go>} /> : null}
    {data.discovery ? <Discovery discovery={data.discovery} /> : null}
    {data.media ? <Media media={data.media} /> : null}
  </FocusShell>;
}
