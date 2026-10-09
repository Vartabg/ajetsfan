import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildTradeLedger, DRAFT_SOURCE, parseDraftPicks, parseTrades, refreshTrades, TRADES_SOURCE, validateLedger } from './draft-trades.mjs';

const TRADES = 'trade_id,season,trade_date,gave,received,pick_season,pick_round,pick_number,conditional,pfr_id,pfr_name';
const DRAFT = 'season,round,pick,team,gsis_id,pfr_player_id,cfb_player_id,pfr_player_name,hof,position,category,side,college';
const trades = (...rows) => parseTrades([TRADES, ...rows].join('\n'));
const draft = (...rows) => parseDraftPicks([DRAFT, ...rows].join('\n'));

test('a pick the Jets gave is followed to its selection, and a pick they received through a second trade', () => {
  const ledger = buildTradeLedger(trades(
    '10,2018,2018-03-17,IND,NYJ,2018,1,3,0,DarnSa00,Sam Darnold',
    '10,2018,2018-03-17,NYJ,IND,2018,1,6,0,NelsQu00,Quenton Nelson',
    '10,2018,2018-03-17,NYJ,IND,2019,2,34,0,,',
    '11,2019,2019-04-26,IND,CLE,2019,2,34,0,,', // Indianapolis moves the 2019 pick again
    '11,2019,2019-04-26,CLE,IND,2019,2,46,0,,',
    '12,2026,2026-03-09,NYJ,MIA,2026,7,,0,,', // unnumbered future pick for a player
    '12,2026,2026-03-09,MIA,NYJ,,,,,FitzMi00,Minkah Fitzpatrick',
  ), draft(
    '2018,1,3,NYJ,00-0034869,DarnSa00,,Sam Darnold,FALSE,QB,QB,O,USC',
    '2018,1,6,IND,00-0034835,NelsQu00,,Quenton Nelson,FALSE,G,OL,O,Notre Dame',
    '2019,2,34,CLE,00-0035000,Ya-SRo00,,Example Pick,FALSE,CB,DB,D,Temple',
    '2019,2,46,IND,00-0035001,SomeOn00,,Other Pick,FALSE,LB,LB,D,Ohio State',
    '1998,1,1,IND,,,,Peyton Manning,TRUE,QB,QB,O,Tennessee', // before the archive floor
  ));
  assert.deepEqual(ledger.map((trade) => trade.id), ['12', '10']);
  const darnold = ledger[1];
  assert.deepEqual(darnold.partners, ['IND']);
  assert.equal(darnold.received[0].became.type, 'selected');
  assert.equal(darnold.received[0].became.player.name, 'Sam Darnold');
  assert.equal(darnold.received[0].became.agreed, true);
  assert.equal(darnold.gave[0].became.player.college, 'Notre Dame');
  const moved = darnold.gave[1].became;
  assert.equal(moved.type, 'traded');
  assert.deepEqual([moved.to, moved.date], ['CLE', '2019-04-26']);
  assert.deepEqual([moved.packagedWith, moved.repeated], [0, false]);
  assert.equal(moved.received[0].became.player.name, 'Other Pick');
  const fitzpatrick = ledger[0];
  assert.deepEqual(fitzpatrick.received[0], { kind: 'player', id: 'FitzMi00', name: 'Minkah Fitzpatrick' });
  assert.deepEqual(fitzpatrick.gave[0].became, { type: 'unnumbered' });
});

test('selections disagreeing with the holder are flagged, future picks stay pending, and PFR codes map to nflverse codes', () => {
  const ledger = buildTradeLedger(trades(
    '20,2024,2024-04-25,NYJ,GB,2024,1,25,0,,',
    '20,2024,2024-04-25,GB,NYJ,2027,4,,1,,',
  ), draft('2024,1,25,KAN,00-0039999,,,Someone Else,FALSE,WR,WR,O,Texas'));
  assert.equal(ledger[0].gave[0].became.team, 'KC');
  assert.equal(ledger[0].gave[0].became.agreed, false);
  assert.deepEqual(ledger[0].received[0], { kind: 'pick', season: 2027, round: 4, number: null, conditional: true, became: { type: 'unnumbered' } });
  assert.deepEqual(ledger[0].partners, ['GB']);
});

test('malformed rows fail before anything is written', () => {
  assert.throws(() => trades('1,2018,2018-03-17,NYJ,NYJ,2018,1,3,0,,'), /Invalid trade teams/);
  const rejected = [];
  assert.equal(parseTrades([TRADES, '2,2025,2025-11-03,BAL,TEN,4,,,1,,', '3,2025,2025-11-03,BAL,TEN,2026,4,,1,,'].join('\n'), { onReject: (message) => rejected.push(message) }).length, 1);
  assert.match(rejected[0], /Trade 2 .*Invalid pick season/);
  assert.throws(() => trades('2,2025,2025-11-03,BAL,NYJ,4,,,1,,'), /Invalid pick season/);
  assert.throws(() => trades('1,2018,2018-02-30,NYJ,IND,2018,1,3,0,,'), /Invalid trade date/);
  assert.throws(() => trades('1,2018,2018-03-17,NYJ,IND,,,,,,'), /Empty trade asset/);
  assert.throws(() => draft('2018,1,3,NYJ,,,,A,FALSE,QB,QB,O,USC', '2018,1,3,IND,,,,B,FALSE,QB,QB,O,USC'), /Duplicate draft pick/);
  assert.throws(() => validateLedger({ schemaVersion: 1, checkedAt: 'now', trades: [] }), /Invalid trade ledger/);
  assert.throws(() => buildTradeLedger(trades('1,2018,2018-03-17,NYJ,IND,2018,1,3,0,,', '1,2019,2018-03-17,IND,NYJ,2018,1,6,0,,'), draft('2018,1,3,IND,,,,A,FALSE,QB,QB,O,USC')), /Inconsistent trade rows/);
});

test('two picks leaving in the same later deal print that deal once and count what went with them', () => {
  const ledger = buildTradeLedger(trades(
    '30,2020,2020-07-25,SEA,NYJ,2021,1,23,1,,',
    '30,2020,2020-07-25,SEA,NYJ,2021,3,86,1,,',
    '30,2020,2020-07-25,NYJ,SEA,,,,,AdamJa00,Jamal Adams',
    '31,2021,2021-04-29,NYJ,MIN,2021,1,23,0,,',
    '31,2021,2021-04-29,NYJ,MIN,2021,3,86,0,,',
    '31,2021,2021-04-29,MIN,NYJ,2021,1,14,0,,',
  ), draft('2021,1,14,NYJ,00-0036979,,,Alijah Vera-Tucker,FALSE,OL,OL,O,USC'));
  const [first, second] = ledger.find((trade) => trade.id === '30').received;
  assert.deepEqual([first.became.packagedWith, first.became.repeated, first.became.received.length], [1, false, 1]);
  assert.equal(first.became.received[0].became.player.name, 'Alijah Vera-Tucker');
  assert.deepEqual([second.became.tradeId, second.became.packagedWith, second.became.repeated, second.became.received], ['31', 1, true, []]);
});

const TRADE_ROWS = [
  '10,2018,2018-03-17,IND,NYJ,2018,1,3,0,DarnSa00,Sam Darnold',
  '10,2018,2018-03-17,NYJ,IND,2018,1,6,0,NelsQu00,Quenton Nelson',
];
const DRAFT_ROWS = [
  '2018,1,3,NYJ,00-0034869,DarnSa00,,Sam Darnold,FALSE,QB,QB,O,USC',
  '2018,1,6,IND,00-0034835,NelsQu00,,Quenton Nelson,FALSE,G,OL,O,Notre Dame',
];
const checked = new Date('2026-10-08T12:00:00.000Z');
const attempted = new Date('2026-10-09T12:00:00.000Z');

function tradeFetcher({ rows = TRADE_ROWS, draftRows = DRAFT_ROWS, fail = null } = {}) {
  return async (url) => {
    if (url === fail) return new Response('upstream unavailable', { status: 503 });
    assert.ok([TRADES_SOURCE, DRAFT_SOURCE].includes(url));
    return new Response((url === TRADES_SOURCE ? [TRADES, ...rows] : [DRAFT, ...draftRows]).join('\n'));
  };
}

async function tradeFile(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ajetsfan-trades-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return path.join(directory, 'draft-trades.json');
}

test('a trade refresh publishes a complete ready snapshot and advances only successful check times', async (t) => {
  const out = await tradeFile(t);
  const first = await refreshTrades({ out, now: checked, fetcher: tradeFetcher() });
  assert.equal(first.status, 'ready');
  assert.equal(first.checkedAt, checked.toISOString());
  assert.equal(first.attemptedAt, checked.toISOString());
  const firstBytes = await readFile(out, 'utf8');
  const next = await refreshTrades({ out, now: attempted, fetcher: tradeFetcher(), beforePromote: async () => {
    assert.equal(await readFile(out, 'utf8'), firstBytes, 'the prior publication stays readable until promotion');
  } });
  assert.equal(next.checkedAt, attempted.toISOString());
  assert.equal(next.status, 'ready');
  assert.deepEqual(JSON.parse(await readFile(out, 'utf8')), next);
  assert.deepEqual(await readdir(path.dirname(out)), ['draft-trades.json']);
});

test('independent trade or draft source outages retain validated data and its successful check time', async (t) => {
  for (const fail of [TRADES_SOURCE, DRAFT_SOURCE]) {
    const out = await tradeFile(t);
    const first = await refreshTrades({ out, now: checked, fetcher: tradeFetcher() });
    const warnings = [];
    const retained = await refreshTrades({ out, now: attempted, fetcher: tradeFetcher({ fail }), onError: (message) => warnings.push(message) });
    assert.equal(retained.status, 'retained');
    assert.equal(retained.checkedAt, first.checkedAt);
    assert.equal(retained.attemptedAt, attempted.toISOString());
    assert.deepEqual(retained.trades, first.trades);
    assert.deepEqual(retained.counts, first.counts);
    assert.deepEqual(JSON.parse(await readFile(out, 'utf8')), retained);
    assert.match(warnings[0], /Trade ledger retained: Source HTTP 503/);
  }
});

test('malformed replacements and regressions cannot erase previously verified Jets trades', async (t) => {
  const replacements = [
    { rows: ['10,2018,2018-03-17,NYJ,NYJ,2018,1,3,0,,'], reason: /Invalid trade teams/ },
    { draftRows: [DRAFT_ROWS[0], DRAFT_ROWS[0]], reason: /Duplicate draft pick/ },
    { rows: ['11,2026,2026-03-09,NYJ,MIA,2027,7,,0,,'], reason: /lost previously verified trade IDs/ },
  ];
  for (const { reason, ...replacement } of replacements) {
    const out = await tradeFile(t);
    const first = await refreshTrades({ out, now: checked, fetcher: tradeFetcher() });
    const warnings = [];
    const retained = await refreshTrades({ out, now: attempted, fetcher: tradeFetcher(replacement), onError: (message) => warnings.push(message) });
    assert.deepEqual(retained, { ...first, attemptedAt: attempted.toISOString(), status: 'retained' });
    assert.match(warnings[0], reason);
  }
});

test('a first refresh failure does not fabricate an empty or successfully checked ledger', async (t) => {
  const out = await tradeFile(t);
  await assert.rejects(refreshTrades({ out, now: checked, fetcher: tradeFetcher({ fail: TRADES_SOURCE }) }), /Source HTTP 503/);
  await assert.rejects(readFile(out), { code: 'ENOENT' });
  assert.deepEqual(await readdir(path.dirname(out)), []);
});

test('invalid persisted ledgers are rejected rather than retained as trusted data', async (t) => {
  const out = await tradeFile(t);
  const first = await refreshTrades({ out, now: checked, fetcher: tradeFetcher() });
  first.trades[0].received[0].became.player.name = '';
  const invalidBytes = JSON.stringify(first);
  await writeFile(out, invalidBytes);
  await assert.rejects(refreshTrades({ out, now: attempted, fetcher: tradeFetcher({ fail: TRADES_SOURCE }) }), /Invalid selected pick outcome/);
  assert.equal(await readFile(out, 'utf8'), invalidBytes);
});

test('a failed atomic promotion preserves the prior bytes and cleans its temporary file', async (t) => {
  const out = await tradeFile(t);
  await refreshTrades({ out, now: checked, fetcher: tradeFetcher() });
  const firstBytes = await readFile(out, 'utf8');
  const warnings = [];
  await assert.rejects(refreshTrades({ out, now: attempted, fetcher: tradeFetcher(), onError: (message) => warnings.push(message),
    beforePromote: async () => { throw new Error('promotion unavailable'); },
  }), /promotion unavailable/);
  assert.equal(await readFile(out, 'utf8'), firstBytes);
  assert.deepEqual(await readdir(path.dirname(out)), ['draft-trades.json']);
  assert.deepEqual(warnings, [], 'publication failure is not reported as an upstream source outage');
});
