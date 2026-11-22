import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { withClevelandDriveLineups } from '../src/lib/cleveland-drive-lineups.ts';
import { parseSnapSeason } from '../src/lib/snap-data.ts';
import { parseParticipationSeason, withParticipation } from '../src/lib/snap-participation.ts';

const season = (dir) => gunzipSync(readFileSync(new URL(`../public/data/${dir}/2022.json.gz`, import.meta.url))).toString('utf8');
const game = parseSnapSeason(season('snaps'), 2022).find((g) => g.id === '2022_02_NYJ_CLE');
const charted = withParticipation(game, parseParticipationSeason(season('participation'), 2022));
const get = (g, key) => g.plays.find((p) => p.key === key);

// nflverse participation GSIS IDs, repeated on the three independently joined rows.
const offenseCore = ['00-0026158','00-0032234','00-0032466','00-0033011','00-0034270','00-0036924','00-0036979','00-0038114'];
const defenseCore = ['00-0033570','00-0033927','00-0034856','00-0036266','00-0036282','00-0036915','00-0036996','00-0037250','00-0037314'];
const receivers = {
  '4155': ['00-0033871','00-0036980','00-0037740'],
  '4177': ['00-0033871','00-0034419','00-0035510'],
  '4199': ['00-0034419','00-0036980','00-0037740'],
};
const front = { '4155': ['00-0035654','00-0037251'], '4177': ['00-0033868','00-0034842'], '4199': ['00-0033868','00-0034842'] };
const named = (p) => [p.name, p.number, p.position];

test('three Cleveland snaps independently resolve 11+11 exact IDs and game-specific positions', () => {
  const shown = withClevelandDriveLineups(charted);
  assert.deepEqual(shown.plays.filter((p) => p.facts?.onField).map((p) => p.key), ['4155','4177','4199']);
  for (const key of Object.keys(receivers)) {
    const { offense, defense, quarterbackHitBy } = get(shown, key).facts.onField;
    assert.deepEqual(offense.map((p) => p.id).sort(), [...offenseCore, ...receivers[key]].sort());
    assert.deepEqual(defense.map((p) => p.id).sort(), [...defenseCore, ...front[key]].sort());
    assert.equal(new Set([...offense, ...defense].map((p) => p.id)).size, 22);
    assert.deepEqual(offense.filter((p) => ['LT','LG','C','RG','RT'].includes(p.position)).map(named),
      [['George Fant',76,'LT'], ['Laken Tomlinson',78,'LG'], ['Connor McGovern',60,'C'], ['Alijah Vera-Tucker',75,'RG'], ['Max Mitchell',61,'RT']]);
    assert.deepEqual(named(defense.find((p) => p.id === '00-0037250')), ['Martin Emerson',23,'CB']);
    if (key === '4177') {
      assert.equal(quarterbackHitBy, '00-0033868');
      assert.deepEqual(named(defense.find((p) => p.id === quarterbackHitBy)), ['Myles Garrett',95,'DE']);
      assert.equal(get(shown, key).facts.target, undefined);
      assert.equal(get(shown, key).facts.airYards, undefined);
    } else assert.equal(quarterbackHitBy, undefined);
    assert.equal(get(charted, key).facts.onField, undefined);
  }
  assert.equal(get(shown, '4199').facts.charting.coverage, 'COVER_6');
  assert.deepEqual([get(shown, '4155').facts.airYards, get(shown, '4199').facts.airYards], [11, 14]);
});

test('the hit and participants require the exact game, unique play and matching situation', () => {
  for (const override of [{ source: 'espn' }, { date: '2022-09-19' }, { home: true }, { opponent: 'BUF' }, { final: [30,30] }, { id: '2022_03_NYJ_CLE' }]) {
    const other = { ...charted, ...override };
    assert.equal(withClevelandDriveLineups(other), other);
  }
  const play = get(charted, '4177');
  const changed = (diff) => withClevelandDriveLineups({ ...charted, plays: [{ ...play, ...diff }] }).plays[0].facts;
  for (const diff of [{ key: '4178' }, { possession: 'opponent' }, { quarter: 3 }, { clock: 25 }, { down: 3 },
    { distance: 9 }, { yardline: 16 }, { drive: 18 }, { before: [23,30] }, { after: [24,29] }, { type: 'run' },
    { facts: { ...play.facts, passer: 'Different QB' } }, { facts: { ...play.facts, target: 'G.Wilson' } },
    { facts: { ...play.facts, direction: 'left' } }, { facts: { ...play.facts, charting: { formation: 'SHOTGUN' } } }]) {
    assert.equal(changed(diff).onField, undefined);
  }
  const duplicate = withClevelandDriveLineups({ ...game, plays: [play, play, get(game, '4199')] });
  assert.deepEqual(duplicate.plays.map((p) => !!p.facts.onField), [false, false, true]);
  // The verified source list also works when the optional general charting file is unavailable.
  assert.equal(get(withClevelandDriveLineups(game), '4177').facts.onField.offense.length, 11);
  const rawFour = { ...play.facts, airYards: 4 };
  assert.equal(changed({ facts: rawFour }).airYards, undefined);
  assert.equal(rawFour.airYards, 4);
});
