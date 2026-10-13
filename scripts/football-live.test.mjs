import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshLiveFootball, validateLiveFootball, footballScheduleSource, footballSummarySource } from './football-live.mjs';
import { mergeConfirmedFootballSchedule } from './refresh-football.mjs';

const now = new Date('2026-10-13T17:00:00.000Z');
const schedule = [
  { id: '2026_05_CLE_NYJ', season: 2026, week: 5, seasonType: 'REG', date: '2026-10-11', kickoff: '2026-10-11T17:00:00.000Z', opponent: 'CLE', opponentDisplay: 'CLE', atHome: true },
  { id: '2026_06_NYJ_NE', season: 2026, week: 6, seasonType: 'REG', date: '2026-10-18', kickoff: '2026-10-18T17:00:00.000Z', opponent: 'NE', opponentDisplay: 'NE', atHome: false },
];
const finalStatus = { period: 4, displayClock: '0:00', type: { name: 'STATUS_FINAL', state: 'post', completed: true, detail: 'Final' } };
const liveStatus = { period: 3, displayClock: '9:17', type: { name: 'STATUS_IN_PROGRESS', state: 'in', completed: false, detail: '9:17 - 3rd Quarter' } };
const preStatus = { period: 0, displayClock: '0:00', type: { name: 'STATUS_SCHEDULED', state: 'pre', completed: false, detail: 'Sun, October 18th at 1:00 PM EDT' } };
const competitor = (id, abbreviation, homeAway, score) => ({ id, homeAway, team: { id, abbreviation, displayName: abbreviation }, score: { value: score, displayValue: String(score) } });
const event = (index, status, jetsScore = 17, oppScore = 12) => ({ id: index === 0 ? '401872983' : '401873001', date: schedule[index].kickoff,
  season: { year: 2026 }, week: { number: schedule[index].week }, competitions: [{ id: index === 0 ? '401872983' : '401873001', status,
    competitors: index === 0 ? [competitor('20', 'NYJ', 'home', jetsScore), competitor('5', 'CLE', 'away', oppScore)]
      : [competitor('17', 'NE', 'home', oppScore), competitor('20', 'NYJ', 'away', jetsScore)] }] });
const category = () => ({ name: 'passing', keys: ['completions/passingAttempts', 'passingYards', 'yardsPerPassAttempt', 'passingTouchdowns', 'interceptions', 'sacks-sackYardsLost', 'adjQBR', 'QBRating'],
  athletes: [{ athlete: { id: '15864', displayName: 'Geno Smith' }, stats: ['17/30', '182', '6.1', '1', '0', '4-40', '27.2', '85.7'] }] });
function fixtures() {
  const played = event(0, structuredClone(finalStatus));
  const body = { team: { id: '20', abbreviation: 'NYJ' }, season: { year: 2026, type: 2 }, requestedSeason: { year: 2026, type: 2 }, events: [played, event(1, structuredClone(preStatus), 0, 0)] };
  const summary = { header: { id: played.id, season: { year: 2026, type: 2 }, week: 5,
    competitions: [{ ...structuredClone(played.competitions[0]), date: played.date }] }, boxscore: {
    players: [{ team: { id: '20', abbreviation: 'NYJ' }, statistics: [category()] }],
    teams: [{ team: { id: '20' }, statistics: [{ name: 'netPassingYards', label: 'Passing', displayValue: '142' }] }],
  } };
  return { body, summary };
}
async function refresh({ body, summary } = fixtures(), options = {}) {
  const requests = [];
  const feed = await refreshLiveFootball({ season: 2026, schedule, now, ...options,
    fetcher: options.fetcher ?? (async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify(url === footballScheduleSource(2026) ? body : summary));
    }),
  });
  return { feed, requests };
}

test('confirmed score and latest boxscore match schedule identity while upcoming zero placeholders remain unknown', async () => {
  const { feed, requests } = await refresh();
  assert.equal(feed.status, 'ready'); assert.equal(feed.checkedAt, now.toISOString());
  assert.equal(feed.featured.gameId, '2026_05_CLE_NYJ'); assert.equal(feed.featured.eventId, '401872983');
  assert.equal(feed.featured.state, 'final'); assert.equal(feed.featured.jetsScore, 17); assert.equal(feed.featured.oppScore, 12);
  assert.equal(feed.featured.provisional, false);
  assert.deepEqual(feed.featured.players[0], { espnId: '15864', name: 'Geno Smith', position: 'Unknown',
    passing: { completions: 17, attempts: 30, yards: 182, touchdowns: 1, interceptions: 0 }, rushing: null, receiving: null });
  assert.equal(feed.featured.teamStats[0].displayValue, '142');
  assert.equal(feed.games[1].jetsScore, null); assert.equal(feed.games[1].oppScore, null);
  assert.deepEqual(requests.map((request) => request.url), [footballScheduleSource(2026), footballSummarySource('401872983')]);
  for (const { init } of requests) { assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store'); assert.ok(init.signal instanceof AbortSignal); }
});

test('live boxscore remains explicitly provisional and can advance to a confirmed final without a deployment', async () => {
  const input = fixtures(); input.body.events[0].competitions[0].status = structuredClone(liveStatus);
  input.summary.header.competitions[0].status = structuredClone(liveStatus);
  const live = (await refresh(input)).feed;
  assert.equal(live.featured.state, 'live'); assert.equal(live.featured.provisional, true);
  assert.equal(live.featured.clock, '9:17'); assert.equal(live.featured.period, 3);
  input.summary.header.competitions[0].status = structuredClone(finalStatus);
  // Actual summary headers omit clock/period, unlike the schedule response.
  delete input.summary.header.competitions[0].status.period;
  delete input.summary.header.competitions[0].status.displayClock;
  const final = (await refresh(input, { previous: live, now: new Date(now.getTime() + 60_000) })).feed;
  assert.equal(final.featured.state, 'final'); assert.equal(final.featured.provisional, false);
  assert.equal(final.featured.clock, null); assert.equal(final.featured.period, 0);
  assert.ok(final.checkedAt > live.checkedAt);
});

test('a later authoritative summary correction replaces prior final points and player counters', async () => {
  const previous = (await refresh()).feed, input = fixtures();
  input.summary.header.competitions[0].competitors[0].score.value = 18;
  input.summary.boxscore.players[0].statistics[0].athletes[0].stats[1] = '183';
  const corrected = (await refresh(input, { previous, now: new Date(now.getTime() + 60_000) })).feed;
  assert.equal(corrected.status, 'ready'); assert.equal(corrected.featured.jetsScore, 18);
  assert.equal(corrected.featured.players[0].passing.yards, 183);
});

test('a future flex-time placeholder remains unknown instead of blocking current scores or inheriting a guessed kickoff', async () => {
  const input = fixtures();
  input.body.events[1].date = '2026-10-18T05:00Z';
  input.body.events[1].competitions[0].status.isTBDFlex = true;
  const { feed } = await refresh(input);
  assert.equal(feed.status, 'ready'); assert.equal(feed.games[1].kickoff, null);
  assert.equal(feed.games[1].jetsScore, null);
});

test('a verified game may start up to thirty minutes late while larger or cross-date kickoff mismatches fail closed', async () => {
  const input = fixtures();
  input.body.events[0].date = '2026-10-11T17:25:00.000Z';
  input.summary.header.competitions[0].date = input.body.events[0].date;
  const delayed = (await refresh(input)).feed;
  assert.equal(delayed.status, 'ready'); assert.equal(delayed.featured.kickoff, '2026-10-11T17:25:00.000Z');
  for (const at of ['2026-10-11T17:31:00.000Z', '2026-10-12T17:00:00.000Z']) {
    input.body.events[0].date = at; input.summary.header.competitions[0].date = at;
    assert.equal((await refresh(input)).feed.status, 'unavailable');
  }
});

test('wrong source owner, season, matchup, kickoff, future final, and fabricated status never create a ready edition', async () => {
  const changes = [
    (x) => { x.body.team.id = '19'; }, (x) => { x.body.season.year = 2025; },
    (x) => { x.body.events[0].season.year = 2025; }, (x) => { x.body.events[0].competitions[0].competitors[0].team.id = '19'; },
    (x) => { x.body.events[0].competitions[0].competitors[1].team.abbreviation = 'BUF'; },
    (x) => { x.body.events[0].date = '2026-10-11T18:00Z'; }, (x) => { x.body.events[0].date = '2026-02-30T17:00Z'; },
    (x) => { x.body.events[0].competitions[0].status.type.name = 'FAKE_FINAL'; },
    (x) => { x.body.events[0].competitions[0].status.type.completed = false; },
    (x) => { x.body.events[1].competitions[0].status = structuredClone(finalStatus); },
    (x) => { x.body.events.push(structuredClone(x.body.events[0])); },
  ];
  for (const change of changes) {
    const input = fixtures(); change(input);
    const { feed } = await refresh(input);
    assert.equal(feed.status, 'unavailable'); assert.equal(feed.checkedAt, null); assert.deepEqual(feed.games, []);
  }
});

test('summary identity mismatch or source outage retains exact prior payload and successful date', async () => {
  const previous = (await refresh()).feed, later = new Date(now.getTime() + 60_000);
  const changes = [
    (x) => { x.summary.header.id = '401873001'; }, (x) => { x.summary.header.season.year = 2025; },
    (x) => { x.summary.header.competitions[0].date = '2026-10-11T18:00Z'; },
    (x) => { x.summary.header.competitions[0].competitors[1].team.abbreviation = 'BUF'; },
    (x) => { x.summary.header.competitions[0].status = structuredClone(preStatus); },
    (x) => { x.summary.boxscore.players[0].team.id = '19'; },
    (x) => { x.summary.boxscore.players[0].statistics[0].keys[1] = 'fakeYards'; },
    (x) => { x.summary.boxscore.players[0].statistics[0].athletes[0].stats[0] = '31/30'; },
  ];
  for (const change of changes) {
    const input = fixtures(); change(input);
    const { feed } = await refresh(input, { previous, now: later });
    assert.equal(feed.status, 'retained'); assert.equal(feed.checkedAt, previous.checkedAt); assert.equal(feed.attemptedAt, later.toISOString());
    assert.deepEqual(feed.games, previous.games); assert.deepEqual(feed.featured, previous.featured);
  }
  const messages = [];
  const { feed } = await refresh(fixtures(), { previous, now: later, onError: (message) => messages.push(message), fetcher: async () => { throw new Error('private-provider-request-detail'); } });
  assert.equal(feed.status, 'retained'); assert.deepEqual(feed.featured, previous.featured);
  assert.ok(messages.every((message) => !message.includes('private-provider')));
});

test('response limits and invalid prior cache fail closed without inventing checks', async () => {
  for (const response of [new Response('not JSON'), new Response('', { status: 503 }), new Response('{}', { headers: { 'content-length': '3000001' } })]) {
    assert.equal((await refresh(fixtures(), { fetcher: async () => response })).feed.status, 'unavailable');
  }
  const previous = (await refresh()).feed;
  await assert.rejects(refresh(fixtures(), { previous: { ...previous, games: [{ ...previous.games[0], jetsScore: -1 }] } }), /Invalid live football/);
  assert.throws(() => validateLiveFootball({ ...previous, featured: { ...previous.featured, eventId: 'foreign' } }), /Invalid live football/);
});

test('an upstream regression cannot turn a previously confirmed final back into a live or scheduled game', async () => {
  const previous = (await refresh()).feed;
  for (const status of [preStatus, liveStatus]) {
    const input = fixtures();
    input.body.events[0].competitions[0].status = structuredClone(status);
    input.summary.header.competitions[0].status = structuredClone(status);
    const { feed } = await refresh(input, { previous, now: new Date(now.getTime() + 60_000) });
    assert.equal(feed.status, 'retained'); assert.deepEqual(feed.featured, previous.featured);
  }
});

function postseasonFixtures() {
  const postseasonSchedule = [
    { id: '2010_17_BUF_NYJ', season: 2010, week: 17, seasonType: 'REG', date: '2011-01-02', kickoff: '2011-01-02T18:00:00.000Z', opponent: 'BUF', opponentDisplay: 'BUF', atHome: true },
    { id: '2010_19_NYJ_NE', season: 2010, week: 19, seasonType: 'POST', date: '2011-01-16', kickoff: '2011-01-16T21:30:00.000Z', opponent: 'NE', opponentDisplay: 'NE', atHome: false },
  ];
  const regular = { id: '310102020', date: postseasonSchedule[0].kickoff, season: { year: 2010 }, week: { number: 17 }, competitions: [
    { id: '310102020', status: structuredClone(finalStatus), competitors: [competitor('20', 'NYJ', 'home', 38), competitor('2', 'BUF', 'away', 7)] },
  ] };
  const playoff = { id: '310116017', date: postseasonSchedule[1].kickoff, season: { year: 2010 }, week: { number: 2, text: 'Divisional Round' }, competitions: [
    { id: '310116017', status: structuredClone(liveStatus), competitors: [competitor('17', 'NE', 'home', 17), competitor('20', 'NYJ', 'away', 18)] },
  ] };
  const body = (type, events) => ({ team: { id: '20', abbreviation: 'NYJ' }, season: { year: 2026, type: 2 }, requestedSeason: { year: 2010, type }, events });
  const summary = { header: { id: playoff.id, season: { year: 2010, type: 3 }, week: 2,
    competitions: [{ ...structuredClone(playoff.competitions[0]), date: playoff.date }] }, boxscore: {
    players: [{ team: { id: '20', abbreviation: 'NYJ' }, statistics: [category()] }],
    teams: [{ team: { id: '20' }, statistics: [{ name: 'netPassingYards', label: 'Passing', displayValue: '142' }] }],
  } };
  return { schedule: postseasonSchedule, regular: body(2, [regular]), playoff: body(3, [playoff]), summary };
}
async function refreshPostseason(input = postseasonFixtures(), options = {}) {
  const requests = [];
  const feed = await refreshLiveFootball({ season: 2010, schedule: input.schedule, now: new Date('2011-01-16T22:00:00.000Z'), ...options,
    fetcher: async (url) => {
      requests.push(url);
      return new Response(JSON.stringify(url === footballScheduleSource(2010) ? input.regular
        : url === footballScheduleSource(2010, 'POST') ? input.playoff : input.summary));
    },
  });
  return { feed, requests };
}

test('playoff rounds map to an existing NFLverse identity and advance from live to final with phase provenance', async () => {
  const input = postseasonFixtures(), { feed, requests } = await refreshPostseason(input);
  assert.equal(feed.status, 'ready'); assert.equal(feed.featured.gameId, '2010_19_NYJ_NE');
  assert.equal(feed.featured.week, 19); assert.equal(feed.featured.providerWeek, 2); assert.equal(feed.featured.state, 'live');
  assert.equal(feed.featured.provisional, true); assert.equal(feed.featured.source, footballScheduleSource(2010, 'POST'));
  assert.deepEqual(feed.sources, [footballScheduleSource(2010), footballScheduleSource(2010, 'POST')]);
  assert.deepEqual(requests, [...feed.sources, footballSummarySource('310116017')]);
  input.summary.header.competitions[0].status = structuredClone(finalStatus);
  input.summary.header.competitions[0].competitors[0].score.value = 21;
  input.summary.header.competitions[0].competitors[1].score.value = 28;
  const completed = (await refreshPostseason(input, { previous: feed, now: new Date('2011-01-16T22:01:00.000Z') })).feed;
  assert.equal(completed.status, 'ready'); assert.equal(completed.featured.state, 'final'); assert.equal(completed.featured.provisional, false);
  const scheduled = input.schedule.map((game) => ({ ...game, status: 'scheduled', jetsScore: null, oppScore: null, outcome: null }));
  const confirmed = mergeConfirmedFootballSchedule(scheduled, null, completed, { checkedAt: completed.checkedAt });
  const final = confirmed.find((game) => game.id === '2010_19_NYJ_NE');
  assert.equal(final.jetsScore, 28); assert.equal(final.scoreSource, footballScheduleSource(2010, 'POST'));
});

test('a playoff kickoff after UTC midnight maps to the actual Eastern NFL game date', async () => {
  const input = postseasonFixtures(), game = input.schedule[1], event = input.playoff.events[0];
  Object.assign(game, { id: '2010_18_NYJ_IND', week: 18, date: '2011-01-08', kickoff: '2011-01-09T01:00:00.000Z', opponent: 'IND', opponentDisplay: 'IND' });
  event.date = game.kickoff; event.week.number = 1; event.week.text = 'Wild Card'; event.competitions[0].competitors[0] = competitor('11', 'IND', 'home', 16);
  input.summary.header.week = 1; input.summary.header.competitions[0] = { ...structuredClone(event.competitions[0]), date: event.date };
  const { feed } = await refreshPostseason(input, { now: new Date('2011-01-09T03:00:00.000Z') });
  assert.equal(feed.status, 'ready'); assert.equal(feed.featured.gameId, '2010_18_NYJ_IND'); assert.equal(feed.featured.providerWeek, 1);
});

test('unknown playoff rounds and ambiguous or mismatched game identities are rejected without guessed week offsets', async () => {
  const changes = [
    (input) => { input.playoff.events[0].week.number = 5; },
    (input) => { input.playoff.requestedSeason.type = 2; },
    (input) => { input.playoff.events[0].date = '2011-01-17T21:30:00.000Z'; },
    (input) => { input.playoff.events[0].competitions[0].competitors[0].team.abbreviation = 'PIT'; },
    (input) => { input.schedule.push({ ...input.schedule[1], id: '2010_20_NYJ_NE', week: 20 }); },
    (input) => { input.summary.header.week = 19; },
    (input) => { input.summary.header.season.type = 2; },
  ];
  const previous = (await refreshPostseason()).feed;
  for (const change of changes) {
    const input = postseasonFixtures(); change(input);
    const { feed } = await refreshPostseason(input, { previous, now: new Date('2011-01-16T22:01:00.000Z') });
    assert.equal(feed.status, 'retained'); assert.equal(feed.checkedAt, previous.checkedAt);
    assert.deepEqual(feed.games, previous.games); assert.deepEqual(feed.sources, previous.sources);
  }
  const fabricated = { ...previous, games: previous.games.map((game) => game.seasonType === 'POST' ? { ...game, source: footballScheduleSource(2010) } : game), featured: null };
  assert.throws(() => validateLiveFootball(fabricated), /Invalid live football/);
});
