// Read the nfl4th snapshot offline with Python 3, pyreadr 0.5.9 and pandas:
// curl -fL https://github.com/nflverse/nfl4th/releases/download/nfl4th_infrastructure/pre_computed_go_boost.rds -o nfl4th.rds
// node scripts/import-fourth-down.mjs --source nfl4th.rds [--python /path/to/python]
// A new upstream snapshot requires updating the provenance below before rebuilding.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";
import { actualFourthDownCall, decisionSignature, featuredDecision, validDecisionOdds } from "../src/lib/fourth-down-study.ts";
import { publishedGames } from "../src/lib/published-pages.ts";
import { parseSnapSeason, snapMatchesFixture } from "../src/lib/snap-data.ts";

const { values } = parseArgs({ options: { source: { type: "string" }, python: { type: "string", default: "python3" }, output: { type: "string" } } });
if (!values.source) throw Error("Pass --source followed by the downloaded nfl4th RDS file.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const provenance = {
  model: "nfl4th", author: "Ben Baldwin", version: "1.0.7.9002", revision: "1aa982f4306e6a77091b97b3ada8f913b4850a3f",
  release: "nfl4th_infrastructure", asset: "pre_computed_go_boost.rds", releasedAt: "2026-11-22T18:04:47Z",
  sha256: "455ce01ad3328dae9052025bbd3387ea5ef99341d23b41005d2c0522a836e618",
};
const source = resolve(values.source);
if (createHash("sha256").update(await readFile(source)).digest("hex") !== provenance.sha256) {
  throw Error("The RDS checksum differs from the recorded release. Use the matching snapshot or review the new source.");
}
const decode = `
import json, pandas as pd, pyreadr, sys
d = pyreadr.read_r(sys.argv[1])[None]
if d.duplicated(["game_id", "play_id"]).any() or not ((d.play_id > 0) & (d.play_id % 1 == 0)).all():
    raise ValueError("Expected unique, integral nfl4th source keys")
rows = d.loc[d.game_id.str.contains(r"(?:^|_)NYJ(?:_|$)"), ["game_id", "play_id", "go_wp", "punt_wp", "fg_wp"]]
print(json.dumps([[g, str(int(p)), *[None if pd.isna(v) else v for v in wp]] for g,p,*wp in rows.itertuples(index=False,name=None)], allow_nan=False))
`;
const decoded = spawnSync(values.python, ["-c", decode, source], { encoding: "utf8", maxBuffer: 4_000_000 });
if (decoded.error) throw decoded.error;
if (decoded.status !== 0) throw Error("Could not decode nfl4th RDS.\n" + decoded.stderr);
const byKey = new Map(JSON.parse(decoded.stdout).map(([game, play, go, punt, fg]) =>
  [game + "/" + play, { go, punt, "field-goal": fg }]));
const readData = async name => JSON.parse(await readFile(join(root, "public/data", name + ".json"), "utf8"));
const fixtures = publishedGames(await readData("games"), await readData("current"));
const published = new Map(fixtures.map(f => [f.id, f]));
const years = [...new Set([...byKey.keys()].map(key => Number(key.slice(0, 4))))].sort((a, b) => a - b);
const rows = [];
for (const year of years) {
  const bytes = await readFile(join(root, "public/data/snaps", year + ".json.gz"));
  for (const game of parseSnapSeason(gunzipSync(bytes).toString("utf8"), year)) {
    if (!snapMatchesFixture(game, published.get(game.id))) continue;
    for (const play of game.plays) {
      const odds = byKey.get(game.id + "/" + play.key);
      if (!odds || !validDecisionOdds(odds)) continue;
      const actual = actualFourthDownCall(game, play);
      if (actual) rows.push({ game: game.id, play: play.key, spot: play.yardline, signature: decisionSignature(game, play, actual), ...odds });
    }
  }
}
rows.sort((a, b) => a.game < b.game ? -1 : a.game > b.game ? 1 : Number(a.play) - Number(b.play));
if (!rows.some(r => r.game === featuredDecision.game && r.play === featuredDecision.play)) throw Error("Missing featured decision.");
const body = '{"source":' + JSON.stringify(provenance) + ',"rows":[\n' + rows.map(r => JSON.stringify(r)).join(",\n") + "\n]}\n";
const output = resolve(values.output ?? join(root, "src/lib/fourth-down-model.json"));
const temp = output + "." + process.pid + ".tmp";
try {
  await writeFile(temp, body);
  await rename(temp, output);
} finally {
  await rm(temp, { force: true });
}
console.log(rows.length + " verified Jets decisions from " + years[0] + "–" + years.at(-1));
