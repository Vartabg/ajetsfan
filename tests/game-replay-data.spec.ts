import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { replayHref, replayView } from "../src/lib/game-replay";
import type { Snap, SnapGame } from "../src/lib/snap-types";

function snap(key: string, fields: Partial<Snap> = {}): Snap {
  return {
    key, quarter: 1, clock: 450, possession: "jets", down: 2, distance: 8, yardline: 40,
    before: [0, 0], after: [0, 0], drive: 1, wp: 0.5, delta: null, type: "pass", description: "Recorded action.", ...fields,
  };
}

function game(plays: Snap[]): SnapGame {
  return { id: "2024_01_NYJ_SF", date: "2024-09-09", opponent: "SF", home: false, final: [7, 3], source: "nflverse", plays };
}

function archive(id: string): SnapGame {
  const file = path.join(process.cwd(), "public", "data", "snaps", id.slice(0, 4) + ".json.gz");
  const season = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")) as { games: SnapGame[] };
  return season.games.find((g) => g.id === id)!;
}

test("stable source links and strict pace neighbors retain a between-moments selection", () => {
  const data = game([
    snap("50"), snap("981", { delta: 0.099 }), snap("72", { wp: 0.3, postWp: 0.85 }),
    snap("80", { delta: -0.1 }), snap("91", { quarter: 2 }), snap("105", { quarter: 2 }),
  ]);
  const first = replayView(data, undefined, "key")!;
  expect([first.play.key, first.first, first.previous, first.next]).toEqual(["50", "50", null, "80"]);
  expect(first.game).toEqual({ id: data.id, date: data.date, home: false, opponent: "SF", source: "nflverse" });
  expect(first.terminalScore).toBeNull();
  expect(first).not.toHaveProperty("plays");
  expect(first.game).not.toHaveProperty("final");
  const key = replayView(data, "72", "key")!, all = replayView(data, "72", "all")!;
  expect(key.play).toEqual(all.play);
  expect(key.index).toBe(2);
  expect([key.previous, key.next, key.reason]).toEqual(["50", "80", null]);
  expect([all.previous, all.next]).toEqual(["981", "80"]);
  expect(replayView(data, "80", "key")?.reason).toContain("fell 10 percentage points");
  expect(replayView(data, "91", "key")?.reason).toContain("First play of Q2");
  expect(replayView(data, "105", "key")?.next).toBeNull();
  expect(replayView(data, "not-a-source-key", "all")).toBeNull();
  expect(replayView(data, "", "key")).toBeNull();
  expect(replayView(game([]), undefined, "key")).toBeNull();
  expect(replayView(game([snap("17"), snap("17")]), "17", "key")).toBeNull();
  expect(replayHref("2022_02_NYJ_CLE")).toBe("/replay/2022_02_NYJ_CLE");
  expect(replayHref("2022_02_NYJ_CLE", "4276", "all")).toBe("/replay/2022_02_NYJ_CLE?play=4276&pace=all");
  expect(replayHref("bad/id", "?&", "key")).toBe("/replay/bad%2Fid?play=%3F%26");
});

test("score observations stop at the selected row, restart after a gap and preserve verified boundaries", () => {
  const data = game([
    snap("1", { after: [6, 0] }), snap("2", { before: [6, 0], after: [7, 0] }),
    snap("3", { before: [7, 0], after: null }), snap("4", { before: null, after: null }),
    snap("5", { before: null, after: [7, 3], description: "Later field goal." }),
  ]);
  const opening = replayView(data, undefined, "key")!;
  expect(opening.scoreTrail).toEqual([{ index: -1, score: [0, 0] }, { index: 0, score: [6, 0] }]);
  expect(JSON.stringify(opening)).not.toContain("Later field goal");
  const tryView = replayView(data, "2", "all")!;
  expect(tryView.scoreTrail.at(-1)).toEqual({ index: 1, score: [7, 0] });
  expect(tryView.scoreLabel).toBe("Score after this play");
  const partial = replayView(data, "3", "all")!;
  expect([partial.displayScore, partial.scoreLabel]).toEqual([[7, 0], "Score before this play"]);
  expect(partial.scoreTrail).toEqual(tryView.scoreTrail);
  const missing = replayView(data, "4", "all")!;
  expect(missing.scoreTrail).toEqual([]);
  expect(missing.displayScore).toBeNull();
  expect(missing.scoreLabel).toContain("unavailable");
  const end = replayView(data, "5", "key")!;
  expect(end.scoreTrail).toEqual([{ index: 4, score: [7, 3] }]);
  expect([end.last, end.next, end.terminalScore]).toEqual([true, null, [7, 3]]);
  expect(replayView({ ...data, final: [7, 7] }, "5", "key")?.terminalScore).toBeNull();
  const withBookend = { ...data, plays: [...data.plays, snap("6", { before: [7, 3], after: null })] };
  expect(replayView(withBookend, "2", "key")?.next).toBe("5");
  expect(replayView(withBookend, "5", "key")?.reason).toBe("Updated score recorded");
  expect(replayView(withBookend, "6", "key")?.terminalScore).toBeNull();
  const unknownOpening = replayView(archive("1999_01_NE_NYJ"), undefined, "key")!;
  expect(unknownOpening.scoreTrail).toEqual([{ index: 0, score: [0, 0] }]);
  const kickReturn = replayView(archive("2010_15_NYJ_PIT"), undefined, "key")!;
  expect(kickReturn.scoreTrail).toEqual([{ index: -1, score: [0, 0] }, { index: 0, score: [6, 0] }]);
});

test("real touchdown, try and takeaway remain independent while moving forward and back", () => {
  const data = archive("2022_02_NYJ_CLE");
  const td = replayView(data, "4199", "key")!, extra = replayView(data, td.next!, "key")!;
  expect([td.displayScore, extra.play.key, extra.displayScore, extra.previous]).toEqual([[30, 30], "4224", [31, 30], "4199"]);
  expect(replayView(data, extra.previous!, "key")).toEqual(td);
  const kick = replayView(data, "4240", "key")!;
  expect([kick.reason, kick.previous, kick.next]).toEqual([null, "4224", "4276"]);
  expect(replayView(data, "4240", "all")?.next).toBe("4255");
  expect(replayView(data, "4276", "key")?.reason).toContain("Interception");
  expect(replayView(data, "4307", "key")?.terminalScore).toEqual([31, 30]);
});

test("official turnovers include declined flags and compound returns, and exclude overturned calls", () => {
  expect(replayView(archive("1999_10_NYJ_NE"), "2411", "key")?.reason).toContain("Interception");
  expect(replayView(archive("1999_09_ARI_NYJ"), "1204", "key")?.reason ?? "").not.toContain("Interception");
  expect(replayView(archive("1999_09_ARI_NYJ"), "3288", "key")?.reason ?? "").not.toContain("Interception");
  const double = replayView(archive("2026_10_BUF_NYJ"), "3008", "key")!;
  expect(double.reason).toContain("Interception");
  expect(double.reason).toContain("Lost fumble");
  expect(replayView(archive("1999_01_NE_NYJ"), "3104", "key")?.reason).toContain("Turnover on downs");
  const older = game([snap("1"), snap("2", { facts: { kind: "interception" } }), snap("3")]);
  expect(replayView(older, "2", "key")?.reason).toBe("Interception");
});

test("both archive endpoints and the overtime opener can be traversed in either direction", () => {
  for (const id of ["1999_01_NE_NYJ", "2000_08_MIA_NYJ", "2026_10_BUF_NYJ"]) {
    const data = archive(id);
    for (const pace of ["key", "all"] as const) {
      const keys: string[] = [];
      let frame = replayView(data, undefined, pace)!;
      while (true) {
        expect(frame.previous).toBe(keys.at(-1) ?? null);
        keys.push(frame.play.key);
        if (!frame.next) break;
        frame = replayView(data, frame.next, pace)!;
      }
      expect(frame.play.key).toBe(data.plays.at(-1)?.key);
      expect(frame.terminalScore).toEqual(data.final);
      expect(new Set(keys).size).toBe(keys.length);
      if (pace === "all") expect(keys.length).toBe(data.plays.length);
      for (let i = keys.length - 2; i >= 0; i--) {
        frame = replayView(data, frame.previous!, pace)!;
        expect(frame.play.key).toBe(keys[i]);
      }
      expect(frame.previous).toBeNull();
    }
    if (id.startsWith("2000")) {
      const overtime = data.plays.find((row) => row.quarter === 5)!;
      expect(replayView(data, overtime.key, "key")?.reason).toContain("First play of overtime");
    }
  }
});
