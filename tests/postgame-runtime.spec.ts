import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { DrivesFile } from "../src/lib/drives";
import type { LeagueHistory } from "../src/lib/league-history";

test("published drive seasons and history share no-store runtime URLs without losing historical charts", async ({ request }) => {
  for (const season of [2026, 2010]) {
    const expected = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/drives", `${season}.json`), "utf8")) as DrivesFile;
    for (const url of [`/api/football/drives/${season}`, `/data/drives/${season}.json`]) {
      const response = await request.get(url);
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toContain("no-store");
      const actual = await response.json() as DrivesFile;
      expect(actual.season).toBe(season);
      expect(actual.source).toBe(expected.source);
      expect(actual.games).toEqual(expected.games);
      expect(Object.keys(actual.games).length).toBeGreaterThan(0);
    }
  }
  const expected = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/league-history.json"), "utf8")) as LeagueHistory;
  for (const url of ["/api/football/league-history", "/data/league-history.json"]) {
    const response = await request.get(url);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const actual = await response.json() as LeagueHistory;
    expect(actual.source).toBe(expected.source);
    expect(actual.checkedAt).toBe(expected.checkedAt);
    expect(actual.games).toHaveLength(expected.games.length);
    expect(actual.games.some((game) => game.status === "final" && game.qb !== null)).toBe(true);
  }
});

test("unknown or malformed drive seasons return a no-store 404 instead of an empty success", async ({ request }) => {
  for (const season of ["unknown", "2026-extra", "1998", "2201", "2099"]) {
    const response = await request.get(`/api/football/drives/${season}`);
    expect(response.status()).toBe(404);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.json()).toEqual({ status: "not_found" });
  }
  const publicMissing = await request.get("/data/drives/2099.json");
  expect(publicMissing.status()).toBe(404);
  expect(publicMissing.headers()["cache-control"]).toContain("no-store");
});
