"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

type FootballStatus = { schemaVersion: 1; revision: string; season: number; live: boolean; active: boolean; checkedAt: string | null };
type ReadingPlace = { href: string; id: string | null; top: number; y: number; motion: number; revision: string; sawPending: boolean };
const IDLE_MS = 6000;

function statusValue(value: unknown): value is FootballStatus {
  if (!value || typeof value !== "object") return false;
  const data = value as FootballStatus;
  return data.schemaVersion === 1 && typeof data.revision === "string" && /^[a-zA-Z0-9:_-]{1,128}$/.test(data.revision)
    && Number.isInteger(data.season) && data.season >= 1999 && data.season <= 2200
    && typeof data.live === "boolean" && typeof data.active === "boolean"
    && (data.checkedAt === null || typeof data.checkedAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(data.checkedAt) && Number.isFinite(Date.parse(data.checkedAt)));
}

function occupied() {
  const editing = document.activeElement instanceof HTMLElement
    && !!document.activeElement.closest("input, select, textarea, [contenteditable], form");
  if (editing || document.querySelector('[data-inline-media][data-inline-open="true"], [data-media-viewer], [data-inline-news][open], dialog[open], #roster-player-profile')) return true;
  if (document.querySelector("iframe[data-media-youtube], iframe[data-media-apple], iframe[data-media-publisher-player]")) return true;
  return [...document.querySelectorAll<HTMLMediaElement>("audio, video")].some((media) => !media.paused && !media.ended);
}

function readingPlace(revision: string, motion: number): ReadingPlace {
  const moments = [...document.querySelectorAll<HTMLElement>("[data-focus-moment]")];
  const moment = moments.find((element) => { const box = element.getBoundingClientRect(); return box.top <= 72 && box.bottom > 72; })
    ?? moments.find((element) => { const box = element.getBoundingClientRect(); return box.bottom > 72 && box.top < innerHeight; });
  return { href: window.location.href, id: moment?.id ?? null, top: moment?.getBoundingClientRect().top ?? 0,
    y: window.scrollY, motion, revision, sawPending: false };
}

/** Poll a small revision, and merge new server data only when the reader is free. */
export default function FootballRefresh({ initialRevision }: { initialRevision?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const revision = useRef<string | null>(initialRevision ?? null);
  const queued = useRef<string | null>(null);
  const place = useRef<ReadingPlace | null>(null);
  const motion = useRef(0);
  const busy = useRef(false);
  const resume = useRef<() => void>(() => {});
  const currentInitial = useRef(initialRevision);

  useEffect(() => {
    currentInitial.current = initialRevision;
    if (initialRevision && !place.current) revision.current = initialRevision;
  }, [initialRevision]);

  useEffect(() => {
    const saved = place.current;
    if (!saved) return;
    if (isPending) { saved.sawPending = true; return; }
    if (!saved.sawPending && initialRevision !== saved.revision) return;
    place.current = null;
    busy.current = false;
    // A failed or older response is retried on a later poll instead of being
    // mistaken for the revision that was requested.
    if (!initialRevision || initialRevision === saved.revision) {
      revision.current = saved.revision;
      if (queued.current === saved.revision) queued.current = null;
    }
    let cancelled = false;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => {
      if (cancelled || document.visibilityState !== "visible" || saved.motion !== motion.current || saved.href !== window.location.href) return;
      const anchor = saved.id ? document.getElementById(saved.id) : null;
      if (anchor) {
        const shift = anchor.getBoundingClientRect().top - saved.top;
        if (Math.abs(shift) > 1) window.scrollBy({ top: shift, behavior: "instant" });
      } else if (Math.abs(window.scrollY - saved.y) > 1) window.scrollTo({ top: saved.y, behavior: "instant" });
    }));
    resume.current();
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [isPending, initialRevision]);

  useEffect(() => {
    // The Media Room owns its players and selection. Football updates never
    // cause a media page to re-render underneath an open recording.
    if (pathname === "/media" || pathname.startsWith("/media/")) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let request: AbortController | null = null;
    let cadence = 120_000;
    let lastInteraction = Date.now();
    let nextRefresh = 0;
    let returning = false;
    queued.current = null;
    revision.current = currentInitial.current ?? revision.current;

    const tryRefresh = () => {
      if (stopped || !queued.current || busy.current || document.visibilityState !== "visible") return;
      if (Date.now() < nextRefresh || Date.now() - lastInteraction < IDLE_MS || occupied()) {
        if (retry === null) retry = setTimeout(() => { retry = null; tryRefresh(); }, 3000);
        return;
      }
      place.current = readingPlace(queued.current, motion.current);
      busy.current = true;
      nextRefresh = Date.now() + cadence;
      startTransition(() => router.refresh());
    };
    resume.current = tryRefresh;
    const schedule = (delay: number) => {
      if (timer !== null) clearTimeout(timer);
      if (!stopped && document.visibilityState === "visible") timer = setTimeout(() => { timer = null; void check(); }, delay);
    };
    const check = async () => {
      if (stopped || request || document.visibilityState !== "visible") return;
      returning = false;
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch("/api/football/status", { cache: "no-store", redirect: "error", credentials: "omit",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]), headers: { Accept: "application/json" } });
        if (!response.ok || Number(response.headers.get("content-length")) > 16_384) return;
        const text = await response.text();
        if (text.length > 16_384) return;
        const value: unknown = JSON.parse(text);
        if (stopped || controller.signal.aborted || !statusValue(value)) return;
        cadence = value.active || value.live ? 30_000 : 120_000;
        if (!revision.current) revision.current = value.revision;
        else if (value.revision !== revision.current) { queued.current = value.revision; tryRefresh(); }
        else queued.current = null;
      } catch { /* Leave the current page intact while a later check retries. */ }
      finally {
        if (request === controller) request = null;
        if (!stopped) schedule(returning ? 0 : cadence);
      }
    };
    const interaction = () => { motion.current++; lastInteraction = Date.now(); };
    const visibility = () => {
      if (document.visibilityState !== "visible") {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        if (retry !== null) clearTimeout(retry);
        retry = null;
        request?.abort();
      } else { returning = true; if (!request) schedule(0); }
    };
    const events = ["pointerdown", "keydown", "input", "touchmove", "wheel", "scroll"] as const;
    events.forEach((event) => window.addEventListener(event, interaction, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", visibility);
    schedule(0);
    return () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      if (retry !== null) clearTimeout(retry);
      request?.abort();
      events.forEach((event) => window.removeEventListener(event, interaction, true));
      document.removeEventListener("visibilitychange", visibility);
      resume.current = () => {};
    };
  }, [pathname, router, startTransition]);

  return <span hidden data-football-refresh data-football-refresh-revision={initialRevision ?? ""} data-football-refresh-pending={isPending ? "true" : "false"} />;
}
