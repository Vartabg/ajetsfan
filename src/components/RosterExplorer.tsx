"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CoverageSnapshot, RosterPlayer } from "@/lib/coverage";
import { formatDate } from "@/lib/current";
import { filterRoster, playerHref, playerInitials, playerStatLines, playerStatsMessage, rosterFilters, statsForPlayer } from "@/lib/roster";
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
    ? <Image src={player.headshot} width={300} height={300} sizes={detailed ? "(max-width: 640px) 128px, 160px" : "(max-width: 360px) 48px, (max-width: 640px) 56px, 64px"} alt={alt} loading="lazy" onError={() => setFailed(true)} />
    : <span className={styles.initials} role={detailed ? "img" : undefined} aria-label={detailed ? `${player.name} initials` : undefined} aria-hidden={detailed ? undefined : true}>{playerInitials(player.name)}</span>}</div>;
}

export default function RosterExplorer({ roster, stats, editionSeason = roster.season, profileIds = [] }: {
  roster: CoverageSnapshot["roster"];
  stats: CoverageSnapshot["stats"];
  editionSeason?: number;
  profileIds?: string[];
}) {
  const params = useSearchParams();
  const filters = rosterFilters(new URLSearchParams(params.toString()));
  const players = filterRoster(roster.players, filters);
  const selected = roster.players.find((player) => player.id === params.get("player"));
  const positions = [...new Set(roster.players.map((player) => player.position))].sort();
  const statuses = [...new Map(roster.players.map((player) => [player.status, player.statusLabel])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const heading = useRef<HTMLHeadingElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const focusSelection = useRef(false);
  const returnToCard = useRef<string | null>(null);
  const copyRequest = useRef(0);
  const [copyResult, setCopyResult] = useState<{ playerId: string; message: string } | null>(null);
  const copyState = copyResult?.playerId === selected?.id ? copyResult?.message ?? "" : "";
  const activeFilters = filters.query !== "" || filters.unit !== "all" || filters.position !== "all" || filters.status !== "all";
  const playerStats = selected ? statsForPlayer(stats, selected.id, editionSeason) : undefined;
  const statLines = playerStatLines(playerStats);
  const statMessage = selected ? playerStatsMessage(stats, selected, editionSeason) : null;

  useEffect(() => {
    if (focusSelection.current && selected && heading.current) {
      heading.current.focus({ preventScroll: true });
      heading.current.closest("section")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      focusSelection.current = false;
    }
    if (!selected && returnToCard.current) {
      const target = document.getElementById(`roster-player-${returnToCard.current}`) ?? search.current;
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      returnToCard.current = null;
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
    copyRequest.current += 1;
    setCopyResult(null);
  }

  function selectPlayer(player: RosterPlayer) {
    if (player.id === selected?.id && heading.current) {
      heading.current.focus({ preventScroll: true });
      heading.current.closest("section")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
    }
    focusSelection.current = true;
    update({ player: player.id });
  }

  function closePlayer() {
    returnToCard.current = selected?.id ?? null;
    focusSelection.current = false;
    update({ player: null });
  }

  function clearSearch() {
    update({ q: null }, true);
    search.current?.focus({ preventScroll: true });
  }

  async function copyLink() {
    if (!selected) return;
    const playerId = selected.id;
    const request = ++copyRequest.current;
    const stillSelected = () => request === copyRequest.current && new URLSearchParams(window.location.search).get("player") === playerId;
    try {
      await navigator.clipboard.writeText(new URL(playerHref(playerId), window.location.origin).href);
      if (stillSelected()) setCopyResult({ playerId, message: "Player link copied." });
    } catch {
      if (stillSelected()) setCopyResult({ playerId, message: "Use the player permalink to share this selection." });
    }
  }

  return (
    <section className={styles.explorer} aria-label="Roster explorer">
      <FeedStatus feed={roster} label="Roster" />
      <div className={styles.unitTabs} role="group" aria-label="Roster unit">{UNITS.map((unit) => <button type="button" key={unit.value} aria-pressed={filters.unit === unit.value} className={filters.unit === unit.value ? styles.unitOn : ""} onClick={() => update({ unit: unit.value })}>{unit.label}<span>{unit.value === "all" ? roster.players.length : roster.players.filter((player) => player.group === unit.value).length}</span></button>)}</div>
      <div className={styles.filters}>
        <div className={styles.searchField}><label htmlFor="roster-search">Find a player</label><div className={styles.searchControl}><svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg><input id="roster-search" ref={search} type="search" placeholder="Name, jersey number or position" value={filters.query} onChange={(event) => update({ q: event.target.value }, true)} />{filters.query ? <button className={styles.clearSearch} type="button" aria-label="Clear search" onClick={clearSearch}><span aria-hidden="true">×</span></button> : null}</div></div>
        <div><label htmlFor="roster-position">Position</label><select id="roster-position" value={filters.position} onChange={(event) => update({ position: event.target.value })}><option value="all">All positions</option>{positions.map((position) => <option key={position} value={position}>{position}</option>)}</select></div>
        <div><label htmlFor="roster-status">Source roster status</label><select id="roster-status" value={filters.status} onChange={(event) => update({ status: event.target.value })}><option value="all">All statuses</option>{statuses.map(([status, label]) => <option key={status} value={status}>{label} ({status})</option>)}</select></div>
      </div>
      <div className={styles.results}><p aria-live="polite"><strong>{players.length}</strong> {players.length === 1 ? "player" : "players"} found</p>{activeFilters ? <button type="button" onClick={() => update({ q: null, unit: null, position: null, status: null, player: null })}>Reset filters</button> : null}</div>

      {params.get("player") && !selected ? <p className={styles.missing}>That player is not listed in this roster edition. Search the roster below.</p> : null}

      {selected ? <section id="roster-player-profile" className={styles.profile} aria-labelledby="selected-player-heading" onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); closePlayer(); } }}>
        <div className={styles.profileTop}><p>{roster.season} source roster{roster.week !== null ? ` · Week ${roster.week}` : ""}</p><button type="button" aria-label="Close player" onClick={closePlayer}>Close player <kbd aria-hidden="true">Esc</kbd><span aria-hidden="true">×</span></button></div>
        <div className={styles.profileGrid}>
          <div className={styles.profileIdentity}><Portrait key={`${selected.id}-${selected.headshot}`} player={selected} detailed /><div><p className={styles.playerKicker}>{selected.position}{selected.jersey !== null ? ` · #${selected.jersey}` : ""}</p><h2 id="selected-player-heading" ref={heading} tabIndex={-1}>{selected.name}</h2><p className={styles.status}>Source roster status: <strong>{selected.statusLabel}</strong> ({selected.status})</p></div></div>
          <div className={styles.profileInfo}><dl className={styles.bio}><div><dt>Height</dt><dd>{selected.height ?? "Not listed"}</dd></div><div><dt>Weight</dt><dd>{selected.weight !== null ? `${selected.weight} lb` : "Not listed"}</dd></div><div><dt>College</dt><dd>{selected.college ?? "Not listed"}</dd></div><div><dt>Experience</dt><dd>{selected.experience !== null ? `${selected.experience} ${selected.experience === 1 ? "year" : "years"}` : "Not listed"}</dd></div></dl>
            <div className={styles.statBlock}><h3>{editionSeason} regular-season stats</h3>{statLines.length ? <><dl className={styles.statLines}>{statLines.map((line) => <div key={line.label}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}</dl><p className={styles.statNote}>{statMessage?.scope}{stats.throughWeek !== null || stats.throughDate ? <> {stats.throughWeek !== null ? `Through Week ${stats.throughWeek}` : "Through the source cutoff"}{stats.throughDate ? ` (${formatDate(stats.throughDate)})` : ""}.</> : null}{stats.pendingGameIds.length ? ` ${stats.pendingGameIds.length} ${stats.pendingGameIds.length === 1 ? "result is" : "results are"} awaiting player statistics.` : ""}</p></> : <p className={styles.noStats}>{statMessage?.empty}</p>}<FeedStatus feed={stats} label="Selected player statistics" /></div>
          </div>
        </div>
        <div className={styles.profileLinks}>{profileIds.includes(selected.id) ? <a href={`/players/${encodeURIComponent(selected.id)}`}>Read the player page <span aria-hidden="true">↗</span></a> : null}{selected.profileUrl ? <a href={selected.profileUrl} target="_blank" rel="noreferrer">Player profile <span aria-hidden="true">↗</span></a> : null}{statLines.length ? <a href={stats.source} target="_blank" rel="noreferrer">Season stats source <span aria-hidden="true">↗</span></a> : null}<a href={playerHref(selected.id)}>Player permalink</a><button type="button" className={copyState === "Player link copied." ? styles.copied : ""} onClick={copyLink}>{copyState === "Player link copied." ? <>Link copied <span aria-hidden="true">✓</span></> : "Copy player link"}</button><button className={styles.backToRoster} type="button" onClick={closePlayer}>Back to roster <span aria-hidden="true">↓</span></button><span role="status" aria-label="Player link copy status">{copyState}</span></div>
      </section> : null}

      {!players.length ? <div className={styles.empty}><h2>No players match.</h2><p>Try another name, position, unit or roster status.</p>{activeFilters ? <button type="button" onClick={() => update({ q: null, unit: null, position: null, status: null, player: null })}>Reset filters</button> : <p>Roster records are unavailable in this edition.</p>}</div> : <ul className={styles.grid} aria-label="Roster players">{players.map((player) => <li key={player.id}><button id={`roster-player-${player.id}`} type="button" className={`${styles.playerCard} ${selected?.id === player.id ? styles.selectedCard : ""}`} aria-pressed={selected?.id === player.id} aria-expanded={selected?.id === player.id} aria-controls={selected ? "roster-player-profile" : undefined} aria-label={`View ${player.name}, ${player.position}${player.jersey !== null ? `, number ${player.jersey}` : ""}, roster status ${player.statusLabel}`} onClick={() => selectPlayer(player)}><div className={styles.cardPhoto}><Portrait key={`${player.id}-${player.headshot}`} player={player} /><span className={styles.jersey} aria-hidden="true">{player.jersey !== null ? `#${player.jersey}` : player.position}</span></div><div className={styles.cardText}><span className={styles.cardPosition}>{player.position} · {UNITS.find((unit) => unit.value === player.group)?.label}</span><strong>{player.name}</strong><span className={styles.cardStatus}>Roster: {player.statusLabel}</span><span className={styles.cardLink}>{selected?.id === player.id ? "Profile open" : "View player"} <span aria-hidden="true">{selected?.id === player.id ? "↑" : "↗"}</span></span></div></button></li>)}</ul>}
      <p className={styles.sourceNote}>Roster status describes the source roster listing, not availability for the next game.</p>
    </section>
  );
}
