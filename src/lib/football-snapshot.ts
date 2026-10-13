import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import type { CurrentSnapshot } from "./current";
import type { CoverageSnapshot } from "./coverage";

export async function footballSnapshot<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(process.cwd(), "public/data", name), "utf8")) as T;
}

/** Explicit compiled reads keep route enumeration independent of runtime credentials. */
export const loadBakedFootball = cache(async () => {
  const [current, coverage] = await Promise.all([
    footballSnapshot<CurrentSnapshot>("current.json"), footballSnapshot<CoverageSnapshot>("coverage.json"),
  ]);
  return { schemaVersion: 1 as const, current, coverage, live: null,
    scheduleCheck: { source: current.sources.schedule, status: "ready" as const,
      checkedAt: current.checkedAt, attemptedAt: current.checkedAt } };
});
