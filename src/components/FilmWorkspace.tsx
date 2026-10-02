"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { FilmCase } from "@/lib/film-room";
import FilmRoom from "./FilmRoom";
import PlaybookLab from "./PlaybookLab";
import styles from "@/app/film-room/page.module.css";

const WORKSPACE_EVENT = "ajetsfan:film-workspace";
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
  useEffect(() => {
    const anchor = window.location.hash;
    if (anchor !== "#film-room" && anchor !== "#scouting-board") return;
    // The matching workspace becomes visible after hydration. Honor its old
    // section links once it is laid out, without jumping on workspace switches.
    const frame = requestAnimationFrame(() => document.getElementById(anchor.slice(1))?.scrollIntoView({ behavior: "instant", block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, []);
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
      <button type="button" aria-pressed={selected === "playbook"} aria-controls="film-playbook-workspace" onClick={() => choose("playbook")}>Playbook</button>
      <button type="button" aria-pressed={selected === "studies"} aria-controls="film-studies-workspace" onClick={() => choose("studies")}>Game studies</button>
    </nav>
    {/* Keep both mounted so switching workspaces preserves edits and selections. */}
    <div id="film-playbook-workspace" hidden={selected !== "playbook"}><PlaybookLab /></div>
    <div id="film-studies-workspace" hidden={selected !== "studies"}><FilmRoom cases={cases} /></div>
  </section>;
}
