"use client";

import { useEffect, useRef, useState } from "react";
import { type MediaItem } from "@/lib/media";
import { mediaPlayback } from "@/lib/media-playback";
import { mediaImagePath } from "@/lib/media-asset-paths.mjs";
import YouTubePlayer from "./YouTubePlayer";
import styles from "./InlineMedia.module.css";

type XWidgets = { createTweet: (id: string, element: HTMLElement, options: Record<string, string | boolean>) => Promise<HTMLElement | undefined> };
type XWindow = Window & { twttr?: { widgets?: XWidgets; ready?: (callback: (api: { widgets: XWidgets }) => void) => void } };
let xSdkPromise: Promise<XWidgets> | null = null;
function loadXWidgets(): Promise<XWidgets> {
  const available = (window as XWindow).twttr?.widgets;
  if (available?.createTweet) return Promise.resolve(available);
  if (xSdkPromise) return xSdkPromise;
  xSdkPromise = new Promise<XWidgets>((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;
    const fail = () => { if (settled) return; settled = true; clearTimeout(timer); script.remove(); reject(new Error("X player unavailable")); };
    const done = (widgets: XWidgets) => { if (settled) return; settled = true; clearTimeout(timer); resolve(widgets); };
    const timer = window.setTimeout(fail, 12000);
    script.id = "media-room-x-sdk";
    script.src = "https://platform.twitter.com/widgets.js";
    script.async = true;
    script.onerror = fail;
    script.onload = () => {
      const api = (window as XWindow).twttr;
      if (api?.widgets?.createTweet) done(api.widgets);
      else api?.ready?.((loaded) => done(loaded.widgets));
    };
    document.head.appendChild(script);
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
    const fail = () => { if (cancelled) return; cancelled = true; target.remove(); setStatus("failed"); };
    const timer = window.setTimeout(fail, 16000);
    void loadXWidgets().then((widgets) => cancelled ? undefined : widgets.createTweet(item.tweetId!, target, { dnt: true, conversation: "none", align: "center" }))
      .then((element) => { if (cancelled) return; clearTimeout(timer); if (element) setStatus("ready"); else fail(); })
      .catch(() => { clearTimeout(timer); fail(); });
    return () => { cancelled = true; clearTimeout(timer); target.remove(); };
  }, [item.tweetId]);
  return <div className={styles.post} data-media-x-status={status}>
    {status !== "ready" ? <p role="status">{status === "loading" ? "Loading the original post from X…" : "X could not display this post here. Its source is available below."}</p> : null}
    <div ref={mount} />
  </div>;
}

export default function Player({ item, source }: { item: MediaItem; source: string }) {
  const playback = mediaPlayback(item);
  const [failed, setFailed] = useState(false);
  if (!playback || failed) return <div className={styles.message} role="status"><p>{item.summary}</p>
    {item.kind === "video" || item.kind === "audio" ? <p>This publisher’s player is unavailable here. You can still view its source below.</p> : null}</div>;
  if (playback.kind === "post") return <XPost item={item} />;
  if (playback.kind === "youtube") return <YouTubePlayer id={playback.id} title={`${item.title} — ${source}`} sourceUrl={item.url} />;
  if (playback.kind === "apple") return <iframe className={styles.podcast} src={playback.url} title={`${item.title} — ${source}`} allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" data-media-apple={item.id} onError={() => setFailed(true)} />;
  if (playback.kind === "video") return <video className={styles.nativeVideo} controls autoPlay playsInline preload="metadata" poster={mediaImagePath(item) ?? undefined} data-media-native-video={item.id} onError={() => setFailed(true)}><source src={playback.url} type={playback.type} onError={() => setFailed(true)} /></video>;
  if (playback.kind === "audio") return <audio className={styles.audio} controls autoPlay preload="metadata" data-media-native-audio={item.id} onError={() => setFailed(true)}><source src={playback.url} type={playback.type} onError={() => setFailed(true)} /></audio>;
  if (playback.kind === "iframe") return <iframe className={styles.podcast} src={playback.url} title={`${item.title} — ${source}`} allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" data-media-publisher-player={item.id} onError={() => setFailed(true)} />;
  return null;
}
