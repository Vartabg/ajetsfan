import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { footballSnapshot } from "./football-snapshot";
import { loadFootballState } from "./load-football";
import { ANALYSIS_EDITION_PATH, type AnalysisEdition } from "./load-analysis";
import { coordinateAnalysisRefresh } from "./analysis-refresh-coordinator.mjs";
import { refreshAnalysis } from "../../scripts/refresh-analysis.mjs";
import { readMediaBlob, writeMediaBlob, isMediaBlobConflict } from "./media-blob-store";
import type { Game } from "./games";
import type { SeasonAnalytics } from "./analytics";
import type { RankingsCollection } from "./season-rankings";
import type { NextGenCollection } from "./nextgen-stats";

/** Native extraction is isolated to this timer; pages only read published JSON. */
export async function refreshHostedAnalysis() {
  if (!process.env.BLOB_STORE_ID || process.env.VERCEL_ENV !== "production") throw new Error("Hosted analysis refresh is not configured");
  const deadline = AbortSignal.timeout(500_000);
  return coordinateAnalysisRefresh({ collectionPath: ANALYSIS_EDITION_PATH,
    read: readMediaBlob, write: writeMediaBlob, isConflict: isMediaBlobConflict,
    refresh: async (options: { previous: AnalysisEdition | null; now: Date }) => {
      const [football, games, analytics, rankingsCollection, nextgen] = await Promise.all([
        loadFootballState(), footballSnapshot<Game[]>("games.json"), footballSnapshot<SeasonAnalytics>("analytics.json"),
        footballSnapshot<RankingsCollection>("season-rankings.json"), footballSnapshot<NextGenCollection>("nextgen-stats.json"),
      ]);
      return refreshAnalysis({ ...options, football: football.edition,
        baked: { current: football.edition.current, coverage: football.edition.coverage, games, analytics, rankingsCollection, nextgen },
        fetcher: (input: string | URL | Request, init?: RequestInit) => fetch(input, { ...init, cache: "no-store",
          signal: init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline }),
        onError: () => console.error("Analysis provider unavailable; retaining checked evidence."),
        readCurve: async (gameId: string, pathname?: string) => {
          if (!/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(gameId)) throw new Error("Invalid curve identity");
          if (pathname) {
            if (!/^analysis\/v1\/curves\/[a-f0-9]{64}\.json$/.test(pathname)) throw new Error("Invalid curve edition");
            const record = await readMediaBlob(pathname);
            if (!Array.isArray(record?.value)) throw new Error("Curve edition missing");
            return record.value;
          }
          return JSON.parse(await readFile(path.join(process.cwd(), "public/data/curves", `${gameId}.json`), "utf8"));
        },
        writeCurve: async (pathname: string, points: unknown) => {
          const digest = createHash("sha256").update(JSON.stringify(points)).digest("hex");
          if (pathname !== `analysis/v1/curves/${digest}.json`) throw new Error("Invalid immutable curve");
          try { await writeMediaBlob(pathname, points, { createOnly: true }); }
          catch (error) {
            if (!isMediaBlobConflict(error)) throw error;
            const record = await readMediaBlob(pathname);
            if (!record || JSON.stringify(record.value) !== JSON.stringify(points)) throw new Error("Curve publication conflict");
          }
        },
      });
    },
  });
}
