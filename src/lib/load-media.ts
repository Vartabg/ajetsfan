import "server-only";
import { cache } from "react";
import { after } from "next/server";
import { mediaCollection as baked } from "./media-catalog";
import { selectLatestMediaCollection } from "./media-refresh-coordinator.mjs";
import { validateLiveMediaEnvelope } from "./media-live-envelope.mjs";
import { MEDIA_LIVE_COLLECTION_PATH, MEDIA_POLICY_FINGERPRINT, refreshHostedMedia } from "./hosted-media-refresh";
import { readMediaBlob } from "./media-blob-store";
import type { MediaCollection } from "./media";

type LiveMediaState = { collection: MediaCollection; previousCollections: MediaCollection[];
  mode: "snapshot" | "runtime" | "fallback"; updatedAt: string | null; durationMs: number | null };
let memo: { expiresAt: number; pending: Promise<LiveMediaState> } | null = null;
let lastValid: LiveMediaState | null = null;

export function clearMediaReadCache() { memo = null; }

async function readState(): Promise<LiveMediaState> {
  if (!process.env.BLOB_STORE_ID || process.env.VERCEL_ENV !== "production") {
    return { collection: baked, previousCollections: [], mode: "snapshot", updatedAt: null, durationMs: null };
  }
  try {
    const record = await readMediaBlob(MEDIA_LIVE_COLLECTION_PATH);
    if (!record) throw new Error("Live media edition missing");
    const live = validateLiveMediaEnvelope(record.value);
    if (live.policyFingerprint !== MEDIA_POLICY_FINGERPRINT) throw new Error("Live media policy awaiting refresh");
    lastValid = { collection: selectLatestMediaCollection(baked, live.collection), previousCollections: live.previousCollections,
      mode: "runtime", updatedAt: live.updatedAt, durationMs: live.durationMs };
    return lastValid;
  } catch {
    // Preserve a validated last-known edition; health still reports that runtime delivery failed.
    return lastValid ? { ...lastValid, mode: "fallback" } : { collection: baked, previousCollections: [], mode: "fallback", updatedAt: null, durationMs: null };
  }
}

/** One shared 30-second read cache; no stacked page/Blob caches conceal a new edition. */
export const loadLiveMediaState = cache(async () => {
  const now = Date.now();
  if (!memo || memo.expiresAt <= now) memo = { expiresAt: now + 30_000, pending: readState() };
  return memo.pending;
});

export async function loadMediaCollection() { return (await loadLiveMediaState()).collection; }

/** Reconcile missed invocations after returning the page, under the same distributed lease. */
export async function scheduleStaleMediaRecovery() {
  if (!process.env.BLOB_STORE_ID || !process.env.YOUTUBE_API_KEY || process.env.VERCEL_ENV !== "production") return;
  const state = await loadLiveMediaState();
  if (state.updatedAt && Date.now() - Date.parse(state.updatedAt) < 20 * 60_000) return;
  after(async () => {
    try { await refreshHostedMedia(); clearMediaReadCache(); }
    catch { console.error("Hosted media recovery failed; see media freshness health."); }
  });
}

/** Keep two previous generations for artwork requested by a page already open. */
export async function loadMediaAssetCollections() {
  const state = await loadLiveMediaState();
  return [state.collection, ...state.previousCollections, baked];
}
