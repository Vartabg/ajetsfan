"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import Link from "./IntentLink";
import FocusMoment from "./FocusMoment";
import FocusNext from "./FocusNext";
import FocusShell from "./FocusShell";
import type { FocusData, FocusPoint } from "@/lib/focus";
import { dayOf, halfGames, on, ORDINAL, record } from "@/lib/focus-format";
import { formatMediaDate } from "@/lib/media";
import { sampleBall, samplePlayer } from "@/lib/playbook";
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
    <div className={styles.axis} aria-hidden="true"><span style={{ left: 0 }}>Q1</span>{quarters.map((quarter) => <span key={quarter.index} style={{ left: `${x(quarter.index) / 10}%` }}>{quarter.label}</span>)}</div>
    {keys ? <div className={styles.keys} data-focus-keys>{marks.map((mark) => {
      // Labels near an edge hang inward so enlarged text cannot push them off the screen.
      const left = x(mark.index) / 10, edge = left < 20 ? styles.start : left > 80 ? styles.end : "";
      return <span key={mark.text} className={`${mark.below ? styles.below : ""} ${edge}`} style={{ left: `${left}%`, top: `${y(line[mark.index][0]) / 3}%` }}>{mark.text}</span>;
    })}</div> : null}
    {reading ? <><span className={styles.cursor} style={{ left: `${x(at!) / 10}%` }} aria-hidden="true" /><span className={styles.readout} role="status">{reading[1] > 4 ? "OT" : `Q${reading[1]}`} · {pct(reading[0])}</span></> : null}
  </div>;
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

function Film({ film }: { film: NonNullable<FocusData["film"]> }) {
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const play = () => {
    cancelAnimationFrame(frame.current);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setTime(6); return; }
    const start = performance.now();
    setRunning(true);
    const tick = (now: number) => {
      const seconds = Math.min(6, (now - start) / 1000);
      setTime(seconds);
      if (seconds < 6) frame.current = requestAnimationFrame(tick); else setRunning(false);
    };
    frame.current = requestAnimationFrame(tick);
  };
  const star = film.design.players.find((player) => player.id === film.star);
  const ball = sampleBall(film.design, time);
  return <FocusMoment id="film" label={`Film Room · ${on(`${film.date}T16:00:00Z`, { month: "short", day: "numeric", year: "numeric" })}`}
    heading={<>{film.title.split(":")[0]}. <em>{film.result.split(" · ").at(-1)}.</em></>}
    actions={<><button type="button" className={shared.button} onClick={play} disabled={running} data-focus-play>{time >= 6 ? "Play it again" : running ? "Playing…" : "Play it"}</button><Go href="/film-room">Open the Film Room</Go></>}>
    <figure className={shared.shape}>
      <svg className={styles.field} viewBox="0 30 1000 540" role="img" aria-label="Twenty-two players at the snap; the highlighted route is the play’s key route." data-focus-field data-time={time.toFixed(1)}>
        {[60, 120, 180, 240, 300, 420, 480, 540].map((line) => <line key={line} className={styles.yard} x1="0" x2="1000" y1={line} y2={line} />)}
        <line className={styles.scrimmage} x1="0" x2="1000" y1="360" y2="360" />
        {star ? <polyline className={styles.route} points={[star, ...star.path].map((point) => `${point.x},${point.y}`).join(" ")} /> : null}
        {film.design.players.map((player) => { const point = samplePlayer(player, time); return <circle key={player.id} cx={point.x} cy={point.y} r={player.id === film.star ? 15 : 11} className={player.id === film.star ? styles.star : player.side === "offense" ? styles.offense : styles.defense} />; })}
        <circle className={styles.ball} cx={ball.x} cy={ball.y - 14} r="7" />
      </svg>
      <figcaption>{film.situation.replace(/ · /g, ", ")}. {film.summary.split(". ")[0]}. Drawn to show the idea, not traced from film.</figcaption>
    </figure>
  </FocusMoment>;
}

function Media({ media }: { media: NonNullable<FocusData["media"]> }) {
  return <FocusMoment id="media" label={`Watch & read · ${media.outlet}`} heading={<>{media.title}</>}
    actions={<Go href={`/media?media=${encodeURIComponent(media.id)}`}>Open it in the Media Room</Go>}>
    <figure className={shared.shape}>
      {media.image ? <div className={`${styles.picture} ${Math.abs(media.image.width / media.image.height - 1) < .2 ? styles.square : ""}`}><Image src={media.image.url} alt="" fill sizes="(max-width: 959px) calc(100vw - 32px), 760px" /></div> : null}
      <figcaption>{formatMediaDate(media.publishedAt)}. The newest item in the Media Room with its publisher’s picture.</figcaption>
    </figure>
  </FocusMoment>;
}

export default function FocusHome({ data, className = "" }: { data: FocusData; className?: string }) {
  const now = useMinuteClock();
  const verb = (outcome: "win" | "loss" | "tie") => outcome === "win" ? "Won" : outcome === "loss" ? "Lost" : "Tied";
  const entries = [
    data.last ? { id: "last", title: data.last.archive ? "From the archive" : "Last game", answer: `${verb(data.last.outcome)} ${data.last.us}–${data.last.them}` } : null,
    data.next ? { id: "next", title: "Next game", answer: `${data.next.place}, ${on(data.next.kickoff ?? `${data.next.date}T17:00:00Z`, { weekday: "short" })}` } : null,
    data.season ? { id: "season", title: `${data.season.year} season`, answer: record(data.season.wins, data.season.losses, data.season.ties) } : null,
    data.division ? { id: "division", title: data.division.name, answer: data.division.place === 1 ? "First" : `${ORDINAL[data.division.place - 1] ?? data.division.place}, ${halfGames(data.division.back)} back` } : null,
    data.film ? { id: "film", title: "Film Room", answer: data.film.title.split(":")[0] } : null,
    data.media ? { id: "media", title: "Watch & read", answer: data.media.outlet } : null,
  ].filter((entry): entry is { id: string; title: string; answer: string } => entry !== null);

  const stale = data.checkedAt && now && now - Date.parse(data.checkedAt) > 86_400_000;
  const days = stale ? Math.floor((now - Date.parse(data.checkedAt!)) / 86_400_000) : 0;
  const status = stale ? <p className={shared.stale} role="status" aria-label="Results update status"><strong>Update overdue.</strong> Results were last checked {days} {days === 1 ? "day" : "days"} ago, so newer results may be missing.</p> : null;
  const wins = data.season?.wins ?? 0, losses = data.season?.losses ?? 0, ties = data.season?.ties ?? 0;

  return <FocusShell page="home" entries={entries} checkedAt={data.checkedAt} className={className}>
    {data.last ? <LastGame last={data.last} first status={status} /> : status}
    {data.next ? <FocusNext next={data.next} wins={wins} losses={losses} ties={ties} first={!data.last} go={{ href: "/game-day", label: "Game Day" }} /> : null}
    {data.season ? <Season season={data.season} /> : null}
    {data.division ? <Division division={data.division} /> : null}
    {data.film ? <Film film={data.film} /> : null}
    {data.media ? <Media media={data.media} /> : null}
  </FocusShell>;
}
