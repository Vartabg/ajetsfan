"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./YouTubePlayer.module.css";

type Player = { destroy: () => void };
type PlayerEvent = { target: Player; data?: number };
type YouTubeApi = { Player: new (iframe: HTMLIFrameElement, options: { events: {
  onReady: (event: PlayerEvent) => void;
  onStateChange: (event: PlayerEvent) => void;
  onError: (event: PlayerEvent) => void;
  onAutoplayBlocked: (event: PlayerEvent) => void;
} }) => Player };
type YouTubeWindow = Window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };
let sdkPromise: Promise<YouTubeApi> | null = null;

/** Shared only after a requested player mounts. Loading the page never starts this SDK. */
function loadYouTubeApi(): Promise<YouTubeApi> {
  const target = window as YouTubeWindow;
  if (target.YT?.Player) return Promise.resolve(target.YT);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previous = target.onYouTubeIframeAPIReady;
    let settled = false;
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    const script = existing ?? document.createElement("script");
    const finish = (api?: YouTubeApi) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.removeEventListener("error", failed);
      if (target.onYouTubeIframeAPIReady === ready) target.onYouTubeIframeAPIReady = previous;
      if (api) resolve(api);
      else { if (!existing) script.remove(); reject(new Error("Video player could not load")); }
    };
    const failed = () => finish();
    const ready = () => {
      const api = target.YT;
      finish(api?.Player ? api : undefined);
      try { previous?.(); } catch { /* Another embed's callback cannot break this player. */ }
    };
    const timer = window.setTimeout(failed, 12_000);
    target.onYouTubeIframeAPIReady = ready;
    script.addEventListener("error", failed, { once: true });
    if (!existing) {
      script.id = "ajetsfan-youtube-sdk";
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => { sdkPromise = null; throw error; });
  return sdkPromise;
}

export function youtubePlaybackError(code?: number): string {
  if (code === 100) return "This video is no longer available from its publisher.";
  if (code === 101 || code === 150) return "The publisher has limited this video to YouTube.";
  if (code === 153) return "YouTube could not verify playback on this page. Please try again.";
  return "This video could not play here. You can find its original source below.";
}

/** Mounted by InlineMedia only when a visitor presses play at this exact location. */
export default function YouTubePlayer({ id, title, sourceUrl, onUnavailable }: {
  id: string; title: string; sourceUrl: string; onUnavailable?: () => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const unavailable = useRef(onUnavailable);
  const [status, setStatus] = useState<"loading" | "ready" | "blocked" | "failed">("loading");
  const [message, setMessage] = useState("");
  useEffect(() => { unavailable.current = onUnavailable; }, [onUnavailable]);
  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    let cancelled = false, settled = false;
    let player: Player | undefined;
    const destroyPlayer = () => { const current = player; player = undefined; current?.destroy(); };
    const fail = (label: string) => {
      if (cancelled || settled) return;
      settled = true;
      window.clearTimeout(timer);
      destroyPlayer();
      host.replaceChildren();
      setMessage(label);
      setStatus("failed");
      unavailable.current?.();
    };
    const timer = window.setTimeout(() => fail("The video player is taking too long to load. Please try again."), 20_000);
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
      fail(youtubePlaybackError(2));
      return () => { cancelled = true; window.clearTimeout(timer); };
    }
    const iframe = document.createElement("iframe");
    const url = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
    for (const [key, value] of Object.entries({ autoplay: "1", rel: "0", playsinline: "1", enablejsapi: "1", origin: window.location.origin })) url.searchParams.set(key, value);
    iframe.src = url.href;
    iframe.title = title;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.allowFullscreen = true;
    iframe.dataset.mediaYoutube = id;
    host.appendChild(iframe);
    void loadYouTubeApi().then((api) => {
      if (cancelled || settled || !host.isConnected) return;
      player = new api.Player(iframe, { events: {
        onReady: () => {
          if (cancelled || settled) return;
          window.clearTimeout(timer);
          setStatus((current) => current === "blocked" ? current : "ready");
        },
        onStateChange: ({ data }) => {
          if (cancelled || settled) return;
          if (data === 1) { window.clearTimeout(timer); setStatus("ready"); }
        },
        onAutoplayBlocked: () => {
          if (cancelled || settled) return;
          window.clearTimeout(timer);
          setStatus("blocked");
        },
        onError: ({ data }) => fail(youtubePlaybackError(data)),
      } });
      if (cancelled || settled) { destroyPlayer(); host.replaceChildren(); }
    }).catch(() => fail("The video player could not load. Please check your connection and try again."));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      destroyPlayer();
      host.replaceChildren();
    };
  }, [id, title, sourceUrl]);
  return <div className={styles.stage} data-media-youtube-status={status}>
    <div ref={mount} className={styles.frame} />
    {status === "loading" ? <div className={styles.loading} role="status"><span className={styles.spinner} aria-hidden="true" />Loading video…</div> : null}
    {status === "blocked" ? <p className={styles.notice} role="status">Tap play in the player to start.</p> : null}
    {status === "failed" ? <div className={styles.fallback} role="status"><span aria-hidden="true">▶</span><p>{message}</p></div> : null}
  </div>;
}
