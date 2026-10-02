"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { seasonReturn } from "@/lib/season-navigation";

const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
};
const snapshot = () => window.location.search;
const serverSnapshot = () => "";

export default function SeasonReturn({ year, fallback = "/morgue", fallbackLabel = "The Morgue", className, queryKey = "from" }: { year?: number; fallback?: string | null; fallbackLabel?: string; className?: string; queryKey?: "from" | "return" }) {
  const search = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const destination = seasonReturn(new URLSearchParams(search).get(queryKey), year);
  if (!destination && !fallback) return null;
  const season = destination?.match(/^\/seasons\/(\d{4})/)?.[1];
  return <Link href={destination ?? fallback!} className={className} data-season-return={destination ? "context" : "fallback"}>{destination ? `← Back to ${season}` : fallbackLabel}</Link>;
}
