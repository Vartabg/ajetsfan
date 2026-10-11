"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { mediaImage, type MediaItem } from "@/lib/media";
import { mediaPlayback } from "@/lib/media-playback";
import { mediaImagePath, mediaTitleCardPath } from "@/lib/media-asset-paths.mjs";
import dynamic from "next/dynamic";
import styles from "./InlineMedia.module.css";

const Player = dynamic(() => import("./InlineMediaPlayer"), { loading: () => <div className={styles.loadingPlayer} role="status">Loading player…</div> });

// One active player per document, including repeated stories in the page's opening moments.
let activePlayer: string | null = null;
const listeners = new Set<() => void>();
function activate(id: string | null) { activePlayer = id; listeners.forEach((notify) => notify()); }
function subscribe(notify: () => void) { listeners.add(notify); return () => { listeners.delete(notify); }; }
const activeSnapshot = () => activePlayer;
const serverSnapshot = () => null;

/** Never enlarge a small publisher picture to fill a large feature. */
export function MediaPreview({ item, sizes = "(max-width: 699px) 100vw, 320px", feature = false }: { item: MediaItem; sizes?: string; feature?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [cardFailed, setCardFailed] = useState(false);
  const image = mediaImage(item);
  const minimumWidth = feature && item.kind !== "audio" ? 960 : 600;
  const usable = image && image.width >= minimumWidth && image.height >= 300 && !failed;
  const card = mediaTitleCardPath(item);
  return <span className={`${styles.preview} ${item.kind === "audio" ? styles.square : ""}`} data-media-thumbnail={item.id} data-media-image-fallback={usable ? "false" : "true"}
    style={usable ? { "--picture-width": `${image.width}px` } as CSSProperties : undefined}>
    {usable ? <span className={styles.picture}><Image src={mediaImagePath(item)!} alt="" fill sizes={sizes} onError={() => setFailed(true)} /></span>
      : !cardFailed ? <Image src={card} alt="" fill sizes={sizes} onError={() => setCardFailed(true)} data-media-title-card />
        : <span className={styles.fallback} aria-hidden="true"><span>AJETSFAN · {item.kind === "audio" ? "LISTEN" : item.kind === "video" ? "WATCH" : "READ"}</span><strong>{item.title}</strong><span>{item.author}</span></span>}
  </span>;
}

/** The trigger's own picture becomes the player. Opening never navigates or scrolls. */
export default function InlineMedia({ item, outletName, children, selected, onSelect, onClose, triggerClassName, sizes, preview = true, feature = false }: {
  item: MediaItem; outletName?: string; children?: ReactNode; selected?: boolean; onSelect?: () => void; onClose?: () => void;
  triggerClassName?: string; sizes?: string; preview?: boolean; feature?: boolean;
}) {
  const instance = useId();
  const active = useSyncExternalStore(subscribe, activeSnapshot, serverSnapshot);
  const [expanded, setExpanded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const openingTop = useRef<number | null>(null);
  const open = selected ?? expanded;
  const requested = open && active === instance;
  const source = outletName ?? item.author;
  const playable = !!mediaPlayback(item);
  const label = item.kind === "post" ? "Show original post" : item.kind === "article" ? "Read summary" : playable ? item.kind === "audio" ? "Play audio" : "Play video" : "View coverage";
  const select = () => { openingTop.current = container.current?.getBoundingClientRect().top ?? null; activate(instance); setExpanded(true); onSelect?.(); requestAnimationFrame(() => closer.current?.focus({ preventScroll: true })); };
  const close = () => { const top = openingTop.current ?? container.current?.getBoundingClientRect().top; if (activePlayer === instance) activate(null); setExpanded(false); onClose?.(); requestAnimationFrame(() => { trigger.current?.focus({ preventScroll: true }); if (top != null && container.current) window.scrollBy({ top: container.current.getBoundingClientRect().top - top, behavior: "instant" }); }); };
  useEffect(() => {
    const stop = () => { if (activePlayer === instance) activate(null); };
    window.addEventListener("popstate", stop);
    return () => { window.removeEventListener("popstate", stop); stop(); };
  }, [instance]);
  return <div ref={container} className={styles.inline} data-inline-media={item.id} data-inline-open={open ? "true" : "false"}>
    {requested ? <div data-media-viewer={item.id} data-embed-requested="true"><Player key={item.id} item={item} source={source} /></div> : null}
    {!requested ? <button ref={trigger} type="button" className={`${styles.trigger} ${triggerClassName ?? ""}`} onClick={select} aria-expanded={open} data-media-open={item.id} data-media-select={item.id}>
      {preview ? <span className={styles.cover}><MediaPreview item={item} sizes={sizes} feature={feature} /><span className={styles.play}><b aria-hidden="true">{item.kind === "audio" || item.kind === "video" ? "▶" : "+"}</b><span>{label}<span className="sr-only">: {item.title}</span></span></span></span> : null}
      {children ?? (!preview ? <span>{label}: {item.title}</span> : null)}
    </button> : children && selected === undefined ? <div className={triggerClassName}>{children}</div> : null}
    {open ? <div className={styles.actions}>
      {!requested ? <button type="button" data-media-load={item.id} onClick={select}>{label}</button> : null}
      <button ref={closer} type="button" onClick={close} data-media-close data-media-back-results>Close <span className="sr-only">{item.title}</span><span aria-hidden="true">×</span></button>
      <details data-media-embed-guide><summary>Source &amp; playback</summary><p>{source} controls availability. {playable ? "The player connects to its publisher when you press play." : "The summary stays here; full reporting is at the publisher."}</p>
        <a href={item.url} target="_blank" rel="noopener noreferrer">Open original at {source}<span aria-hidden="true"> ↗</span><span className="sr-only"> (opens in a new tab)</span></a>
      </details>
    </div> : null}
  </div>;
}
