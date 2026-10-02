"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { clockLabel, pct } from "@/lib/games";
import { formatDate } from "@/lib/current";
import { wpaLabel } from "@/lib/analytics-context";
import { parseVisualStorySelection, type VisualStory } from "@/lib/visual-story";
import styles from "./VisualGameStory.module.css";

const SELECTION_EVENT = "ajetsfan:visual-story-selection";
const HEIGHT = 238;
const LEFT = 42;
const RIGHT = 18;
const TOP = 20;
const BOTTOM = 38;

function subscribeLocation(notify: () => void) {
  window.addEventListener("popstate", notify);
  window.addEventListener(SELECTION_EVENT, notify);
  return () => {
    window.removeEventListener("popstate", notify);
    window.removeEventListener(SELECTION_EVENT, notify);
  };
}

const locationSnapshot = () => window.location.search;
const serverLocationSnapshot = () => "";
const reducedMotionSnapshot = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const serverMotionSnapshot = () => true;

function subscribeMotion(notify: () => void) {
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  preference.addEventListener("change", notify);
  return () => preference.removeEventListener("change", notify);
}

function writeSelection(storyId: string, index: number, mode: "push" | "replace") {
  const url = new URL(window.location.href);
  url.searchParams.set("story", storyId);
  url.searchParams.set("moment", String(index + 1));
  if (url.href === window.location.href) return;
  window.history[mode === "push" ? "pushState" : "replaceState"](window.history.state, "", url);
  window.dispatchEvent(new Event(SELECTION_EVENT));
}

function playType(type: string | null) {
  if (!type) return "Recorded play";
  if (type === "qb_kneel") return "Quarterback kneel";
  if (type === "qb_spike") return "Quarterback spike";
  return type.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function actionText(description: string | null) {
  return description?.replace(/^\([^)]*\)\s*/, "").replace(/\b\d{1,2}-(?=[A-Z])/g, "") || "Play description unavailable.";
}

export default function VisualGameStory({ stories }: { stories: VisualStory[] }) {
  return stories.length ? <StoryExperience stories={stories} /> : null;
}

function StoryExperience({ stories }: { stories: VisualStory[] }) {
  const search = useSyncExternalStore(subscribeLocation, locationSnapshot, serverLocationSnapshot);
  const reducedMotion = useSyncExternalStore(subscribeMotion, reducedMotionSnapshot, serverMotionSnapshot);
  const selection = parseVisualStorySelection(search, stories)!;
  const { story, index } = selection;
  const selected = story.points[index];
  const nextPoint = story.points[index + 1];
  const currentChapter = [...story.chapters].reverse().find((chapter) => chapter.index <= index) ?? story.chapters[0];
  const exactChapter = story.chapters.find((chapter) => chapter.index === index);
  const [playing, setPlaying] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<{ scope: string; status: string; fallback: string } | null>(null);
  const [width, setWidth] = useState(720);
  const section = useRef<HTMLElement>(null);
  const chart = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyRequest = useRef(0);
  const selectionScope = `${story.id}:${index}`;
  const copyStatus = copyFeedback?.scope === selectionScope ? copyFeedback.status : "";
  const copyFallback = copyFeedback?.scope === selectionScope ? copyFeedback.fallback : "";

  useEffect(() => {
    if (!chart.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(220, Math.round(entry.contentRect.width))));
    observer.observe(chart.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const pause = () => setPlaying(false);
    const onHistory = () => { pause(); copyRequest.current += 1; setCopyFeedback(null); };
    const onSelection = () => { copyRequest.current += 1; };
    const onVisibility = () => { if (document.hidden) pause(); };
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => { if (preference.matches) pause(); };
    window.addEventListener("popstate", onHistory);
    window.addEventListener(SELECTION_EVENT, onSelection);
    document.addEventListener("visibilitychange", onVisibility);
    preference.addEventListener("change", onMotion);
    const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) pause(); }, { threshold: 0 });
    if (section.current) observer.observe(section.current);
    return () => {
      observer.disconnect();
      copyRequest.current += 1;
      window.removeEventListener("popstate", onHistory);
      window.removeEventListener(SELECTION_EVENT, onSelection);
      document.removeEventListener("visibilitychange", onVisibility);
      preference.removeEventListener("change", onMotion);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    const timer = window.setTimeout(() => {
      if (document.hidden) { setPlaying(false); return; }
      const chapter = story.chapters.find((item) => item.index > index);
      if (!chapter) { setPlaying(false); return; }
      writeSelection(story.id, chapter.index, "replace");
      if (chapter === story.chapters.at(-1)) setPlaying(false);
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [playing, reducedMotion, story, index]);

  const geometry = (() => {
    const x = (at: number) => LEFT + at / Math.max(1, story.points.length - 1) * (width - LEFT - RIGHT);
    const y = (probability: number) => TOP + (1 - probability) * (HEIGHT - TOP - BOTTOM);
    const path = (end: number) => story.points.slice(0, end + 1).map((point, at) => `${at ? "L" : "M"}${x(at).toFixed(2)} ${y(point.wp).toFixed(2)}`).join(" ");
    const line = path(story.points.length - 1);
    const area = `${line} L${x(story.points.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`;
    return { x, y, line, area, revealed: path(index) };
  })();

  function choose(nextStory: VisualStory, nextIndex: number, mode: "push" | "replace" = "replace") {
    setPlaying(false);
    setInteracted(true);
    copyRequest.current += 1;
    if (copyTimer.current) clearTimeout(copyTimer.current);
    setCopyFeedback(null);
    writeSelection(nextStory.id, nextIndex, mode);
  }

  function seekFromChart(event: PointerEvent<SVGSVGElement>) {
    // Mouse dragging is a shortcut; native controls let touch readers scroll vertically.
    if (event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const location = (event.clientX - bounds.left) * width / bounds.width;
    const nextIndex = Math.round((location - LEFT) / (width - LEFT - RIGHT) * (story.points.length - 1));
    choose(story, Math.max(0, Math.min(story.points.length - 1, nextIndex)));
  }

  function togglePlayback() {
    if (reducedMotion) return;
    setInteracted(true);
    if (playing) { setPlaying(false); return; }
    if (!story.chapters.some((chapter) => chapter.index > index)) writeSelection(story.id, story.chapters[0].index, "replace");
    setPlaying(true);
  }

  async function copyMoment() {
    const request = ++copyRequest.current;
    const requestedLocation = window.location.href;
    const url = new URL(window.location.href);
    url.searchParams.set("story", story.id);
    url.searchParams.set("moment", String(index + 1));
    url.hash = "visual-story";
    if (copyTimer.current) clearTimeout(copyTimer.current);
    try {
      await navigator.clipboard.writeText(url.href);
      if (copyRequest.current !== request || window.location.href !== requestedLocation) return;
      setCopyFeedback({ scope: selectionScope, status: "Moment link copied.", fallback: "" });
      copyTimer.current = setTimeout(() => {
        if (copyRequest.current === request && window.location.href === requestedLocation) setCopyFeedback(null);
      }, 5000);
    } catch {
      if (copyRequest.current !== request || window.location.href !== requestedLocation) return;
      setCopyFeedback({ scope: selectionScope, status: "Select the link below to copy this moment.", fallback: url.href });
    }
  }

  const clock = clockLabel(selected.q, selected.t);
  const clockParts = clock.split(" ");
  const period = selected.q > 4 ? "Overtime" : `Quarter ${selected.q}`;
  const minimum = Math.min(...story.points.map((point) => point.wp));
  const maximum = Math.max(...story.points.map((point) => point.wp));

  return <section ref={section} id="visual-story" className={`${styles.story} ${interacted ? styles.interacted : ""}`} aria-labelledby="visual-story-heading" data-story={story.id} data-moment={index + 1} data-selected-index={index}>
    <div className={styles.filing}><span><i aria-hidden="true" />The Back Page / Visual stories</span><span>Recorded plays. An explorable story.</span></div>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>New York {story.game.atHome ? "vs" : "at"} {story.game.opponentDisplay} <span>·</span> <time dateTime={story.game.date}>{formatDate(story.game.date)}</time></p><h2 id="visual-story-heading">{story.title}</h2><p className={styles.dek}>{story.dek}</p></div>
      <div className={styles.final} aria-label={`Confirmed final: Jets ${story.game.jetsScore}, ${story.game.opponentDisplay} ${story.game.oppScore}`}><span>Confirmed final{story.game.wentToOt ? " / OT" : ""}</span><div><p><b>NYJ</b><strong>{story.game.jetsScore}</strong></p><span aria-hidden="true">—</span><p><b>{story.game.opponentDisplay}</b><strong>{story.game.oppScore}</strong></p></div></div>
    </header>
    <div className={styles.stories} role="group" aria-label="Choose a visual story">{stories.map((item, at) => <button type="button" key={item.id} aria-pressed={item.id === story.id} onClick={() => choose(item, item.chapters[0].index, "push")}><span>{String(at + 1).padStart(2, "0")}</span><strong>{item.title}</strong><small>{item.game.season} · {item.game.opponentDisplay}</small><span aria-hidden="true">↗</span></button>)}</div>
    <div className={styles.stage}>
      <div className={styles.clockPanel}><p className={styles.period}>{period}</p><p className={styles.clock} data-story-clock data-recorded-clock={clock} aria-label={`Recorded clock: ${clock || "unavailable"}`}>{clockParts[1] || (selected.q > 4 ? "OT" : "—")}</p><p className={styles.sequence}>Recorded play <strong>{String(index + 1).padStart(2, "0")}</strong> / {story.points.length}</p><div className={styles.lowPoint}><span>Lowest estimate in this sequence</span><strong>{pct(minimum)}</strong><small>Jets pre-play model probability</small></div></div>
      <div className={styles.actionPanel}>
        <p className={styles.actionLabel}><span>{playType(selected.type)}</span><span>{currentChapter ? `Chapter ${String(story.chapters.indexOf(currentChapter) + 1).padStart(2, "0")}` : "Play by play"}</span></p>
        <h3 className={styles.actionHeadline}>{exactChapter?.headline || playType(selected.type)}</h3>
        <p className={styles.action} data-selected-action>{actionText(selected.desc)}</p>
        <dl className={styles.probabilities} aria-label="Selected moment model estimates"><div><dt>Before this play</dt><dd data-story-probability>{pct(selected.wp)}</dd></div><div><dt>Before the next recorded play</dt><dd>{nextPoint ? pct(nextPoint.wp) : "Unavailable"}</dd></div><div><dt>Reported change on this play</dt><dd className={styles.change} data-story-delta>{wpaLabel(selected.d)}</dd></div></dl>
        <p className={styles.modelNote}>Jets win probability · model estimates{!nextPoint ? ". No later pre-play estimate is published in this sequence." : ". The next point is a separate recorded estimate."}</p>
      </div>
      <nav className={styles.chapters} aria-label="Visual story chapters"><p className={styles.railLabel}>The sequence</p>{story.chapters.map((chapter, at) => <button type="button" key={chapter.id} aria-pressed={currentChapter?.id === chapter.id} data-chapter={chapter.id} onClick={() => choose(story, chapter.index, "push")}><span className={styles.chapterNumber}>{String(at + 1).padStart(2, "0")}</span><span><small>{clockLabel(story.points[chapter.index].q, story.points[chapter.index].t)}</small><strong>{chapter.label}</strong></span><span className={styles.chapterArrow} aria-hidden="true">↗</span></button>)}</nav>
    </div>
    <figure className={styles.chartFigure}>
      <figcaption><strong>The probability path</strong><span>Before every recorded play · {story.points.length} points in this sequence</span></figcaption>
      <div ref={chart} className={styles.chart}>
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} className={styles.svg} role="img" aria-label={`Jets pre-play model win probability across ${story.points.length} recorded plays, from ${pct(minimum)} to ${pct(maximum)}. Selected play ${index + 1}: ${pct(selected.wp)}. The confirmed final score is shown separately.`} onPointerDown={(event) => { if (event.pointerType === "mouse") { event.currentTarget.setPointerCapture(event.pointerId); seekFromChart(event); } }} onPointerMove={(event) => { if (event.buttons & 1) seekFromChart(event); }}>
          {[0, .5, 1].map((value) => <g key={value}><line className={styles.grid} x1={LEFT} x2={width - RIGHT} y1={geometry.y(value)} y2={geometry.y(value)} /><text className={styles.axis} x={LEFT - 8} y={geometry.y(value) + 4} textAnchor="end">{value * 100}%</text></g>)}
          <path d={geometry.area} className={styles.area} /><path d={geometry.line} className={styles.path} /><path d={geometry.revealed} className={styles.revealed} />
          {story.chapters.map((chapter) => <circle key={chapter.id} className={styles.chapterDot} cx={geometry.x(chapter.index)} cy={geometry.y(story.points[chapter.index].wp)} r="3.5" />)}
          <g className={styles.selection} style={{ transform: `translateX(${geometry.x(index)}px)` }} data-story-marker data-selected-index={index} data-wp={selected.wp} data-selected-marker={index + 1}><line className={styles.guide} x1={0} x2={0} y1={TOP} y2={HEIGHT - BOTTOM} /><circle className={styles.halo} cx={0} cy={geometry.y(selected.wp)} r="10" /><circle className={styles.marker} cx={0} cy={geometry.y(selected.wp)} r="4.5" /></g>
          <text className={styles.axis} x={LEFT} y={HEIGHT - 12}>Play 1</text><text className={styles.axis} x={width - RIGHT} y={HEIGHT - 12} textAnchor="end">Play {story.points.length}</text>
        </svg>
      </div>
      <p className={styles.chartNote}>The horizontal axis is recorded play order. The line ends at the last available pre-play estimate.</p>
    </figure>
    <div className={styles.controls}>
      <div className={styles.seek}><label htmlFor="visual-story-range">Explore every recorded play <span>{index + 1} / {story.points.length}</span></label><input id="visual-story-range" type="range" min={1} max={story.points.length} step={1} value={index + 1} aria-label="Story play sequence" aria-valuetext={`Play ${index + 1} of ${story.points.length}, ${clock || "clock unavailable"}, Jets pre-play win probability ${pct(selected.wp)}`} onChange={(event) => choose(story, Number(event.target.value) - 1)} /><p>Drag, or use the arrow keys one play at a time.</p></div>
      <div className={styles.transport}><button type="button" disabled={index === 0} onClick={() => choose(story, index - 1)}><span aria-hidden="true">←</span> Previous play</button><button type="button" className={styles.playButton} disabled={reducedMotion} aria-pressed={playing} onClick={togglePlayback}><span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>{playing ? "Pause story" : "Play story"}</button><button type="button" disabled={index === story.points.length - 1} onClick={() => choose(story, index + 1)}>Next play <span aria-hidden="true">→</span></button></div>
      {reducedMotion ? <p className={styles.motionNote}>Playback is off with reduced motion. Use the chapters or slider.</p> : <p className={styles.motionNote}>Chapter playback advances every 3.2 seconds. You control when it starts.</p>}
    </div>
    <div className={styles.bottom}>
      <details className={styles.inspector}><summary className="disclosure"><span className="when-closed">Source play and methods</span><span className="when-open">Hide source play and methods</span></summary><div><p className={styles.sourceLabel}>Original published play description</p><p>{selected.desc || "Play description unavailable."}</p><p className={styles.sourceReadout}>Recorded clock: {clock || "unavailable"} · Before this play: {pct(selected.wp)} · Reported change: {wpaLabel(selected.d)}</p><p className={styles.sourceReadout}>This is a visualization of recorded play-by-play and model estimates. The final score is confirmed separately.</p><a href={`/data/curves/${story.id}.json`} target="_blank" rel="noreferrer">Published curve data <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a></div></details>
      <div className={styles.share}><button type="button" onClick={copyMoment}>Copy this moment <span aria-hidden="true">↗</span></button><p role="status">{copyStatus}</p>{copyFallback ? <label className={styles.copyFallback}>Moment link<input type="text" readOnly value={copyFallback} onFocus={(event) => event.currentTarget.select()} /></label> : null}</div>
    </div>
    <footer className={styles.source}><p>Recorded play-by-play: nflverse · rounded model estimates</p><div><Link href={`/games/${story.id}`}>Complete game evidence <span aria-hidden="true">↗</span></Link><a href={story.source.url} target="_blank" rel="noreferrer">{story.source.label} <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a><Link href={`/film-room?play=${story.id === "2022_02_NYJ_CLE" ? "wilson-cleveland" : "elliott-miami"}`}>Study the source film <span aria-hidden="true">↗</span></Link><Link href="/how-made">Methods &amp; definitions <span aria-hidden="true">↗</span></Link></div></footer>
  </section>;
}
