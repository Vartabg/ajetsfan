import "server-only";
import { cache } from "react";
import { after } from "next/server";
import { loadBakedFootball } from "./football-snapshot";
import { FOOTBALL_EDITION_PATH, footballRevision, validateFootballEnvelope } from "./football-envelope.mjs";
import { footballActiveWindow } from "../../scripts/refresh-football.mjs";
import { readMediaBlob } from "./media-blob-store";
import { refreshHostedFootball } from "./hosted-football-refresh";
import { selectLatestFootballEdition } from "./football-refresh-coordinator.mjs";
import type { CurrentSnapshot } from "./current";
import type { CoverageSnapshot } from "./coverage";
import type { LiveFootballFeed } from "./football-live";

export type FootballEdition = { schemaVersion: 1; current: CurrentSnapshot; coverage: CoverageSnapshot;
  live: LiveFootballFeed | null; scheduleCheck: { source: string; status: "ready" | "retained" | "unavailable"; checkedAt: string | null; attemptedAt: string } };
export type FootballState = { edition: FootballEdition; mode: "snapshot" | "runtime" | "fallback";
  updatedAt: string | null; durationMs: number | null; revision: string };
let memo: { expiresAt: number; pending: Promise<FootballState> } | null = null;
let lastValid: FootballState | null = null;
export function clearFootballReadCache() { memo = null; }

async function readState(): Promise<FootballState> {
  const baked = await loadBakedFootball();
  const fallback = (mode: "snapshot" | "fallback"): FootballState => ({ edition: baked, mode,
    updatedAt: null, durationMs: null, revision: footballRevision(baked) });
  if (!process.env.BLOB_STORE_ID || process.env.VERCEL_ENV !== "production") return fallback("snapshot");
  try {
    const record = await readMediaBlob(FOOTBALL_EDITION_PATH);
    if (!record) throw new Error("Football edition missing");
    const live = validateFootballEnvelope(record.value);
    if (live.edition.current.season < baked.current.season) throw new Error("Football season awaiting refresh");
    const edition = selectLatestFootballEdition(baked, live.edition);
    lastValid = { edition, mode: "runtime", updatedAt: live.updatedAt, durationMs: live.durationMs,
      revision: footballRevision(edition) };
    return lastValid;
  } catch {
    return lastValid ? { ...lastValid, mode: "fallback" } : fallback("fallback");
  }
}

export const loadFootballState = cache(async () => {
  const now = Date.now();
  if (!memo || memo.expiresAt <= now) memo = { expiresAt: now + 15_000, pending: readState() };
  return memo.pending;
});
export async function loadFootballLive() { return (await loadFootballState()).edition.live; }

export async function scheduleStaleFootballRecovery() {
  if (!process.env.BLOB_STORE_ID || process.env.VERCEL_ENV !== "production") return;
  const state = await loadFootballState();
  const active = footballActiveWindow(state.edition.current.schedule, new Date(), state.edition.live);
  if (state.updatedAt && Date.now() - Date.parse(state.updatedAt) < (active ? 3 : 10) * 60_000) return;
  after(async () => {
    try { await refreshHostedFootball(); clearFootballReadCache(); }
    catch { console.error("Hosted football recovery failed; see football freshness health."); }
  });
}
