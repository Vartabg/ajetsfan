"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { formatMediaDate, type MediaItem, type MediaOutlet } from "@/lib/media";
import styles from "./MediaRoom.module.css";

const ROOM_EVENT = "ajetsfan:media-selection";
const ROOM_KEYS = ["media", "topic", "source", "type", "q", "season"];
const kinds: MediaItem["kind"][] = ["video", "post", "article", "audio"];
const kindLabels: Record<MediaItem["kind"], string> = { video: "Watch", post: "Posts", article: "Read", audio: "Listen" };
const kindNames: Record<MediaItem["kind"], string> = { video: "Video", post: "X post", article: "Article", audio: "Audio" };
const outletNames: Record<MediaOutlet["kind"], string> = { beat: "Beat reporting", tv: "Television", radio: "Sports radio", official: "Official team coverage", independent: "Independent coverage" };
const dateLabel = formatMediaDate;

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

function ExternalLink({ item, children, className }: { item: Pick<MediaItem, "url">; children: React.ReactNode; className?: string }) {
  return <a className={className} href={item.url} target="_blank" rel="noopener noreferrer">{children}<span aria-hidden="true"> ↗</span><span className="sr-only"> (opens in a new tab)</span></a>;
}

function Thumbnail({ item, small = false }: { item: MediaItem; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  const youtubeId = item.youtubeId && /^[A-Za-z0-9_-]{11}$/.test(item.youtubeId) ? item.youtubeId : null;
  return <div className={`${styles.thumbnail} ${small ? styles.smallThumbnail : ""}`} data-media-thumbnail={item.id}>
    {youtubeId && !failed ? <Image src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`} alt={`Publisher video thumbnail for ${item.title}`} fill sizes={small ? "(max-width: 720px) 90vw, 30vw" : "(max-width: 900px) 90vw, 65vw"} onError={() => setFailed(true)} />
      : <div className={styles.typeArtwork} aria-hidden="true"><span>{kindNames[item.kind]}</span><strong>{item.kind === "post" ? "X" : item.kind === "audio" ? ")))" : item.kind === "article" ? "Aa" : "▶"}</strong><i>{item.topics.slice(0, 2).join(" / ")}</i></div>}
    <div className={styles.thumbnailShade} aria-hidden="true" />
    <span className={styles.thumbnailKind}>{kindNames[item.kind]}</span>
    {youtubeId && !failed && !small ? <span className={styles.thumbnailCredit}>Original publisher thumbnail</span> : null}
  </div>;
}

type XWidgets = { createTweet: (id: string, element: HTMLElement, options: Record<string, string | boolean>) => Promise<HTMLElement | undefined> };
type XWindow = Window & { twttr?: { widgets?: XWidgets; ready?: (callback: (api: { widgets: XWidgets }) => void) => void } };
let xSdkPromise: Promise<XWidgets> | null = null;

// X's official widgets factory renders the publisher's post; no copied post text
// or guessed iframe URLs. This loader is called only after the reader asks.
function loadXWidgets(): Promise<XWidgets> {
  const available = (window as XWindow).twttr?.widgets;
  if (available?.createTweet) return Promise.resolve(available);
  if (xSdkPromise) return xSdkPromise;
  xSdkPromise = new Promise<XWidgets>((resolve, reject) => {
    let settled = false;
    const existing = document.getElementById("media-room-x-sdk") as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    const done = (widgets?: XWidgets) => {
      if (settled) return;
      if (!widgets?.createTweet) return;
      settled = true;
      window.clearTimeout(timer);
      script.removeEventListener("load", ready);
      script.removeEventListener("error", fail);
      resolve(widgets);
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.removeEventListener("load", ready);
      script.removeEventListener("error", fail);
      script.remove();
      reject(new Error("X embed unavailable"));
    };
    const ready = () => {
      const api = (window as XWindow).twttr;
      if (api?.widgets?.createTweet) done(api.widgets);
      else api?.ready?.((loaded) => done(loaded.widgets));
    };
    const timer = window.setTimeout(fail, 12000);
    script.addEventListener("load", ready);
    script.addEventListener("error", fail);
    if (!existing) {
      script.id = "media-room-x-sdk";
      script.src = "https://platform.twitter.com/widgets.js";
      script.async = true;
      document.head.appendChild(script);
    } else ready();
  }).catch((error: unknown) => { xSdkPromise = null; throw error; });
  return xSdkPromise;
}

function XPost({ item }: { item: MediaItem }) {
  const mount = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    const host = mount.current;
    if (!host || !item.tweetId) return;
    const target = document.createElement("div");
    host.appendChild(target);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      cancelled = true;
      target.remove();
      setStatus("failed");
    }, 16000);
    void loadXWidgets().then((widgets) => {
      if (cancelled) return undefined;
      return widgets.createTweet(item.tweetId!, target, { theme: "dark", dnt: true, conversation: "none", align: "center" });
    }).then((element) => {
      if (cancelled) return;
      window.clearTimeout(timer);
      if (element) setStatus("ready");
      else { target.remove(); setStatus("failed"); }
    }).catch(() => {
      if (cancelled) return;
      window.clearTimeout(timer);
      target.remove();
      setStatus("failed");
    });
    return () => { cancelled = true; window.clearTimeout(timer); target.remove(); };
  }, [item.tweetId]);
  return <div className={styles.xPost} data-media-x-status={status}>
    {status !== "ready" ? <p role="status">{status === "loading" ? "Loading the original post from X…" : "X could not display this post. Read the original at its source below."}</p> : null}
    <div ref={mount} className={styles.xMount} />
  </div>;
}

function Viewer({ item, outlet }: { item: MediaItem; outlet?: MediaOutlet }) {
  const [requested, setRequested] = useState(false);
  const [retry, setRetry] = useState(0);
  const youtube = item.kind === "video" && item.embedAllowed === true && !!item.youtubeId && /^[A-Za-z0-9_-]{11}$/.test(item.youtubeId);
  const post = item.kind === "post" && !!item.tweetId && /^\d{10,25}$/.test(item.tweetId);
  const embeddable = youtube || post;
  return <div className={styles.viewer} data-media-viewer={item.id} data-embed-requested={requested ? "true" : "false"}>
    <div className={styles.viewerLabel}><span><i aria-hidden="true" />Selected coverage</span><span>{item.context === "archive" ? "From the archive" : "Current collection"}</span></div>
    {requested && youtube ? <div className={styles.videoFrame}><iframe src={`https://www.youtube-nocookie.com/embed/${item.youtubeId}?rel=0&playsinline=1`} title={`${item.title} — ${outlet?.name ?? item.author}`} allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" data-media-youtube={item.youtubeId} /></div>
      : requested && post ? <XPost key={`${item.id}:${retry}`} item={item} />
        : <div className={styles.viewerPoster}><Thumbnail key={item.id} item={item} />{embeddable ? <button className={styles.loadButton} type="button" data-media-load={item.id} onClick={() => setRequested(true)}><span className={styles.loadSymbol} aria-hidden="true">{post ? "X" : "▶"}</span><span>{post ? "Load original X post" : "Load video player"}<small>{post ? "From the publisher’s account" : "YouTube · playback starts when you choose"}</small></span></button> : <div className={styles.sourceOnly}><span>At the source</span><strong>{item.kind === "audio" ? "Hear the conversation." : item.kind === "article" ? "Go beyond the headline." : "See the original coverage."}</strong></div>}</div>}
    <div className={styles.viewerActions}><ExternalLink item={item} className={styles.sourceButton}>Open original {item.kind === "post" ? "post" : item.kind === "audio" ? "audio" : item.kind === "video" ? "video" : "article"}</ExternalLink>{requested ? <button type="button" onClick={() => { setRequested(false); setRetry((value) => value + 1); }}>Close embed</button> : null}</div>
    <p className={styles.embedNote}>{embeddable ? "The player or post connects to its provider only when loaded. Availability is controlled by the publisher; the original source stays accessible." : "This item opens at its publisher. No embedded playback is available here."}</p>
  </div>;
}

export default function MediaRoom({ items, outlets, checkedAt }: { items: MediaItem[]; outlets: MediaOutlet[]; checkedAt: string }) {
  const search = useSyncExternalStore(subscribeLocation, locationSnapshot, serverLocationSnapshot);
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const topicList = useMemo(() => [...new Set(items.flatMap((item) => item.topics))].sort((a, b) => a.localeCompare(b)), [items]);
  const seasonList = useMemo(() => [...new Set(items.flatMap((item) => item.seasons ?? []))].sort((a, b) => b - a), [items]);
  const season = (params.get("season") ?? "").slice(0, 16);
  const topic = topicList.includes(params.get("topic") ?? "") ? params.get("topic")! : "";
  const source = outlets.some((outlet) => outlet.id === params.get("source")) ? params.get("source")! : "";
  const type = kinds.includes(params.get("type") as MediaItem["kind"]) ? params.get("type")! : "";
  const query = (params.get("q") ?? "").slice(0, 160);
  const outletById = useMemo(() => new Map(outlets.map((outlet) => [outlet.id, outlet])), [outlets]);
  const filtered = useMemo(() => items.filter((item) => (!topic || item.topics.includes(topic)) && (!source || item.outletId === source) && (!type || item.kind === type) && (!season || item.seasons?.some((year) => String(year) === season)) && (!query || `${item.title} ${item.summary} ${item.author} ${outletById.get(item.outletId)?.name ?? ""} ${item.topics.join(" ")}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))), [items, topic, source, type, season, query, outletById]);
  const selected = filtered.find((item) => item.id === params.get("media"))
    ?? filtered.find((item) => item.context === "current" && item.youtubeId && item.embedAllowed === true)
    ?? filtered[0];
  const selectedOutlet = selected ? outletById.get(selected.outletId) : undefined;
  const [compared, setCompared] = useState<string[]>([]);
  const comparison = compared.flatMap((id) => { const item = items.find((candidate) => candidate.id === id); return item ? [item] : []; });
  const [share, setShare] = useState<{ search: string; message: string; url?: string } | null>(null);
  const copyRequest = useRef(0);
  const visibleOutlets = outlets.map((outlet) => ({ outlet, count: filtered.filter((item) => item.outletId === outlet.id).length })).filter(({ count }) => count > 0);
  const largestCount = Math.max(1, ...visibleOutlets.map(({ count }) => count));
  const dated = items.filter((item) => item.publishedAt && Number.isFinite(Date.parse(item.publishedAt))).map((item) => item.publishedAt!).sort((a, b) => Date.parse(a) - Date.parse(b));
  const usedOutlets = new Set(items.map((item) => item.outletId)).size;
  const activeFilters = !!(topic || source || type || season || query);

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
    writeSelection({ media: id });
    window.requestAnimationFrame(() => {
      document.getElementById("media-viewer-heading")?.focus({ preventScroll: true });
      document.getElementById("media-selected-coverage")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
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
    <header className={styles.masthead}><div><p className={styles.eyebrow}><span aria-hidden="true">{"////"}</span> The Jets media room</p><h2 id="media-room-heading">Every angle.<br /><span>One team.</span></h2><p className={styles.intro}>Beat reporting. The radio argument. The studio breakdown. Follow the Jets through the people covering them, with the original source one click away.</p></div><div className={styles.collectionStats} aria-label="This media collection"><p><strong>{String(items.length).padStart(2, "0")}</strong><span>selected stories</span></p><p><strong>{String(usedOutlets).padStart(2, "0")}</strong><span>source outlets</span></p><p><strong>{String(items.filter((item) => item.kind === "video" || item.kind === "audio").length).padStart(2, "0")}</strong><span>watch &amp; listen</span></p></div></header>
    <div className={styles.edition}><span><span className={styles.editionMark} aria-hidden="true" />Curated collection</span><span>Sources checked {dateLabel(checkedAt)}</span><span>{dated.length ? `Published ${dateLabel(dated[0])} – ${dateLabel(dated.at(-1)!)}` : "Dates shown when available"}</span></div>

    <div className={styles.filters} data-media-filters><div className={styles.typeFilters} role="group" aria-label="Coverage format"><button type="button" aria-pressed={!type} onClick={() => chooseFilter({ type: "" })}>Everything <span>{items.length}</span></button>{kinds.map((kind) => <button type="button" key={kind} aria-pressed={type === kind} onClick={() => chooseFilter({ type: type === kind ? "" : kind })} data-media-type={kind}>{kindLabels[kind]} <span>{items.filter((item) => item.kind === kind).length}</span></button>)}</div><label className={styles.search}><span className="sr-only">Search Jets media</span><span aria-hidden="true">⌕</span><input type="search" value={query} maxLength={160} onChange={(event) => chooseFilter({ q: event.target.value }, "replace")} placeholder="Player, reporter, story…" data-media-search /></label><label className={styles.sourceSelect}>Source<select value={source} onChange={(event) => chooseFilter({ source: event.target.value })} data-media-source><option value="">All sources</option>{outlets.filter((outlet) => items.some((item) => item.outletId === outlet.id)).map((outlet) => <option value={outlet.id} key={outlet.id}>{outlet.name}</option>)}</select></label><label className={styles.seasonSelect}>Football season<select value={season} onChange={(event) => chooseFilter({ season: event.target.value })} data-media-season><option value="">Every season</option>{season && !seasonList.some((year) => String(year) === season) ? <option value={season}>Season {season} unavailable</option> : null}{seasonList.map((year) => <option key={year} value={year}>{year} season</option>)}</select></label></div>
    <div className={styles.topicStrip} role="group" aria-label="Coverage topics"><span className={styles.topicLabel}>Follow a thread</span><button type="button" aria-pressed={!topic} onClick={() => chooseFilter({ topic: "" })}>All topics</button>{topicList.map((tag) => <button type="button" key={tag} aria-pressed={topic === tag} onClick={() => chooseFilter({ topic: topic === tag ? "" : tag })} data-media-topic={tag}>{tag}<span>{items.filter((item) => item.topics.includes(tag)).length}</span></button>)}</div>

    {selected ? <div id="media-selected-coverage" className={styles.featured}><Viewer key={selected.id} item={selected} outlet={selectedOutlet} /><article className={styles.context} data-media-context={selected.id}><p className={styles.contextIndex}>In focus <span aria-hidden="true">/ {String(items.indexOf(selected) + 1).padStart(2, "0")}</span></p><div className={styles.itemMeta}><span>{selectedOutlet?.name ?? selected.author}</span><span className={styles.archiveTag}>{selected.context === "archive" ? "Archive" : "Current"}</span></div><h3 id="media-viewer-heading" tabIndex={-1}>{selected.title}</h3><p className={styles.seasonContext}>{selected.seasons?.length ? `Football season: ${selected.seasons.join(" / ")}` : "Football season not established by this source"}</p><p className={styles.byline}>{selected.author}<span>Published <Published item={selected} /></span></p><p className={styles.selectedSummary}>{selected.summary}</p><div className={styles.selectedTopics}>{selected.topics.map((tag) => <button type="button" key={tag} onClick={() => chooseFilter({ topic: tag })}>{tag}<span aria-hidden="true"> ↗</span></button>)}</div><div className={styles.contextActions}><button type="button" onClick={() => compare(selected)} disabled={compared.length === 2 && !compared.includes(selected.id)} aria-pressed={compared.includes(selected.id)} data-media-compare={selected.id}>{compared.includes(selected.id) ? "Remove from comparison" : "Add to comparison"}<span aria-hidden="true"> {compared.includes(selected.id) ? "−" : "+"}</span></button><button type="button" onClick={copyLink} data-media-share>Copy selection link <span aria-hidden="true">↗</span></button></div>{share?.search === search ? <div className={styles.shareStatus}><p role="status">{share.message}</p>{share.url ? <label>Selection link<input readOnly value={share.url} onFocus={(event) => event.currentTarget.select()} /></label> : null}</div> : null}<p className={styles.factNote}>Publisher reporting and commentary are attributed. Tags describe the subject; they do not establish agreement or verify a claim.</p></article></div> : null}

    {comparison.length ? <section className={styles.comparison} aria-labelledby="media-compare-heading" data-media-comparison><header><div><p className={styles.eyebrow}>Two sources. More context.</p><h3 id="media-compare-heading">Put the coverage side by side.</h3></div><button type="button" onClick={() => setCompared([])}>Clear comparison <span aria-hidden="true">×</span></button></header><div className={styles.compareGrid}>{comparison.map((item) => <article key={item.id} data-media-compared={item.id}><p className={styles.itemMeta}><span>{outletById.get(item.outletId)?.name ?? item.author}</span><span>{kindNames[item.kind]}</span></p><h4>{item.title}</h4><p className={styles.byline}>{item.author}<span><Published item={item} /></span></p><p>{item.summary}</p><div className={styles.compareTags}>{item.topics.map((tag) => <span key={tag} data-shared-topic={comparison.length === 2 && comparison.every((entry) => entry.topics.includes(tag)) ? "true" : "false"}>{tag}</span>)}</div><div className={styles.compareActions}><ExternalLink item={item}>Open original</ExternalLink><button type="button" onClick={() => compare(item)} aria-label={`Remove ${item.title} from comparison`}>Remove <span aria-hidden="true">×</span></button></div></article>)}{comparison.length === 1 ? <div className={styles.compareEmpty}><span aria-hidden="true">02</span><p>Select another story and add it to comparison.</p><small>Compare publication dates, summaries and shared topics against both originals.</small></div> : null}</div>{comparison.length === 2 ? <p className={styles.compareNote}>Highlighted tags occur in both items. Matching topics are not proof that the reporting agrees.</p> : null}</section> : null}

    <div className={styles.collectionHeader}><div><p className={styles.eyebrow}>The coverage index</p><h3>{topic || (source ? outletById.get(source)?.name : "Find your next angle.")}</h3></div><div className={styles.resultSummary}><p role="status" data-media-results>{filtered.length} {filtered.length === 1 ? "item" : "items"}{activeFilters ? " match your filters" : " in the collection"}</p>{activeFilters ? <button type="button" onClick={resetFilters} data-media-reset>Clear filters <span aria-hidden="true">×</span></button> : null}</div></div>
    {filtered.length ? <div className={styles.collectionLayout}><ul className={styles.storyGrid} aria-label="Jets media collection">{filtered.map((item) => <li key={item.id} className={item.id === selected?.id ? styles.activeStory : ""} data-media-card={item.id}><button type="button" className={styles.storySelect} onClick={() => viewSelection(item.id)} aria-pressed={item.id === selected?.id} data-media-select={item.id}><Thumbnail item={item} small /><span className={styles.storyText}><span className={styles.cardMeta}><span>{outletById.get(item.outletId)?.name ?? item.author}</span><span>{item.context === "archive" ? "Archive" : "Current"}</span></span><strong>{item.title}</strong><span className={styles.cardDate}><Published item={item} /></span><span className={styles.cardSelectLabel}>{item.id === selected?.id ? "Selected" : "View coverage"}<span aria-hidden="true"> ↗</span></span></span></button><div className={styles.storyFooter}><span>{item.author}</span><button type="button" onClick={() => compare(item)} aria-pressed={compared.includes(item.id)} disabled={compared.length === 2 && !compared.includes(item.id)} aria-label={`${compared.includes(item.id) ? "Remove" : "Add"} ${item.title} ${compared.includes(item.id) ? "from" : "to"} comparison`} data-media-card-compare={item.id}>{compared.includes(item.id) ? "Added −" : "Compare +"}</button></div></li>)}</ul><aside className={styles.coverageMap} aria-labelledby="coverage-map-heading" data-media-coverage><p className={styles.eyebrow}>Collection coverage</p><h4 id="coverage-map-heading">Who’s in the mix.</h4><p>Items by source in this filtered view. Select a bar to explore an outlet.</p><div className={styles.coverageBars}>{visibleOutlets.map(({ outlet, count }) => <button type="button" key={outlet.id} aria-pressed={source === outlet.id} onClick={() => chooseFilter({ source: source === outlet.id ? "" : outlet.id })} data-media-coverage-source={outlet.id} style={{ "--coverage-width": `${count / largestCount * 100}%` } as CSSProperties}><span>{outlet.name}<strong>{count}</strong></span><i aria-hidden="true" /></button>)}</div><p className={styles.coverageNote}>Counts reflect this curated collection. They do not measure audience, activity or reporting quality.</p></aside></div> : <div className={styles.empty} data-media-empty><span aria-hidden="true">∅</span><h3>No coverage matches that combination.</h3><p>{season ? `No selected sources are tagged to the ${season} football season with these filters. Season membership follows the reporting, not its calendar year.` : "Try another topic, source or search term."}</p><button type="button" onClick={resetFilters}>Reset the collection <span aria-hidden="true">↗</span></button></div>}

    <details className={styles.sourceLedger} data-media-source-ledger><summary><span>The source directory</span><span>{usedOutlets} outlets <span aria-hidden="true">+</span></span></summary><p>Original publishers and the people represented in this collection. Inclusion is attribution, not endorsement. This collection is curated; it is not a complete or continuously updated feed.</p><ul>{outlets.filter((outlet) => items.some((item) => item.outletId === outlet.id)).map((outlet) => <li key={outlet.id}><span>{outletNames[outlet.kind]}</span><ExternalLink item={outlet}><strong>{outlet.name}</strong></ExternalLink><p>{outlet.people.join(" · ") || "Publisher editorial team"}</p></li>)}</ul></details>
  </section>;
}
