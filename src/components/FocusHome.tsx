"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import Link from "./IntentLink";
import type { FocusData, FocusPoint } from "@/lib/focus";
import { formatMediaDate } from "@/lib/media";
import { sampleBall, samplePlayer } from "@/lib/playbook";
import { SECTIONS } from "@/lib/site-sections";
import { useMinuteClock } from "@/lib/use-minute-clock";
import styles from "./FocusHome.module.css";

const ET = "America/New_York";
const on = (iso: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: ET, ...options }).format(new Date(iso));
/** The New York calendar day of a moment, as YYYY-MM-DD. */
const etDay = (time: number | string) => new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));
const noon = (day: string) => Date.parse(`${day}T12:00:00Z`);
const dayOf = (iso: string) => on(iso.length === 10 ? `${iso}T16:00:00Z` : iso, { month: "short", day: "numeric" });
const pct = (wp: number) => `${Math.round(wp * 100)}%`;
const QUARTER = ["first quarter", "second quarter", "third quarter", "fourth quarter"];
const quarterName = (q: number) => QUARTER[q - 1] ?? "overtime";
const record = (w: number, l: number, t = 0) => `${w}–${l}${t ? `–${t}` : ""}`;
const half = (games: number) => `${Math.floor(games) || (games % 1 ? "" : "0")}${games % 1 ? "½" : ""} game${games > 1 ? "s" : ""}`;
const ordinal = ["First", "Second", "Third", "Fourth"];

function Moment({ id, label, heading, first, children, actions, status }: { id: string; label: string; heading: ReactNode; first?: boolean; children: ReactNode; actions: ReactNode; status?: ReactNode }) {
  const Heading = first ? "h1" : "h2";
  return <section id={id} className={styles.moment} aria-labelledby={`${id}-heading`} data-focus-moment={id}>
    {status}
    <p className={styles.label}>{label}</p>
    <Heading id={`${id}-heading`} className={styles.say}>{heading}</Heading>
    {children}
    <div className={styles.actions}>{actions}</div>
  </section>;
}

function Toggle({ pressed, onChange, show, hide }: { pressed: boolean; onChange: (next: boolean) => void; show: string; hide: string }) {
  return <button type="button" className={styles.button} aria-pressed={pressed} onClick={() => onChange(!pressed)}>{pressed ? hide : show}</button>;
}

function Go({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className={styles.go}>{children} <span aria-hidden="true">→</span></Link>;
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
  return <Moment id="last" first={first} status={status}
    label={`${last.archive ? "From the archive" : "Last game"} · ${last.postseason ? "Playoffs" : `Week ${last.week}`} · ${dayOf(last.date)}`}
    heading={<>{verb} {last.us}–{last.them} <em>{last.home ? "vs" : "at"} {last.place}.</em></>}
    actions={<>{line ? <Toggle pressed={keys} onChange={setKeys} show="Show the key moments" hide="Hide the key moments" /> : null}<Go href={last.href}>{last.hrefLabel}</Go></>}>
    <figure className={styles.shape}>
      {line && best ? <WinLine line={line} keys={keys} label={`Jets win chance, play by play: ${pct(line[0][0])} at kickoff, best ${pct(best[0])} in the ${quarterName(best[1])}, ${pct(line.at(-1)![0])} at the end.`} />
        : <div className={styles.score} role="img" aria-label={`Jets ${last.us}, ${last.place} ${last.them}`}><span style={{ width: `${last.us / Math.max(last.us, last.them, 1) * 100}%` }}>NYJ {last.us}</span><span style={{ width: `${last.them / Math.max(last.us, last.them, 1) * 100}%` }}>{last.opponent} {last.them}</span></div>}
      <figcaption>{line && best ? `The line is the Jets’ chance to win, play by play. It started at ${pct(line[0][0])}. The best it got was ${pct(best[0])}, in the ${quarterName(best[1])}.` : "The play-by-play line appears here once the game’s data is published."}</figcaption>
    </figure>
  </Moment>;
}

function NextGame({ next, wins, losses, ties }: { next: NonNullable<FocusData["next"]>; wins: number; losses: number; ties: number }) {
  const [meaning, setMeaning] = useState(false);
  const now = useMinuteClock();
  const kickoff = next.kickoff ?? `${next.date}T17:00:00Z`;
  const kick = Date.parse(kickoff);
  const passed = now ? now >= kick : next.overdue;
  const gameDay = etDay(kickoff);
  const today = now ? etDay(now) : null;
  const days = today ? Math.round((noon(gameDay) - noon(today)) / 86_400_000) : null;
  const when = days === null ? `${on(kickoff, { weekday: "long", month: "short", day: "numeric" })}` : days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
  // The seven calendar days that end on game day; today is marked once the browser knows the date.
  const strip = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(noon(gameDay) - (6 - index) * 86_400_000).toISOString().slice(0, 10);
    return { key: day, letter: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "narrow" }).format(new Date(noon(day))), game: index === 6, today: day === today, past: today !== null && day < today };
  });
  return <Moment id="next"
    label={`Next game · ${next.postseason ? "Playoffs" : `Week ${next.week}`}`}
    heading={<>{next.home ? next.place : `At ${next.place}`}, {on(kickoff, { weekday: "long" })} <em>{next.kickoff ? `${on(kickoff, { hour: "numeric", minute: "2-digit" })} ET` : on(kickoff, { month: "short", day: "numeric" })}</em></>}
    actions={<><Toggle pressed={meaning} onChange={setMeaning} show="What each result means" hide="Hide" /><Go href="/game-day">Game Day</Go></>}>
    <figure className={styles.shape}>
      <div className={styles.week} role="img" aria-label={`The week before the game. Game day is ${on(kickoff, { weekday: "long", month: "long", day: "numeric" })}.`}>
        {strip.map((day) => <span key={day.key} className={`${styles.day} ${day.game ? styles.gameDay : ""} ${day.today ? styles.today : ""} ${day.past ? styles.past : ""}`}><i />{day.letter}</span>)}
      </div>
      <figcaption>{passed ? "Kickoff has passed. The final score appears here once it is recorded." : `${when}, ${next.home ? "at home" : "on the road"}. The filled circle is game day.`}</figcaption>
      {meaning ? <p className={styles.reveal} data-focus-reveal>A win makes them {record(wins + 1, losses, ties)}. A loss makes them {record(wins, losses + 1, ties)}.</p> : null}
    </figure>
  </Moment>;
}

function Season({ season }: { season: NonNullable<FocusData["season"]> }) {
  const [scores, setScores] = useState(false);
  const played = season.wins + season.losses + season.ties;
  const left = season.weeks.filter((week) => week.state === "next" || week.state === "upcoming").length;
  return <Moment id="season" label={`${season.year} season`}
    heading={<>{record(season.wins, season.losses, season.ties)} <em>{played ? `after ${played} game${played === 1 ? "" : "s"}.` : "before the opener."}</em></>}
    actions={<><Toggle pressed={scores} onChange={setScores} show="Show each score" hide="Hide scores" /><Go href={`/seasons/${season.year}`}>Season page</Go></>}>
    <figure className={styles.shape}>
      <ol className={`${styles.marks} ${scores ? styles.scored : ""}`} aria-label={`${season.wins} wins, ${season.losses} losses${season.ties ? `, ${season.ties} ties` : ""}, ${left} games to play.`}>
        {season.weeks.map((week) => <li key={week.week} className={styles[week.state]} data-week-state={week.state}><i aria-hidden="true" /><span>{week.opponent ?? "Bye"}</span>{week.score ? <small>{week.score}</small> : null}<span className="sr-only">{week.state === "bye" ? `Week ${week.week}: bye` : `Week ${week.week}: ${week.opponent}${week.score ? `, ${week.state} ${week.score}` : week.state === "next" ? ", next game" : ""}`}</span></li>)}
      </ol>
      <figcaption className={styles.legend}><span className={styles.keyWin}>Win</span><span className={styles.keyLoss}>Loss</span><span>To play</span></figcaption>
    </figure>
  </Moment>;
}

function Division({ division }: { division: NonNullable<FocusData["division"]> }) {
  const [points, setPoints] = useState(false);
  const most = Math.max(1, ...division.teams.map((team) => team.games));
  const heading = division.place === 1
    ? <>{division.tiedAtTop > 1 ? "Tied for first" : "First"} <em>in the {division.name}.</em></>
    : <>{ordinal[division.place - 1] ?? `No. ${division.place}`} <em>in the {division.name}, {half(division.back)} behind {division.leader}.</em></>;
  return <Moment id="division" label={division.name} heading={heading}
    actions={<><Toggle pressed={points} onChange={setPoints} show="Show points" hide="Hide points" /><Go href="/game-day#standings">Standings</Go></>}>
    <figure className={styles.shape}>
      <div className={styles.rows} role="img" aria-label={division.teams.map((team) => `${team.place} ${record(team.wins, team.losses, team.ties)}`).join(", ")}>
        {division.teams.map((team) => <div key={team.team} className={team.us ? styles.us : undefined}>
          <b>{team.team}</b><span className={styles.track}><span style={{ width: `${team.wins / most * 100}%` }} /></span><span>{record(team.wins, team.losses, team.ties)}</span>
          {points ? <small>{team.pointsFor} scored · {team.pointsAgainst} allowed</small> : null}
        </div>)}
      </div>
      <figcaption>Each bar is a team’s games so far; the filled part is wins.</figcaption>
    </figure>
  </Moment>;
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
  return <Moment id="film" label={`Film Room · ${on(`${film.date}T16:00:00Z`, { month: "short", day: "numeric", year: "numeric" })}`}
    heading={<>{film.title.split(":")[0]}. <em>{film.result.split(" · ").at(-1)}.</em></>}
    actions={<><button type="button" className={styles.button} onClick={play} disabled={running} data-focus-play>{time >= 6 ? "Play it again" : running ? "Playing…" : "Play it"}</button><Go href="/film-room">Open the Film Room</Go></>}>
    <figure className={styles.shape}>
      <svg className={styles.field} viewBox="0 30 1000 540" role="img" aria-label="Twenty-two players at the snap; the highlighted route is the play’s key route." data-focus-field data-time={time.toFixed(1)}>
        {[60, 120, 180, 240, 300, 420, 480, 540].map((line) => <line key={line} className={styles.yard} x1="0" x2="1000" y1={line} y2={line} />)}
        <line className={styles.scrimmage} x1="0" x2="1000" y1="360" y2="360" />
        {star ? <polyline className={styles.route} points={[star, ...star.path].map((point) => `${point.x},${point.y}`).join(" ")} /> : null}
        {film.design.players.map((player) => { const point = samplePlayer(player, time); return <circle key={player.id} cx={point.x} cy={point.y} r={player.id === film.star ? 15 : 11} className={player.id === film.star ? styles.star : player.side === "offense" ? styles.offense : styles.defense} />; })}
        <circle className={styles.ball} cx={ball.x} cy={ball.y - 14} r="7" />
      </svg>
      <figcaption>{film.situation.replace(/ · /g, ", ")}. {film.summary.split(". ")[0]}. Drawn to show the idea, not traced from film.</figcaption>
    </figure>
  </Moment>;
}

function Media({ media }: { media: NonNullable<FocusData["media"]> }) {
  return <Moment id="media" label={`Watch & read · ${media.outlet}`} heading={<>{media.title}</>}
    actions={<Go href={`/media?media=${encodeURIComponent(media.id)}`}>Open it in the Media Room</Go>}>
    <figure className={styles.shape}>
      {media.image ? <div className={`${styles.picture} ${Math.abs(media.image.width / media.image.height - 1) < .2 ? styles.square : ""}`}><Image src={media.image.url} alt="" fill sizes="(max-width: 959px) calc(100vw - 32px), 760px" /></div> : null}
      <figcaption>{formatMediaDate(media.publishedAt)}. The newest item in the Media Room with its publisher’s picture.</figcaption>
    </figure>
  </Moment>;
}

export default function FocusHome({ data, className = "" }: { data: FocusData; className?: string }) {
  const now = useMinuteClock();
  const [active, setActive] = useState(0);
  const moments = [
    data.last ? { id: "last", title: data.last.archive ? "From the archive" : "Last game", answer: `${data.last.outcome === "win" ? "Won" : data.last.outcome === "loss" ? "Lost" : "Tied"} ${data.last.us}–${data.last.them}` } : null,
    data.next ? { id: "next", title: "Next game", answer: `${data.next.place}, ${on(data.next.kickoff ?? `${data.next.date}T17:00:00Z`, { weekday: "short" })}` } : null,
    data.season ? { id: "season", title: `${data.season.year} season`, answer: record(data.season.wins, data.season.losses, data.season.ties) } : null,
    data.division ? { id: "division", title: data.division.name, answer: data.division.place === 1 ? "First" : `${ordinal[data.division.place - 1] ?? data.division.place}, ${half(data.division.back)} back` } : null,
    data.film ? { id: "film", title: "Film Room", answer: data.film.title.split(":")[0] } : null,
    data.media ? { id: "media", title: "Watch & read", answer: data.media.outlet } : null,
    { id: "more", title: "Everything else", answer: "Team, seasons, archive…" },
  ].filter((moment): moment is { id: string; title: string; answer: string } => moment !== null);

  useEffect(() => {
    const sections = moments.map((moment) => document.getElementById(moment.id)).filter((section): section is HTMLElement => section !== null);
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) setActive(sections.indexOf(entry.target as HTMLElement));
    }, { threshold: .55 });
    sections.forEach((section) => observer.observe(section));
    const keys = (event: globalThis.KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement).closest("input, select, textarea, [data-focus-chart]")) return;
      const step = ["ArrowDown", "j"].includes(event.key) ? 1 : ["ArrowUp", "k"].includes(event.key) ? -1 : 0;
      if (!step) return;
      const current = sections.findIndex((section) => Math.abs(section.getBoundingClientRect().top) < section.offsetHeight / 2);
      const target = sections[Math.min(sections.length - 1, Math.max(0, (current < 0 ? 0 : current) + step))];
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    };
    addEventListener("keydown", keys);
    return () => { observer.disconnect(); removeEventListener("keydown", keys); };
  // The moment list only changes with a new build.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stale = data.checkedAt && now && now - Date.parse(data.checkedAt) > 86_400_000;
  const days = stale ? Math.floor((now - Date.parse(data.checkedAt!)) / 86_400_000) : 0;
  const status = stale ? <p className={styles.stale} role="status" aria-label="Results update status"><strong>Update overdue.</strong> Results were last checked {days} {days === 1 ? "day" : "days"} ago, so newer results may be missing.</p> : null;
  const wins = data.season?.wins ?? 0, losses = data.season?.losses ?? 0, ties = data.season?.ties ?? 0;

  return <div className={`${styles.app} ${className}`} data-focus-home>
    <header className={styles.bar}>
      <Link href="/" className={styles.brand}>ajets<span>fan</span></Link>
      <span className={styles.progress} aria-hidden="true">{moments.map((moment, index) => <i key={moment.id} data-on={index === active ? "" : undefined} />)}</span>
      <a href="#more" className={styles.menu}>Menu</a>
    </header>
    <aside className={styles.rail}>
      <Link href="/" className={styles.brand}>ajets<span>fan</span></Link>
      <nav aria-label="On this page"><ol>{moments.map((moment, index) => <li key={moment.id}><a href={`#${moment.id}`} aria-current={index === active ? "true" : undefined}><span>{moment.title}</span><b>{moment.answer}</b></a></li>)}</ol></nav>
      {data.checkedAt ? <p className={styles.note}>Results checked {on(data.checkedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET.</p> : null}
    </aside>
    <main id="main" className={styles.stack}>
      {data.last ? <LastGame last={data.last} first status={status} /> : null}
      {data.next ? <NextGame next={data.next} wins={wins} losses={losses} ties={ties} /> : null}
      {data.season ? <Season season={data.season} /> : null}
      {data.division ? <Division division={data.division} /> : null}
      {data.film ? <Film film={data.film} /> : null}
      {data.media ? <Media media={data.media} /> : null}
      <section id="more" className={styles.moment} aria-labelledby="more-heading" data-focus-moment="more">
        {data.last ? null : status}
        <p className={styles.label}>ajetsfan</p>
        {data.last ? <h2 id="more-heading" className={styles.say}>Everything else.</h2> : <h1 id="more-heading" className={styles.say}>Everything else.</h1>}
        <nav aria-label="Site sections" className={styles.sections}><ul>{SECTIONS.map((section) => <li key={section.href}><Link href={section.href} pendingHint><b>{section.label}</b><span>{section.note}</span></Link></li>)}</ul></nav>
        {data.checkedAt ? <p className={styles.note}>Results checked {on(data.checkedAt, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} ET.</p> : null}
      </section>
    </main>
  </div>;
}
