"use client";

import { useSyncExternalStore } from "react";

const MINUTE = 60_000;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
const currentMinute = () => Math.floor(Date.now() / MINUTE) * MINUTE;
const serverMinute = () => 0;
const notify = () => { for (const listener of listeners) listener(); };

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    timer = setInterval(notify, MINUTE);
    document.addEventListener("visibilitychange", notify);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer !== null) clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", notify);
    }
  };
}

/** All freshness notices share one clock and recheck when the reader returns. */
export function useMinuteClock() {
  return useSyncExternalStore(subscribe, currentMinute, serverMinute);
}
