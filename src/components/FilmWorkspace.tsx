"use client";

import { useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import type { FilmCase } from "@/lib/film-room";
import PlaybookLab from "./PlaybookLab";
import styles from "@/app/film-room/page.module.css";

const WORKSPACE_EVENT = "ajetsfan:film-workspace";
const FilmRoom = dynamic(() => import("./FilmRoom"), {
  loading: () => <p role="status">Loading the game record…</p>,
});
const prepareStudies = () => { void import("./FilmRoom"); };
function subscribe(notify: () => void) {
  const events = ["popstate", "hashchange", "ajetsfan:film-selection", WORKSPACE_EVENT];
  events.forEach((event) => window.addEventListener(event, notify));
  return () => events.forEach((event) => window.removeEventListener(event, notify));
}
const snapshot = () => window.location.search + window.location.hash;
const serverSnapshot = () => "";
function selectedWorkspace(location: string): "playbook" | "studies" {
  const url = new URL(location || "/film-room", "https://ajetsfan.example/film-room");
  if (/^#(?:playbook-lab|jets-play|jets-play-stage)(?::|$)/.test(url.hash)) return "playbook";
  if (url.hash === "#film-room" || url.hash === "#scouting-board") return "studies";
  const workspace = url.searchParams.get("workspace");
  if (workspace === "playbook" || workspace === "studies") return workspace;
  return ["play", "coverage", "pressure", "step"].some((key) => url.searchParams.has(key)) ? "studies" : "playbook";
}

export default function FilmWorkspace({ cases }: { cases: FilmCase[] }) {
  const location = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const selected = selectedWorkspace(location);
  const [studiesVisited, setStudiesVisited] = useState(false);
  // Retain the loaded notebook when returning to the board, including edits.
  if (selected === "studies" && !studiesVisited) setStudiesVisited(true);
  function choose(next: "playbook" | "studies") {
    if (next === selected) return;
    const url = new URL(window.location.href);
    url.searchParams.set("workspace", next);
    url.hash = next === "playbook" ? "playbook-lab" : "film-room";
    window.history.pushState(window.history.state, "", url);
    window.dispatchEvent(new Event(WORKSPACE_EVENT));
  }
  return <section id="film-workspace" className={styles.workspace} data-film-workspace={selected}>
    <nav className={styles.workspaceNav} aria-label="Film Room workspaces">
      <button type="button" aria-pressed={selected === "playbook"} aria-controls="film-playbook-workspace" onClick={() => choose("playbook")}>Chalkboard</button>
      <button type="button" aria-pressed={selected === "studies"} aria-controls="film-studies-workspace" onMouseEnter={prepareStudies} onFocus={prepareStudies} onTouchStart={prepareStudies} onClick={() => choose("studies")}>Game record</button>
    </nav>
    {/* Load the hidden notebook on first use; keep it mounted after that. */}
    <div id="film-playbook-workspace" hidden={selected !== "playbook"}><PlaybookLab /></div>
    <div id="film-studies-workspace" hidden={selected !== "studies"}>{studiesVisited ? <FilmRoom cases={cases} /> : null}</div>
  </section>;
}
