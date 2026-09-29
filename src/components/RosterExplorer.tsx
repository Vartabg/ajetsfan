"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CoverageSnapshot, RosterPlayer } from "@/lib/coverage";
import { formatDate } from "@/lib/current";
import { filterRoster, playerHref, playerInitials, playerStatLines, rosterFilters, statsForPlayer } from "@/lib/roster";
import FeedStatus from "./FeedStatus";
import styles from "./RosterExplorer.module.css";

const UNITS = [
  { value: "all", label: "Everyone" },
  { value: "offense", label: "Offense" },
  { value: "defense", label: "Defense" },
  { value: "special", label: "Special teams" },
  { value: "other", label: "Other" },
] as const;

function Portrait({ player, detailed = false }: { player: RosterPlayer; detailed?: boolean }) {
  const [failed, setFailed] = useState(false);
  const alt = detailed ? `${player.name} headshot` : "";
  return <div className={styles.portrait}>{player.headshot && !failed
    ? <Image src={player.headshot} width={300} height={300} sizes={detailed ? "(max-width: 640px) 160px, 220px" : "(max-width: 360px) 250px, (max-width: 640px) 160px, 220px"} alt={alt} loading="lazy" onError={() => setFailed(true)} />
    : <span className={styles.initials} role={detailed ? "img" : undefined} aria-label={detailed ? `${player.name} initials` : undefined} aria-hidden={detailed ? undefined : true}>{playerInitials(player.name)}</span>}</div>;
}

export default function RosterExplorer({ roster, stats, editionSeason = roster.season }: {
  roster: CoverageSnapshot["roster"];
  stats: CoverageSnapshot["stats"];
  editionSeason?: number;
}) {
  const params = useSearchParams();
  const filters = rosterFilters(new URLSearchParams(params.toString()));
  const players = filterRoster(roster.players, filters);
  const selected = roster.players.find((player) => player.id === params.get("player"));
  const positions = [...new Set(roster.players.map((player) => player.position))].sort();
  const statuses = [...new Map(roster.players.map((player) => [player.status, player.statusLabel])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const heading = useRef<HTMLHeadingElement>(null);
  const focusSelection = useRef(false);
  const [copyState, setCopyState] = useState("");
  const activeFilters = filters.query !== "" || filters.unit !== "all" || filters.position !== "all" || filters.status !== "all";
  const playerStats = selected ? statsForPlayer(stats, selected.id, editionSeason) : undefined;
  const statLines = playerStatLines(playerStats);

  useEffect(() => {
    if (focusSelection.current && selected && heading.current) {
      heading.current.focus({ preventScroll: true });
      heading.current.closest("section")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      focusSelection.current = false;
    }
  }, [selected]);

  function update(changes: Record<string, string | null>, replace = false) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value && value !== "all") next.set(key, value);
      else next.delete(key);
    }
    const id = next.get("player");
    if (id && !filterRoster(roster.players, rosterFilters(next)).some((player) => player.id === id)) next.delete("player");
    const query = next.toString();
    window.history[replace ? "replaceState" : "pushState"](null, "", `/team${query ? `?${query}` : ""}`);
    setCopyState("");
  }

  function selectPlayer(player: RosterPlayer) {
    if (player.id === selected?.id && heading.current) {
      heading.current.focus();
      return;
    }
    focusSelection.current = true;
    update({ player: player.id });
  }

  function closePlayer() {
    const id = selected?.id;
    update({ player: null });
    if (id) document.getElementById(`roster-player-${id}`)?.focus();
  }

  async function copyLink() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(new URL(playerHref(selected.id), window.location.origin).href);
      setCopyState("Player link copied.");
    } catch {
      setCopyState("Use the player permalink to share this selection.");
    }
  }

  return (
    <section className={styles.explorer} aria-label="Roster explorer">
      <FeedStatus feed={roster} label="Roster" />
      <div className={styles.unitTabs} role="group" aria-label="Roster unit">{UNITS.map((unit) => <button type="button" key={unit.value} aria-pressed={filters.unit === unit.value} className={filters.unit === unit.value ? styles.unitOn : ""} onClick={() => update({ unit: unit.value })}>{unit.label}<span>{unit.value === "all" ? roster.players.length : roster.players.filter((player) => player.group === unit.value).length}</span></button>)}</div>
      <div className={styles.filters}>
        <div className={styles.searchField}><label htmlFor="roster-search">Find a player</label><input id="roster-search" type="search" placeholder="Name, jersey number or position" value={filters.query} onChange={(event) => update({ q: event.target.value }, true)} /></div>
        <div><label htmlFor="roster-position">Position</label><select id="roster-position" value={filters.position} onChange={(event) => update({ position: event.target.value })}><option value="all">All positions</option>{positions.map((position) => <option key={position} value={position}>{position}</option>)}</select></div>
        <div><label htmlFor="roster-status">Source roster status</label><select id="roster-status" value={filters.status} onChange={(event) => update({ status: event.target.value })}><option value="all">All statuses</option>{statuses.map(([status, label]) => <option key={status} value={status}>{label} ({status})</option>)}</select></div>
      </div>
      <div className={styles.results}><p aria-live="polite"><strong>{players.length}</strong> {players.length === 1 ? "player" : "players"} found</p>{activeFilters ? <button type="button" onClick={() => update({ q: null, unit: null, position: null, status: null, player: null })}>Reset filters</button> : null}</div>

      {params.get("player") && !selected ? <p className={styles.missing}>That player is not listed in this roster edition. Search the roster below.</p> : null}

      {selected ? <section className={styles.profile} aria-labelledby="selected-player-heading">
        <div className={styles.profileTop}><p>{roster.season} source roster{roster.week !== null ? ` · Week ${roster.week}` : ""}</p><button type="button" onClick={closePlayer}>Close player <span aria-hidden="true">×</span></button></div>
        <div className={styles.profileGrid}>
          <div className={styles.profileIdentity}><Portrait key={`${selected.id}-${selected.headshot}`} player={selected} detailed /><div><p className={styles.playerKicker}>{selected.position}{selected.jersey !== null ? ` · #${selected.jersey}` : ""}</p><h2 id="selected-player-heading" ref={heading} tabIndex={-1}>{selected.name}</h2><p className={styles.status}>Source roster status: <strong>{selected.statusLabel}</strong> ({selected.status})</p></div></div>
          <div className={styles.profileInfo}><dl className={styles.bio}><div><dt>Height</dt><dd>{selected.height ?? "Not listed"}</dd></div><div><dt>Weight</dt><dd>{selected.weight !== null ? `${selected.weight} lb` : "Not listed"}</dd></div><div><dt>College</dt><dd>{selected.college ?? "Not listed"}</dd></div><div><dt>Experience</dt><dd>{selected.experience !== null ? `${selected.experience} ${selected.experience === 1 ? "year" : "years"}` : "Not listed"}</dd></div></dl>
            <div className={styles.statBlock}><h3>{editionSeason} regular-season stats</h3>{statLines.length ? <><dl className={styles.statLines}>{statLines.map((line) => <div key={line.label}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}</dl><p className={styles.statNote}>Passing, rushing and receiving totals{stats.throughWeek !== null ? ` · through Week ${stats.throughWeek}` : ""}{stats.throughDate ? ` (${formatDate(stats.throughDate)})` : ""}.{stats.pendingGameIds.length ? ` ${stats.pendingGameIds.length} ${stats.pendingGameIds.length === 1 ? "result is" : "results are"} awaiting player statistics.` : ""}</p><FeedStatus feed={stats} label="Selected player statistics" /></> : <p className={styles.noStats}>No recorded regular-season stats in this edition.</p>}</div>
          </div>
        </div>
        <div className={styles.profileLinks}>{selected.profileUrl ? <a href={selected.profileUrl} target="_blank" rel="noreferrer">Player profile <span aria-hidden="true">↗</span></a> : null}{statLines.length ? <a href={stats.source} target="_blank" rel="noreferrer">Season stats source <span aria-hidden="true">↗</span></a> : null}<a href={playerHref(selected.id)}>Player permalink</a><button type="button" onClick={copyLink}>Copy player link</button><span role="status">{copyState}</span></div>
      </section> : null}

      {!players.length ? <div className={styles.empty}><h2>No players match.</h2><p>Try another name, position, unit or roster status.</p>{activeFilters ? <button type="button" onClick={() => update({ q: null, unit: null, position: null, status: null, player: null })}>Reset filters</button> : <p>Roster records are unavailable in this edition.</p>}</div> : <ul className={styles.grid} aria-label="Roster players">{players.map((player) => <li key={player.id}><button id={`roster-player-${player.id}`} type="button" className={`${styles.playerCard} ${selected?.id === player.id ? styles.selectedCard : ""}`} aria-pressed={selected?.id === player.id} aria-label={`View ${player.name}, ${player.position}${player.jersey !== null ? `, number ${player.jersey}` : ""}, roster status ${player.statusLabel}`} onClick={() => selectPlayer(player)}><div className={styles.cardPhoto}><Portrait key={`${player.id}-${player.headshot}`} player={player} /><span className={styles.jersey} aria-hidden="true">{player.jersey !== null ? `#${player.jersey}` : player.position}</span></div><div className={styles.cardText}><span className={styles.cardPosition}>{player.position} · {UNITS.find((unit) => unit.value === player.group)?.label}</span><strong>{player.name}</strong><span className={styles.cardStatus}>Roster: {player.statusLabel}</span><span className={styles.cardLink}>View player <span aria-hidden="true">↗</span></span></div></button></li>)}</ul>}
      <p className={styles.sourceNote}>Roster status describes the source roster listing, not availability for the next game.</p>
    </section>
  );
}
