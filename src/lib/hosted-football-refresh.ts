import "server-only";
import { loadBakedFootball } from "./football-snapshot";
import { refreshFootball } from "../../scripts/refresh-football.mjs";
import { coordinateFootballRefresh } from "./football-refresh-coordinator.mjs";
import { FOOTBALL_EDITION_PATH, footballEnvelope, validateFootballEnvelope } from "./football-envelope.mjs";
import { isMediaBlobConflict, readMediaBlob, writeMediaBlob } from "./media-blob-store";

/** One distributed publication, independent of build queues and page visits. */
export async function refreshHostedFootball() {
  if (!process.env.BLOB_STORE_ID || process.env.VERCEL_ENV !== "production") throw new Error("Hosted football refresh is not configured");
  const baked = await loadBakedFootball();
  const started = new Date();
  const deadline = AbortSignal.timeout(130_000);
  return coordinateFootballRefresh({ baked,
    read: async (pathname: string) => {
      const actual = pathname === "football/collection.json" ? FOOTBALL_EDITION_PATH : pathname;
      const record = await readMediaBlob(actual);
      return record && pathname === "football/collection.json"
        ? { value: validateFootballEnvelope(record.value).edition, etag: record.etag } : record;
    },
    write: async (pathname: string, value: unknown, options: { ifMatch?: string; createOnly?: boolean }) =>
      writeMediaBlob(pathname === "football/collection.json" ? FOOTBALL_EDITION_PATH : pathname,
        pathname === "football/collection.json" ? footballEnvelope(value, started, new Date()) : value, options),
    isConflict: isMediaBlobConflict,
    refresh: (options: Parameters<typeof refreshFootball>[0]) => refreshFootball({ ...options,
      fetcher: (input: string | URL | Request, init?: RequestInit) => fetch(input, { ...init, cache: "no-store",
        signal: init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline }),
    }),
  });
}
