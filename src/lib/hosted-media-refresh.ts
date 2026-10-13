import "server-only";
import curated from "./media-catalog.json";
import { mediaCollection as baked } from "./media-catalog";
import { MEDIA_SOURCES, refreshMedia } from "../../scripts/refresh-media.mjs";
import { coordinateMediaRefresh, MEDIA_COLLECTION_PATH, MIN_MEDIA_REFRESH_INTERVAL_MS } from "./media-refresh-coordinator.mjs";
import { liveMediaEnvelope, MEDIA_POLICY_REVISION, mediaPolicyFingerprint, validateLiveMediaEnvelope } from "./media-live-envelope.mjs";
import { isMediaBlobConflict, readMediaBlob, writeMediaBlob } from "./media-blob-store";
import type { MediaCollection } from "./media";

export const MEDIA_POLICY_FINGERPRINT = mediaPolicyFingerprint(curated, MEDIA_SOURCES);
export const MEDIA_LIVE_COLLECTION_PATH = `media/editions/${MEDIA_POLICY_FINGERPRINT}.json`;

/** Refresh and publish independently of GitHub queues, builds and deployments. */
export async function refreshHostedMedia() {
  if (!process.env.BLOB_STORE_ID || !process.env.YOUTUBE_API_KEY || process.env.VERCEL_ENV !== "production") {
    throw new Error("Hosted media refresh is not configured");
  }
  const startedAt = new Date();
  const deadline = AbortSignal.timeout(140_000);
  let previousEnvelope: ReturnType<typeof validateLiveMediaEnvelope> | null = null;
  return coordinateMediaRefresh({ curated, baked, apiKey: process.env.YOUTUBE_API_KEY,
    read: async (pathname: string) => {
      const record = await readMediaBlob(pathname === MEDIA_COLLECTION_PATH ? MEDIA_LIVE_COLLECTION_PATH : pathname);
      if (!record || pathname !== MEDIA_COLLECTION_PATH) return record;
      previousEnvelope = validateLiveMediaEnvelope(record.value);
      if (previousEnvelope.policyRevision > MEDIA_POLICY_REVISION) throw new Error("Superseded media policy");
      if (previousEnvelope.policyFingerprint !== MEDIA_POLICY_FINGERPRINT) throw new Error("Invalid media policy namespace");
      return { value: previousEnvelope.collection, etag: record.etag };
    },
    write: async (pathname: string, value: unknown, options: { ifMatch?: string; createOnly?: boolean }) => {
      const content = pathname === MEDIA_COLLECTION_PATH
        ? liveMediaEnvelope(value, previousEnvelope, MEDIA_POLICY_FINGERPRINT, startedAt, new Date()) : value;
      return writeMediaBlob(pathname === MEDIA_COLLECTION_PATH ? MEDIA_LIVE_COLLECTION_PATH : pathname, content, options);
    },
    isConflict: isMediaBlobConflict,
    refresh: (options: { curated: MediaCollection; previous: MediaCollection; youtubeApiKey: string; now: Date; onError: (message: string) => void }) => refreshMedia({ ...options,
      readySourceIntervalMs: previousEnvelope ? MIN_MEDIA_REFRESH_INTERVAL_MS : 0,
      fetcher: (input: string | URL | Request, init?: RequestInit) => fetch(input, { ...init, cache: "no-store",
        signal: init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline }),
    }),
  });
}
