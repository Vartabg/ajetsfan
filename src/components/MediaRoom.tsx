"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { formatMediaDate, type MediaItem, type MediaOutlet, type MediaSource } from "@/lib/media";
import { seasonReturn } from "@/lib/season-navigation";
import SeasonReturn from "./SeasonReturn";
import InlineMedia from "./InlineMedia";
import styles from "./MediaRoom.module.css";

const ROOM_EVENT = "ajetsfan:media-selection";
const ROOM_KEYS = ["media", "topic", "source", "type", "q", "season"];
const kinds: MediaItem["kind"][] = ["video", "post", "article", "audio"];
const kindLabels: Record<MediaItem["kind"], string> = { video: "Watch", post: "Posts", article: "Read", audio: "Listen" };
const kindNames: Record<MediaItem["kind"], string> = { video: "Video", post: "X post", article: "Article", audio: "Audio" };
const outletNames: Record<MediaOutlet["kind"], string> = { beat: "Beat reporting", tv: "Television", radio: "Sports radio", official: "Official team coverage", independent: "Independent coverage" };
const dateLabel = formatMediaDate;
const gridClass: Record<MediaItem["kind"], string> = { video: styles.watchGrid, post: styles.postGrid, article: styles.rowGrid, audio: `${styles.rowGrid} ${styles.audioGrid}` };
const cardSizes: Record<MediaItem["kind"], string> = { video: "(max-width: 699px) calc(100vw - 48px), (max-width: 1099px) 50vw, 33vw", post: "36px", article: "(max-width: 699px) 112px, 176px", audio: "(max-width: 699px) 72px, 100px" };

/** Current coverage newest first, then the archive newest first. */
const byRecency = (a: MediaItem, b: MediaItem) => Number(a.context === "archive") - Number(b.context === "archive")
  || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || a.id.localeCompare(b.id);

function Published({ item }: { item: MediaItem }) {
  return item.publishedAt && Number.isFinite(Date.parse(item.publishedAt))
    ? <time dateTime={item.publishedAt}>{dateLabel(item.publishedAt)}</time>
    : <span>Publication date unavailable</span>;
}

function subscribeLocation(notify: () => void) {
  window.addEventListener("popstate", notify);
  window.addEventListener(ROOM_EVENT, notify);
  return () => { window.removeEventListener("popstate", notify); window.removeEventListener(ROOM_EVENT, notify); };
}
const locationSnapshot = () => window.location.search;
const serverLocationSnapshot = () => "";

function writeSelection(patch: Record<string, string>, mode: "push" | "replace" = "push") {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(patch)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (url.href === window.location.href) return;
  window.history[mode === "push" ? "pushState" : "replaceState"](window.history.state, "", url);
  window.dispatchEvent(new Event(ROOM_EVENT));
}

const CLEAR = { media: "", type: "", q: "", source: "", season: "", topic: "" };

/** A format link that brings the matching collection into view. */
export function RoomLink({ type, className, children }: { type?: MediaItem["kind"]; className?: string; children: React.ReactNode }) {
  const patch = { ...CLEAR, ...(type ? { type } : {}) };
  const target = "media-results-heading";
  const query = new URLSearchParams(Object.entries(patch).filter(([, value]) => value)).toString();
  return <a className={className} href={`?${query}#${target}`} onClick={(event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    writeSelection(patch);
    // The room renders the selection on the next frame; then its heading takes focus and the view.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const heading = document.getElementById(target);
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: "center", behavior: "instant" });
    }));
  }}>{children}</a>;
}

function ExternalLink({ item, children, className }: { item: Pick<MediaItem, "url">; children: React.ReactNode; className?: string }) {
  return <a className={className} href={item.url} target="_blank" rel="noopener noreferrer">{children}<span aria-hidden="true"> ↗</span><span className="sr-only"> (opens in a new tab)</span></a>;
}

function Card({ item, outletName, selected, compared, full, onSelect, onClose, onCompare, children }: { item: MediaItem; outletName: string; selected: boolean; compared: boolean; full: boolean; onSelect: () => void; onClose: () => void; onCompare: () => void; children?: ReactNode }) {
  return <li className={`${styles.card} ${selected ? styles.activeStory : ""}`} data-media-card={item.id}>
    <InlineMedia item={item} outletName={outletName} selected={selected} onSelect={onSelect} onClose={onClose} triggerClassName={styles.storySelect} sizes={cardSizes[item.kind]} preview={item.kind !== "post"}>
      <span className={styles.storyText}>
        <span className={styles.cardMeta}>{outletName}{item.context === "archive" ? <span> · Archive</span> : null}</span>
        <strong>{item.title}</strong>
        {item.kind === "video" ? null : <span className={styles.cardSummary}>{item.summary}</span>}
      </span>
    </InlineMedia>
    {selected ? children : null}
    <div className={styles.cardFoot}><span className={styles.cardDate}><Published item={item} /></span><button type="button" className={styles.cardCompare} onClick={onCompare} aria-pressed={compared} disabled={full && !compared} aria-label={`${compared ? "Remove" : "Add"} ${item.title} ${compared ? "from" : "to"} comparison`} data-media-card-compare={item.id}><span>{compared ? "Added −" : "Compare +"}</span></button></div>
  </li>;
}

export default function MediaRoom({ items, outlets, checkedAt, sources, curatedCheckedAt }: { items: MediaItem[]; outlets: MediaOutlet[]; checkedAt: string; sources?: MediaSource[]; curatedCheckedAt?: string }) {
  const search = useSyncExternalStore(subscribeLocation, locationSnapshot, serverLocationSnapshot);
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const topicList = useMemo(() => [...new Set(items.flatMap((item) => item.topics))].sort((a, b) => a.localeCompare(b)), [items]);
  const seasonList = useMemo(() => [...new Set(items.flatMap((item) => item.seasons ?? []))].sort((a, b) => b - a), [items]);
  const season = (params.get("season") ?? "").slice(0, 16);
  const topic = topicList.includes(params.get("topic") ?? "") ? params.get("topic")! : "";
  const source = outlets.some((outlet) => outlet.id === params.get("source")) ? params.get("source")! : "";
  const type = kinds.includes(params.get("type") as MediaItem["kind"]) ? params.get("type")! : "";
  const query = (params.get("q") ?? "").slice(0, 160);
  const filterKey = `${season}\n${topic}\n${source}\n${type}\n${query}`;
  const [expanded, setExpanded] = useState<{ filters: string; counts: Partial<Record<MediaItem["kind"], number>> }>({ filters: "", counts: {} });
  const outletById = useMemo(() => new Map(outlets.map((outlet) => [outlet.id, outlet])), [outlets]);
  const filtered = useMemo(() => items.filter((item) => (!topic || item.topics.includes(topic)) && (!source || item.outletId === source) && (!type || item.kind === type) && (!season || item.seasons?.some((year) => String(year) === season)) && (!query || `${item.title} ${item.summary} ${item.author} ${outletById.get(item.outletId)?.name ?? ""} ${item.topics.join(" ")}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))), [items, topic, source, type, season, query, outletById]);
  const selected = filtered.find((item) => item.id === params.get("media"));
  const [compared, setCompared] = useState<string[]>([]);
  const comparison = compared.flatMap((id) => { const item = items.find((candidate) => candidate.id === id); return item ? [item] : []; });
  const [share, setShare] = useState<{ search: string; message: string; url?: string } | null>(null);
  const copyRequest = useRef(0);
  const groups = kinds.map((kind) => ({ kind, entries: filtered.filter((item) => item.kind === kind).sort(byRecency) })).filter(({ entries }) => entries.length);
  const shown = (kind: MediaItem["kind"]) => {
    const limit = expanded.filters === filterKey ? expanded.counts[kind] ?? 8 : 8;
    const selectedIndex = filtered.filter((item) => item.kind === kind).sort(byRecency).findIndex((item) => item.id === params.get("media"));
    return Math.max(limit, selectedIndex + 1);
  };
  const visibleOutlets = outlets.map((outlet) => ({ outlet, count: filtered.filter((item) => item.outletId === outlet.id).length })).filter(({ count }) => count > 0);
  const largestCount = Math.max(1, ...visibleOutlets.map(({ count }) => count));
  const dated = items.filter((item) => item.publishedAt && Number.isFinite(Date.parse(item.publishedAt))).map((item) => item.publishedAt!).sort((a, b) => Date.parse(a) - Date.parse(b));
  const usedOutlets = new Set(items.map((item) => item.outletId)).size;
  const activeFilters = !!(topic || source || type || season || query);
  const advancedFilters = [source, season, topic].filter(Boolean).length;
  const seasonDestination = seasonReturn(params.get("from"));

  // The room sits below the page's opening moments: a link that arrives with a story selected opens at that story.
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current || !search) return;
    arrived.current = true;
    if (!new URLSearchParams(search).get("media")) return;
    const hash = window.location.hash.slice(1);
    if (hash && hash !== "media-viewer-heading" && hash !== "media-selected-coverage" && document.getElementById(hash)) return;
    const id = new URLSearchParams(search).get("media");
    const card = id ? document.querySelector<HTMLElement>(`[data-media-card="${CSS.escape(id)}"]`) : null;
    card?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [search]);
  useEffect(() => {
    const invalidate = () => { copyRequest.current += 1; };
    window.addEventListener("popstate", invalidate);
    window.addEventListener(ROOM_EVENT, invalidate);
    return () => {
      copyRequest.current += 1;
      window.removeEventListener("popstate", invalidate);
      window.removeEventListener(ROOM_EVENT, invalidate);
    };
  }, []);

  function chooseFilter(patch: Record<string, string>, mode: "push" | "replace" = "push") { writeSelection({ media: "", ...patch }, mode); }
  function resetFilters() { writeSelection(Object.fromEntries(ROOM_KEYS.map((key) => [key, ""]))); }
  function viewSelection(id: string) {
    arrived.current = true;
    writeSelection({ media: id });
  }
  function backToResults() {
    const group = groups.find(({ entries }) => entries.some((item) => item.id === selected?.id));
    if (group) {
      const required = group.entries.findIndex((item) => item.id === selected?.id) + 1;
      setExpanded({ filters: filterKey, counts: { ...(expanded.filters === filterKey ? expanded.counts : {}), [group.kind]: Math.max(shown(group.kind), Math.ceil(required / 8) * 8) } });
    }
    writeSelection({ media: "" });
  }
  function followTopic(topic: string) {
    chooseFilter({ topic });
    window.requestAnimationFrame(() => {
      const heading = document.getElementById("media-results-heading");
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: "center", behavior: "instant" });
    });
  }
  function compare(item: MediaItem) {
    setCompared((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : ids.length < 2 ? [...ids, item.id] : ids);
  }
  async function copyLink() {
    const request = ++copyRequest.current;
    const requestedLocation = window.location.href;
    const url = new URL(requestedLocation);
    if (selected) url.searchParams.set("media", selected.id);
    try {
      await navigator.clipboard.writeText(url.href);
      if (copyRequest.current !== request || window.location.href !== requestedLocation) return;
      setShare({ search, message: "Link copied. Your selection and filters are included." });
    } catch {
      if (copyRequest.current !== request || window.location.href !== requestedLocation) return;
      setShare({ search, message: "Copy this link to share your selection.", url: url.href });
    }
  }

  return <section id="media-room" className={styles.room} aria-labelledby="media-room-heading" data-media-room data-media-selected={selected?.id ?? ""}>
    <header className={styles.masthead}>
      <h2 id="media-room-heading" className="sr-only">Browse Jets coverage</h2>
      <span className={styles.collectionCount}>{items.length} selected stories · {usedOutlets} outlets</span>
      {seasonDestination ? <SeasonReturn className={styles.seasonBack} /> : null}
    </header>
    <div className={styles.filters} data-media-filters>
      <div className={styles.typeFilters} role="group" aria-label="Coverage format"><button type="button" aria-pressed={!type} onClick={() => chooseFilter({ type: "" })}>Everything <span>{items.length}</span></button>{kinds.map((kind) => <button type="button" key={kind} aria-pressed={type === kind} onClick={() => chooseFilter({ type: type === kind ? "" : kind })} data-media-type={kind}>{kindLabels[kind]} <span>{items.filter((item) => item.kind === kind).length}</span></button>)}</div>
      <label className={styles.search}><span className="sr-only">Search Jets media</span><span aria-hidden="true">⌕</span><input type="search" value={query} maxLength={160} onChange={(event) => chooseFilter({ q: event.target.value }, "replace")} placeholder="Player, reporter, story…" data-media-search /></label>
    </div>
    <details className={styles.moreFilters} data-media-more-filters>
      <summary>More filters<span>{advancedFilters ? `${advancedFilters} applied` : 'Source · season · topic'}</span></summary>
      <div className={styles.extraFilters}>
        <label className={styles.sourceSelect}>Source<select value={source} onChange={(event) => chooseFilter({ source: event.target.value })} data-media-source><option value="">All sources</option>{outlets.filter((outlet) => items.some((item) => item.outletId === outlet.id)).map((outlet) => <option value={outlet.id} key={outlet.id}>{outlet.name}</option>)}</select></label>
        <label className={styles.seasonSelect}>Football season<select value={season} onChange={(event) => chooseFilter({ season: event.target.value })} data-media-season><option value="">Every season</option>{season && !seasonList.some((year) => String(year) === season) ? <option value={season}>Season {season} unavailable</option> : null}{seasonList.map((year) => <option key={year} value={year}>{year} season</option>)}</select></label>
      </div>
      <div className={styles.topicStrip} role="group" aria-label="Coverage topics"><span className={styles.topicLabel}>Topics</span><button type="button" aria-pressed={!topic} onClick={() => chooseFilter({ topic: "" })}>All topics</button>{topicList.map((tag) => <button type="button" key={tag} aria-pressed={topic === tag} onClick={() => chooseFilter({ topic: topic === tag ? "" : tag })} data-media-topic={tag}>{tag}<span>{items.filter((item) => item.topics.includes(tag)).length}</span></button>)}</div>
    </details>

    {comparison.length ? <section className={styles.comparison} aria-labelledby="media-compare-heading" data-media-comparison><header><h3 id="media-compare-heading">Compare coverage<span>{comparison.length} of 2</span></h3><button type="button" onClick={() => setCompared([])}>Clear comparison <span aria-hidden="true">×</span></button></header><div className={styles.compareGrid}>{comparison.map((item) => <article key={item.id} data-media-compared={item.id}><p className={styles.itemMeta}><span>{outletById.get(item.outletId)?.name ?? item.author}</span><span>{kindNames[item.kind]}</span></p><h4>{item.title}</h4><p className={styles.byline}>{item.author} · <Published item={item} /></p><p>{item.summary}</p><div className={styles.compareTags}>{item.topics.map((tag) => <span key={tag} data-shared-topic={comparison.length === 2 && comparison.every((entry) => entry.topics.includes(tag)) ? "true" : "false"}>{tag}</span>)}</div><div className={styles.compareActions}><ExternalLink item={item}>Open original</ExternalLink><button type="button" onClick={() => compare(item)} aria-label={`Remove ${item.title} from comparison`}>Remove <span aria-hidden="true">×</span></button></div></article>)}{comparison.length === 1 ? <p className={styles.compareEmpty}>Select another story and add it to comparison to read the two summaries, dates and topics side by side.</p> : null}</div>{comparison.length === 2 ? <details className={styles.compareNote}><summary>Comparison guide</summary><p>Highlighted tags occur in both items. Matching topics are not proof that the reporting agrees.</p></details> : null}</section> : null}

    <div className={styles.collectionHeader}><h3 id="media-results-heading" tabIndex={-1}>{topic || (source ? outletById.get(source)?.name : season ? `${season} coverage` : "Browse coverage")}</h3><div className={styles.resultSummary}><p role="status" data-media-results>{filtered.length} {filtered.length === 1 ? "item" : "items"}{activeFilters ? " match your filters" : " in the collection"}</p>{activeFilters ? <button type="button" onClick={resetFilters} data-media-reset>Clear filters <span aria-hidden="true">×</span></button> : null}</div></div>
    {filtered.length ? <div>
      {groups.map(({ kind, entries }) => <section key={kind} className={styles.group} aria-labelledby={`media-group-${kind}`} data-media-group={kind}>
        <h4 id={`media-group-${kind}`} className={styles.groupHead}>{kindLabels[kind]}<span>{entries.length}</span></h4>
        <ul className={`${styles.cards} ${gridClass[kind]}`} aria-labelledby={`media-group-${kind}`}>{entries.slice(0, shown(kind)).map((item) => <Card key={item.id} item={item} outletName={outletById.get(item.outletId)?.name ?? item.author} selected={item.id === selected?.id} compared={compared.includes(item.id)} full={compared.length === 2} onSelect={() => viewSelection(item.id)} onClose={backToResults} onCompare={() => compare(item)}>{selected?.id === item.id ? (      <article className={styles.context} data-media-context={selected.id}>
        <p className={styles.itemMeta}><span>{outletById.get(selected.outletId)?.name ?? selected.author}</span><span>{kindNames[selected.kind]}</span></p>
        <h3 id={`media-viewer-heading-${selected.id}`} tabIndex={-1}>{selected.title}</h3>
        <p className={styles.byline}>{selected.author} · Published <Published item={selected} /></p>
        <p className={styles.seasonContext}>{selected.seasons?.length ? `Football season: ${selected.seasons.join(" / ")}` : "Football season not established by this source"}</p>
        <p className={styles.selectedSummary}>{selected.summary}</p>
        <div className={styles.contextActions}><button type="button" onClick={() => compare(selected)} disabled={compared.length === 2 && !compared.includes(selected.id)} aria-pressed={compared.includes(selected.id)} data-media-compare={selected.id}>{compared.includes(selected.id) ? "Remove from comparison" : "Add to comparison"}<span aria-hidden="true"> {compared.includes(selected.id) ? "−" : "+"}</span></button><button type="button" onClick={copyLink} data-media-share>Copy selection link <span aria-hidden="true">↗</span></button></div>
        {share?.search === search ? <div className={styles.shareStatus}><p role="status">{share.message}</p>{share.url ? <label>Selection link<input readOnly value={share.url} onFocus={(event) => event.currentTarget.select()} /></label> : null}</div> : null}
        <details className={styles.storyDetails}><summary>Related topics</summary><div className={styles.selectedTopics}>{selected.topics.map((tag) => <button type="button" key={tag} onClick={() => followTopic(tag)}>{tag}<span aria-hidden="true"> ↗</span></button>)}</div></details>
      </article>) : null}</Card>)}</ul>
        {entries.length > shown(kind) ? <button type="button" className={styles.moreStories} data-media-more={kind} onClick={() => setExpanded({ filters: filterKey, counts: { ...(expanded.filters === filterKey ? expanded.counts : {}), [kind]: shown(kind) + 8 } })}>Show more {kindLabels[kind].toLowerCase()} stories <span>({entries.length - shown(kind)} remaining)</span></button> : null}
      </section>)}
      <details className={styles.coverageDisclosure} data-media-source-bars><summary>Explore by source<span>{visibleOutlets.length} outlets</span></summary>
        <aside className={styles.coverageMap} aria-labelledby="coverage-map-heading" data-media-coverage><h4 id="coverage-map-heading">Stories by source</h4><div className={styles.coverageBars}>{visibleOutlets.map(({ outlet, count }) => <button type="button" key={outlet.id} aria-pressed={source === outlet.id} onClick={() => chooseFilter({ source: source === outlet.id ? "" : outlet.id })} data-media-coverage-source={outlet.id} style={{ "--coverage-width": `${count / largestCount * 100}%` } as CSSProperties}><span>{outlet.name}<strong>{count}</strong></span><i aria-hidden="true" /></button>)}</div><p className={styles.coverageNote}>Counts reflect this collection. They do not measure audience, activity or reporting quality.</p></aside>
      </details>
    </div> : <div className={styles.empty} data-media-empty><span aria-hidden="true">∅</span><h3>No coverage matches.</h3><p>{season ? `No selected stories for the ${season} football season with these filters.` : "Try another topic, source or search term."}</p><button type="button" onClick={resetFilters}>Reset the collection <span aria-hidden="true">↗</span></button></div>}

    <details className={styles.sourceLedger} data-media-source-ledger><summary><span>The source directory</span><span>{usedOutlets} outlets <span aria-hidden="true">+</span></span></summary><p>Publisher feeds refresh automatically alongside the selected archive. Feeds last checked {dateLabel(checkedAt)}.{curatedCheckedAt ? ` Archive selections reviewed ${dateLabel(curatedCheckedAt)}.` : ""} Social posts remain dated archive selections.</p><div data-media-feed-status><ul>{sources?.map((source) => <li key={source.id}><strong>{source.name}</strong><p>{source.status === "ready" ? "Checked" : source.status === "retained" ? "Keeping the last available feed" : "Feed unavailable"}{source.checkedAt ? ` · ${dateLabel(source.checkedAt)}` : ""}</p></li>)}</ul></div><p>{dated.length ? `Published ${dateLabel(dated[0])} – ${dateLabel(dated.at(-1)!)}` : "Dates shown when available"}. Tags describe subjects; they do not establish agreement or verify claims. Inclusion is attribution, not endorsement.</p><ul>{outlets.filter((outlet) => items.some((item) => item.outletId === outlet.id)).map((outlet) => <li key={outlet.id}><span>{outletNames[outlet.kind]}</span><ExternalLink item={outlet}><strong>{outlet.name}</strong></ExternalLink><p>{outlet.people.join(" · ") || "Publisher editorial team"}</p></li>)}</ul></details>
  </section>;
}
