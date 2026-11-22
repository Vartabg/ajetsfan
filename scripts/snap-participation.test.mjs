import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';
import { DuckDBInstance } from '@duckdb/node-api';
import { parseParticipationSeason, participationProvenance, withParticipation } from '../src/lib/snap-participation.ts';
import { refreshParticipation } from './snap-participation.mjs';

const id = '2019_12_OAK_NYJ';
const fixture = { id, season: 2019, week: 12, seasonType: 'REG', date: '2019-11-24', atHome: true,
  opponent: 'LV', opponentDisplay: 'OAK', jetsScore: 34, oppScore: 3, outcome: 'win', swing: 0.25 };
const first = { key: '101', quarter: 1, clock: 800, possession: 'opponent', down: 1, distance: 10, yardline: 75,
  before: [0,0], after: [0,0], drive: 1, wp: null, delta: null, type: 'pass', description: 'Pass incomplete.',
  facts: { kind: 'incompletion' } };
const game = { id, date: fixture.date, home: true, opponent: 'LV', source: 'nflverse', final: [34,3],
  plays: ['101','102','103','104','105'].map((key) => ({ ...first, key })) };
const row = { key: '101', team: 'OAK', charting: { formation: 'SHOTGUN', box: 5, rushers: 0, primaryRoute: 'POST' } };
const pack = (plays) => ({ schemaVersion: 1, season: 2019, provenance: participationProvenance(2019), games: [{ id, plays }] });
const open = (value) => parseParticipationSeason(JSON.stringify(value), 2019);

test('participation validates its source, labels and ranges and joins without mutating the base game', () => {
  const edition = open(pack([row, { ...row, key: '102', team: 'NYJ' }, { ...row, key: '103', team: 'BUF' }]));
  const updated = withParticipation(game, edition);
  assert.deepEqual(updated.plays[0].facts.charting, row.charting);
  assert.equal(game.plays[0].facts.charting, undefined);
  assert.equal(updated.plays[1], game.plays[1]);
  assert.equal(updated.plays[2], game.plays[2]);
  assert.equal(withParticipation({ ...game, source: 'espn' }, edition).plays[0].facts.charting, undefined);
  assert.equal(withParticipation({ ...game, id: '2019_12_NYJ_BUF' }, edition).plays[0].facts.charting, undefined);
  const run = withParticipation({ ...game, plays: [{ ...first, facts: { kind: 'rush' } }] }, edition);
  assert.deepEqual(run.plays[0].facts.charting, { formation: 'SHOTGUN', box: 5 });
  const bad = [pack([row, row]), pack([{ ...row, key: '0101' }]), { ...pack([row]), provenance: participationProvenance(2023) },
    ...[{ rushers: 12 }, { box: '0' }, { primaryRoute: 'SOME UNKNOWN' }, { offensePersonnel: '12 RB' },
      { defensePersonnel: '1 LB, 3 LB' }, { defensePersonnel: '6 DB, 6 LB' }, { defensePersonnel: '3 BAD' }].map((charting) => pack([{ ...row, charting }]))];
  for (const record of bad) assert.throws(() => open(record), /Invalid/);
});

test('independent offline publication skips ambiguous identities, keeps matched partial fields, and preserves an existing edition on failure', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'snap-participation-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const dataDir = path.join(temp, 'data');
  const sourceDir = path.join(temp, 'sources');
  const source = path.join(sourceDir, 'participation', '2019.parquet');
  await Promise.all([mkdir(path.dirname(source), { recursive: true }), mkdir(path.join(dataDir, 'snaps'), { recursive: true })]);
  await Promise.all([
    writeFile(path.join(dataDir, 'games.json'), JSON.stringify([fixture])),
    writeFile(path.join(dataDir, 'current.json'), JSON.stringify({ schemaVersion: 1, season: 2019, checkedAt: '2019-12-31T12:00:00Z', schedule: [{ ...fixture, status: 'final' }] })),
    writeFile(path.join(dataDir, 'snaps', '2019.json.gz'), gzipSync(JSON.stringify({ schemaVersion: 1, season: 2019, games: [game] }))),
  ]);
  const instance = await DuckDBInstance.create(':memory:');
  const db = await instance.connect();
  t.after(() => { db.closeSync(); instance.closeSync(); });
  await db.run(`COPY (SELECT '${id}' nflverse_game_id, * FROM (VALUES
    (101,'OAK','SHOTGUN',0), (102,'NYJ','SHOTGUN',2), (103,'OAK','SHOTGUN',1), (103,'OAK','EMPTY',2),
    (104,'OAK','UNRECOGNIZED',5), (105,'OAK',NULL,14)) t(play_id,possession_team,offense_formation,number_of_pass_rushers))
    TO '${source.replaceAll("'", "''")}' (FORMAT parquet)`);
  const opts = { dataDir, sourceDir, full: true, fetcher: () => { throw Error('Unexpected network request'); }, onWarning() {} };
  assert.deepEqual(await refreshParticipation(opts), [2019]);
  const target = path.join(dataDir, 'participation', '2019.json.gz');
  const bytes = await readFile(target);
  const edition = parseParticipationSeason(gunzipSync(bytes).toString(), 2019).get(id);
  assert.deepEqual([...edition.keys()], ['101','104']);
  assert.deepEqual(edition.get('101').charting, { formation: 'SHOTGUN', rushers: 0 });
  assert.deepEqual(edition.get('104').charting, { rushers: 5 });
  assert.deepEqual(await refreshParticipation(opts), []);
  assert.deepEqual(await readFile(target), bytes);
  await rm(source);
  assert.deepEqual(await refreshParticipation(opts), []);
  await writeFile(source, 'truncated source');
  await assert.rejects(refreshParticipation(opts));
  assert.deepEqual(await readFile(target), bytes);
});

test('the published Wilson and Davis rows agree with their source charting and the uncharted current game still has action facts', async () => {
  const base = path.join(process.cwd(), 'public', 'data');
  const snap = async (year, id) => JSON.parse(gunzipSync(await readFile(path.join(base, 'snaps', year + '.json.gz')))).games.find((g) => g.id === id);
  const g = await snap(2022, '2022_02_NYJ_CLE');
  const edition = parseParticipationSeason(gunzipSync(await readFile(path.join(base, 'participation', '2022.json.gz'))).toString(), 2022);
  const plays = withParticipation(g, edition).plays;
  const wilson = plays.find((p) => p.key === '4199').facts;
  const davis = plays.find((p) => p.key === '4276').facts;
  assert.deepEqual(wilson.charting, { formation: 'SHOTGUN', offensePersonnel: '1 RB, 1 TE, 3 WR', defensePersonnel: '4 DL, 2 LB, 5 DB',
    box: 5, rushers: 4, primaryRoute: 'POST', coverage: 'COVER_6', manZone: 'ZONE_COVERAGE' });
  assert.deepEqual([wilson.direction, wilson.passLength, wilson.shotgun], ['middle', 'short', true]);
  assert.deepEqual([davis.direction, davis.interceptionReturnYards, davis.charting.coverage], ['left', 14, 'COVER_2']);
  const older = parseParticipationSeason(gunzipSync(await readFile(path.join(base, 'participation', '2016.json.gz'))).toString(), 2016);
  // The source lists ten offensive participants and a 4–2–5 defense on this snap.
  const shortUnit = older.get('2016_02_NYJ_BUF').get('603').charting;
  assert.deepEqual([shortUnit.formation, shortUnit.offensePersonnel, shortUnit.defensePersonnel], ['SHOTGUN', undefined, '4 DL, 2 LB, 5 DB']);
  const buffalo = await snap(2026, '2026_10_BUF_NYJ');
  const facts = (key) => buffalo.plays.find((p) => p.key === key).facts;
  assert.deepEqual(facts('2511').defenders, [{ name: 'D.Belton', role: 'assistTackle' }, { name: 'M.Moore', role: 'assistTackle' }]);
  assert.deepEqual([facts('2511').direction, facts('2511').airYards, facts('2511').afterCatch], ['right', 21, 33]);
  assert.equal(facts('2511').charting, undefined);
  assert.deepEqual(facts('40').kick, { kind: 'kickoff', kicker: 'A.Beck', kickYards: 63, returner: 'G.Dortch', returnYards: 26 });
  assert.deepEqual(facts('40').defenders, [{ name: 'I.Davis', role: 'soloTackle' }]);
  assert.deepEqual(facts('244').kick, { kind: 'punt', kicker: 'T.Doman', kickYards: 34, returner: 'I.Williams' });
  assert.deepEqual(facts('780').kick, { kind: 'kickoff', kicker: 'T.Doman', kickYards: 65, touchback: true });
  assert.deepEqual(facts('1114').kick, { kind: 'fieldGoal', kicker: 'J.Sanders', kickYards: 41, outcome: 'made' });
});
