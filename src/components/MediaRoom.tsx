"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { formatMediaDate, mediaImage, type MediaItem, type MediaOutlet } from "@/lib/media";
import { seasonReturn } from "@/lib/season-navigation";
import SeasonReturn from "./SeasonReturn";
import styles from "./MediaRoom.module.css";

const ROOM_EVENT = "ajetsfan:media-selection";
const ROOM_KEYS = ["media", "topic", "source", "type", "q", "season"];
const kinds: MediaItem["kind"][] = ["video", "post", "article", "audio"];
const kindLabels: Record<MediaItem["kind"], string> = { video: "Watch", post: "Posts", article: "Read", audio: "Listen" };
const kindNames: Record<MediaItem["kind"], string> = { video: "Video", post: "X post", article: "Article", audio: "Audio" };
const outletNames: Record<MediaOutlet["kind"], string> = { beat: "Beat reporting", tv: "Television", radio: "Sports radio", official: "Official team coverage", independent: "Independent coverage" };
const dateLabel = formatMediaDate;
const gridClass: Record<MediaItem["kind"], string> = { video: styles.watchGrid, post: styles.postGrid, article: styles.rowGrid, audio: `${styles.rowGrid} ${styles.audioGrid}` };
const cardSizes: Record<MediaItem["kind"], string> = { video: "(max-width: 699px) 50vw, (max-width: 1099px) 33vw, 250px", post: "36px", article: "(max-width: 699px) 112px, 176px", audio: "(max-width: 699px) 72px, 100px" };

/** Current coverage newest first, then the archive newest first. */
const byRecency = (a: MediaItem, b: MediaItem) => Number(a.context === "archive") - Number(b.context === "archive")
  || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || a.id.localeCompare(b.id);
const handleOf = (item: MediaItem) => new URL(item.url).pathname.split("/")[1];
const stageOf = (item: MediaItem) => item.kind === "post" ? styles.featuredPost : !mediaImage(item) ? styles.featuredText : item.kind === "audio" ? styles.featuredSquare : "";

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

/** A link from outside the room that sets its selection or format, then brings that part of the room into view. */
export function RoomLink({ media, type, className, children }: { media?: string; type?: MediaItem["kind"]; className?: string; children: React.ReactNode }) {
  const patch = { ...CLEAR, ...(media ? { media } : {}), ...(type ? { type } : {}) };
  const target = media ? "media-viewer-heading" : "media-results-heading";
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

/** The publisher's own picture. An item without one shows none: no stand-in artwork. */
function Preview({ item, sizes, credit }: { item: MediaItem; sizes: string; credit?: string }) {
  const [failed, setFailed] = useState(false);
  const image = mediaImage(item);
  if (!image) return null;
  return <span className={`${styles.preview} ${item.kind === "audio" ? styles.squarePreview : ""}`} data-media-thumbnail={item.id}>
    {failed ? null : <Image src={image.url} alt="" fill sizes={sizes} onError={() => setFailed(true)} />}
    {credit && !failed ? <span className={styles.previewCredit}>{credit}</span> : null}
  </span>;
}

function Avatar({ item, large = false }: { item: MediaItem; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const image = mediaImage(item);
  const size = large ? 52 : 36;
  return <span className={`${styles.avatar} ${large ? styles.avatarLarge : ""}`} data-media-thumbnail={item.id}>
    {image && !failed ? <Image src={image.url} alt="" width={size} height={size} onError={() => setFailed(true)} /> : null}
  </span>;
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
  const source = outlet?.name ?? item.author;
  const load = embeddable && !requested ? <button className={`${styles.loadButton} ${youtube ? styles.loadOverlay : ""}`} type="button" data-media-load={item.id} onClick={() => setRequested(true)}><span className={styles.loadSymbol} aria-hidden="true">{post ? "X" : "▶"}</span><span>{post ? "Load original X post" : "Load video player"}<small>{post ? "From the publisher’s account" : "YouTube · playback starts when you choose"}</small></span></button> : null;
  const stage = requested && youtube ? <div className={styles.videoFrame}><iframe src={`https://www.youtube-nocookie.com/embed/${item.youtubeId}?rel=0&playsinline=1`} title={`${item.title} — ${source}`} allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" data-media-youtube={item.youtubeId} /></div>
    : requested && post ? <XPost key={`${item.id}:${retry}`} item={item} />
      : item.kind === "post" ? <div className={styles.postCard}><Avatar item={item} large /><span><strong>{item.author}</strong><span>@{handleOf(item)} · {source}</span></span></div>
        : mediaImage(item) ? <Preview key={item.id} item={item} sizes="(max-width: 899px) calc(100vw - 2rem), 540px" credit={`Image via ${source}`} /> : null;
  return <div className={styles.viewer} data-media-viewer={item.id} data-embed-requested={requested ? "true" : "false"}>
    {stage || load ? <div className={styles.stage}>{stage}{load}</div> : null}
    <div className={styles.viewerActions}><ExternalLink item={item} className={styles.sourceButton}>Open original {item.kind === "post" ? "post" : item.kind === "audio" ? "audio" : item.kind === "video" ? "video" : "article"}</ExternalLink>{requested ? <button type="button" onClick={() => { setRequested(false); setRetry((value) => value + 1); }}>Close embed</button> : null}
      <details className={styles.embedNote} data-media-embed-guide><summary>About this player</summary><p>{embeddable ? "The player or post connects to its provider only when loaded. Availability is controlled by the publisher; the original source stays accessible." : "This item opens at its publisher. No embedded playback is available here."}</p></details></div>
  </div>;
}

function Card({ item, outletName, selected, compared, full, onSelect, onCompare }: { item: MediaItem; outletName: string; selected: boolean; compared: boolean; full: boolean; onSelect: () => void; onCompare: () => void }) {
  const textOnly = item.kind !== "post" && !mediaImage(item);
  return <li className={`${styles.card} ${textOnly ? styles.textOnly : ""} ${selected ? styles.activeStory : ""}`} data-media-card={item.id}>
    <button type="button" className={styles.storySelect} onClick={onSelect} aria-pressed={selected} data-media-select={item.id}>
      {item.kind === "post" ? null : <Preview item={item} sizes={cardSizes[item.kind]} />}
      <span className={styles.storyText}>
        {item.kind === "post" ? <span className={styles.postHead}><Avatar item={item} /><span><b>{item.author}</b><span>{outletName}</span></span></span>
          : <span className={styles.cardMeta}>{outletName}{item.context === "archive" ? <span> · Archive</span> : null}</span>}
        <strong>{item.title}</strong>
        {item.kind === "video" ? null : <span className={styles.cardSummary}>{item.summary}</span>}
      </span>
    </button>
    <div className={styles.cardFoot}><span className={styles.cardDate}><Published item={item} /></span><button type="button" className={styles.cardCompare} onClick={onCompare} aria-pressed={compared} disabled={full && !compared} aria-label={`${compared ? "Remove" : "Add"} ${item.title} ${compared ? "from" : "to"} comparison`} data-media-card-compare={item.id}><span>{compared ? "Added −" : "Compare +"}</span></button></div>
  </li>;
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
  const selected = filtered.find((item) => item.id === params.get("media"));
  const selectedOutlet = selected ? outletById.get(selected.outletId) : undefined;
  const [compared, setCompared] = useState<string[]>([]);
  const comparison = compared.flatMap((id) => { const item = items.find((candidate) => candidate.id === id); return item ? [item] : []; });
  const [share, setShare] = useState<{ search: string; message: string; url?: string } | null>(null);
  const copyRequest = useRef(0);
  const returnPosition = useRef<{ id: string; viewportTop: number } | null>(null);
  const groups = kinds.map((kind) => ({ kind, entries: filtered.filter((item) => item.kind === kind).sort(byRecency) })).filter(({ entries }) => entries.length);
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
    document.getElementById("media-selected-coverage")?.scrollIntoView({ block: "start", behavior: "instant" });
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
    const card = document.querySelector<HTMLElement>(`[data-media-select="${CSS.escape(id)}"]`);
    returnPosition.current = { id, viewportTop: card?.getBoundingClientRect().top ?? 0 };
    writeSelection({ media: id });
    window.requestAnimationFrame(() => {
      document.getElementById("media-viewer-heading")?.focus({ preventScroll: true });
      document.getElementById("media-selected-coverage")?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }
  function backToResults() {
    const destination = returnPosition.current;
    const id = destination?.id ?? selected?.id;
    writeSelection({ media: "" });
    window.requestAnimationFrame(() => {
      const card = id ? document.querySelector<HTMLElement>(`[data-media-select="${CSS.escape(id)}"]`) : null;
      const target = card ?? document.getElementById("media-results-heading");
      target?.focus({ preventScroll: true });
      if (card && destination && destination.id === id) window.scrollTo({ top: Math.max(0, window.scrollY + card.getBoundingClientRect().top - destination.viewportTop), behavior: "instant" });
      else target?.scrollIntoView({ block: "center", behavior: "instant" });
    });
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

    {selected ? <div id="media-selected-coverage" className={`${styles.featured} ${stageOf(selected)}`}>
      <div className={styles.selectedNav}><button type="button" onClick={backToResults} data-media-back-results>← Back to results</button><span>{selected.context === "archive" ? "From the archive" : "Current coverage"}</span></div>
      <Viewer key={selected.id} item={selected} outlet={selectedOutlet} />
      <article className={styles.context} data-media-context={selected.id}>
        <p className={styles.itemMeta}><span>{selectedOutlet?.name ?? selected.author}</span><span>{kindNames[selected.kind]}</span></p>
        <h3 id="media-viewer-heading" tabIndex={-1}>{selected.title}</h3>
        <p className={styles.byline}>{selected.author} · Published <Published item={selected} /></p>
        <p className={styles.seasonContext}>{selected.seasons?.length ? `Football season: ${selected.seasons.join(" / ")}` : "Football season not established by this source"}</p>
        <p className={styles.selectedSummary}>{selected.summary}</p>
        <div className={styles.contextActions}><button type="button" onClick={() => compare(selected)} disabled={compared.length === 2 && !compared.includes(selected.id)} aria-pressed={compared.includes(selected.id)} data-media-compare={selected.id}>{compared.includes(selected.id) ? "Remove from comparison" : "Add to comparison"}<span aria-hidden="true"> {compared.includes(selected.id) ? "−" : "+"}</span></button><button type="button" onClick={copyLink} data-media-share>Copy selection link <span aria-hidden="true">↗</span></button></div>
        {share?.search === search ? <div className={styles.shareStatus}><p role="status">{share.message}</p>{share.url ? <label>Selection link<input readOnly value={share.url} onFocus={(event) => event.currentTarget.select()} /></label> : null}</div> : null}
        <details className={styles.storyDetails}><summary>Related topics</summary><div className={styles.selectedTopics}>{selected.topics.map((tag) => <button type="button" key={tag} onClick={() => followTopic(tag)}>{tag}<span aria-hidden="true"> ↗</span></button>)}</div></details>
      </article>
    </div> : null}

    {comparison.length ? <section className={styles.comparison} aria-labelledby="media-compare-heading" data-media-comparison><header><h3 id="media-compare-heading">Compare coverage<span>{comparison.length} of 2</span></h3><button type="button" onClick={() => setCompared([])}>Clear comparison <span aria-hidden="true">×</span></button></header><div className={styles.compareGrid}>{comparison.map((item) => <article key={item.id} data-media-compared={item.id}><p className={styles.itemMeta}><span>{outletById.get(item.outletId)?.name ?? item.author}</span><span>{kindNames[item.kind]}</span></p><h4>{item.title}</h4><p className={styles.byline}>{item.author} · <Published item={item} /></p><p>{item.summary}</p><div className={styles.compareTags}>{item.topics.map((tag) => <span key={tag} data-shared-topic={comparison.length === 2 && comparison.every((entry) => entry.topics.includes(tag)) ? "true" : "false"}>{tag}</span>)}</div><div className={styles.compareActions}><ExternalLink item={item}>Open original</ExternalLink><button type="button" onClick={() => compare(item)} aria-label={`Remove ${item.title} from comparison`}>Remove <span aria-hidden="true">×</span></button></div></article>)}{comparison.length === 1 ? <p className={styles.compareEmpty}>Select another story and add it to comparison to read the two summaries, dates and topics side by side.</p> : null}</div>{comparison.length === 2 ? <details className={styles.compareNote}><summary>Comparison guide</summary><p>Highlighted tags occur in both items. Matching topics are not proof that the reporting agrees.</p></details> : null}</section> : null}

    <div className={styles.collectionHeader}><h3 id="media-results-heading" tabIndex={-1}>{topic || (source ? outletById.get(source)?.name : season ? `${season} coverage` : "Browse coverage")}</h3><div className={styles.resultSummary}><p role="status" data-media-results>{filtered.length} {filtered.length === 1 ? "item" : "items"}{activeFilters ? " match your filters" : " in the collection"}</p>{activeFilters ? <button type="button" onClick={resetFilters} data-media-reset>Clear filters <span aria-hidden="true">×</span></button> : null}</div></div>
    {filtered.length ? <div>
      {groups.map(({ kind, entries }) => <section key={kind} className={styles.group} aria-labelledby={`media-group-${kind}`} data-media-group={kind}>
        <h4 id={`media-group-${kind}`} className={styles.groupHead}>{kindLabels[kind]}<span>{entries.length}</span></h4>
        <ul className={`${styles.cards} ${gridClass[kind]}`} aria-labelledby={`media-group-${kind}`}>{entries.map((item) => <Card key={item.id} item={item} outletName={outletById.get(item.outletId)?.name ?? item.author} selected={item.id === selected?.id} compared={compared.includes(item.id)} full={compared.length === 2} onSelect={() => viewSelection(item.id)} onCompare={() => compare(item)} />)}</ul>
      </section>)}
      <details className={styles.coverageDisclosure} data-media-source-bars><summary>Explore by source<span>{visibleOutlets.length} outlets</span></summary>
        <aside className={styles.coverageMap} aria-labelledby="coverage-map-heading" data-media-coverage><h4 id="coverage-map-heading">Stories by source</h4><div className={styles.coverageBars}>{visibleOutlets.map(({ outlet, count }) => <button type="button" key={outlet.id} aria-pressed={source === outlet.id} onClick={() => chooseFilter({ source: source === outlet.id ? "" : outlet.id })} data-media-coverage-source={outlet.id} style={{ "--coverage-width": `${count / largestCount * 100}%` } as CSSProperties}><span>{outlet.name}<strong>{count}</strong></span><i aria-hidden="true" /></button>)}</div><p className={styles.coverageNote}>Counts reflect this curated collection. They do not measure audience, activity or reporting quality.</p></aside>
      </details>
    </div> : <div className={styles.empty} data-media-empty><span aria-hidden="true">∅</span><h3>No coverage matches.</h3><p>{season ? `No selected stories for the ${season} football season with these filters.` : "Try another topic, source or search term."}</p><button type="button" onClick={resetFilters}>Reset the collection <span aria-hidden="true">↗</span></button></div>}

    <details className={styles.sourceLedger} data-media-source-ledger><summary><span>The source directory</span><span>{usedOutlets} outlets <span aria-hidden="true">+</span></span></summary><p>Original publishers and the people represented in this curated collection. It is not a complete or continuously updated feed. Sources checked {dateLabel(checkedAt)}.</p><p>{dated.length ? `Published ${dateLabel(dated[0])} – ${dateLabel(dated.at(-1)!)}` : "Dates shown when available"}. Tags describe subjects; they do not establish agreement or verify claims. Inclusion is attribution, not endorsement.</p><ul>{outlets.filter((outlet) => items.some((item) => item.outletId === outlet.id)).map((outlet) => <li key={outlet.id}><span>{outletNames[outlet.kind]}</span><ExternalLink item={outlet}><strong>{outlet.name}</strong></ExternalLink><p>{outlet.people.join(" · ") || "Publisher editorial team"}</p></li>)}</ul></details>
  </section>;
}
