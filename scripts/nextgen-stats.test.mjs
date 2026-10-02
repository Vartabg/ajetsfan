import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNextGenCollection, NEXTGEN_SOURCES } from './nextgen-stats.mjs';

const common = { season: '2024', season_type: 'REG', week: '0', player_gsis_id: '00-0037740', player_display_name: 'Garrett Wilson', player_position: 'WR', team_abbr: 'NYJ' };
const passing = { ...common, player_gsis_id: '00-0030565', player_display_name: 'Geno Smith', player_position: 'QB', attempts: '120', avg_time_to_throw: '2.7', avg_intended_air_yards: '7.5', completion_percentage_above_expectation: '-2.5', aggressiveness: '14.5', expected_completion_percentage: '62.5' };
const receiving = { ...common, targets: '100', avg_separation: '2.5', avg_cushion: '5.5', avg_intended_air_yards: '10.2', avg_yac_above_expectation: '-0.4', percent_share_of_intended_air_yards: '32.5' };
const rushing = { ...common, player_gsis_id: '00-0038120', player_display_name: 'Breece Hall', player_position: 'RB', rush_attempts: '200', rush_yards_over_expected_per_att: '-0.15', percent_attempts_gte_eight_defenders: '25', avg_time_to_los: '2.6', efficiency: '4.2', rush_pct_over_expected: '0.333333333333333' };
const quote = (value) => /[",\r\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);
const csv = (rows, template) => {
  const headers = [...new Set([...Object.keys(template), ...rows.flatMap((row) => Object.keys(row))])];
  return [headers.join(','), ...rows.map((row) => headers.map((key) => quote(row[key] ?? '')).join(','))].join('\r\n');
};
const build = ({ pass = [passing], receive = [receiving], rush = [rushing], checkedAt = '2026-10-02T14:00:00.000Z', ...extra } = {}) => buildNextGenCollection({
  passingCsv: csv(pass, passing), receivingCsv: csv(receive, receiving), rushingCsv: csv(rush, rushing), checkedAt, ...extra,
});

test('uses Jets REG week-zero aggregates without averaging weekly rows or mixing playoffs', () => {
  const result = build({ receive: [receiving, { ...receiving, week: '1', targets: '10', avg_separation: '9' },
    { ...receiving, season_type: 'POST', targets: '5', avg_separation: '8' },
    { ...receiving, player_gsis_id: '00-0030000', team_abbr: 'BUF' }] });
  assert.equal(result.schemaVersion, 1);
  assert.deepEqual(result.sources, NEXTGEN_SOURCES);
  assert.equal(result.seasons.length, 1);
  assert.equal(result.seasons[0].phase, 'regular');
  assert.equal(result.seasons[0].receiving.length, 1);
  assert.equal(result.seasons[0].receiving[0].sample, 100);
  assert.equal(result.seasons[0].receiving[0].metrics.find((metric) => metric.id === 'avg_separation').value, 2.5);
});

test('converts only the fraction-based rushing rate and keeps signed model differences', () => {
  const season = build().seasons[0];
  const rush = season.rushing[0].metrics;
  assert.ok(Math.abs(rush.find((metric) => metric.id === 'rush_pct_over_expected').value - 100 / 3) < 1e-10);
  assert.equal(rush.find((metric) => metric.id === 'percent_attempts_gte_eight_defenders').value, 25);
  assert.equal(rush.find((metric) => metric.id === 'rush_yards_over_expected_per_att').value, -0.15);
  assert.equal(season.passing[0].metrics.find((metric) => metric.id === 'completion_percentage_above_expectation').value, -2.5);
});

test('missing measurements are omitted while a measured zero remains zero', () => {
  const result = build({ rush: [{ ...rushing, rush_yards_over_expected_per_att: '', avg_time_to_los: 'NA', efficiency: 'null', rush_pct_over_expected: 'NaN', percent_attempts_gte_eight_defenders: '0' }] });
  assert.deepEqual(result.seasons[0].rushing[0].metrics.map(({ id, value }) => [id, value]), [['percent_attempts_gte_eight_defenders', 0]]);
});

test('keeps provider traded-player aggregate and identifies additional weekly clubs without inventing games', () => {
  const result = build({ receive: [{ ...receiving, player_display_name: 'Davante Adams', targets: '141' }, { ...receiving, week: '2', team_abbr: 'LV', targets: '9' }] });
  assert.deepEqual(result.seasons[0].receiving[0].teams, ['LV', 'NYJ']);
  assert.equal(result.seasons[0].receiving[0].sample, 141);
  assert.equal(result.seasons[0].receiving[0].games, undefined);
  assert.ok(result.seasons[0].notes.some((note) => note.includes('every club')));
});

test('sorts years and workload deterministically and marks current season as a snapshot', () => {
  const result = build({ receive: [receiving, { ...receiving, season: '2026' }, { ...receiving, player_gsis_id: '00-0039890', player_display_name: 'Adonai Mitchell', targets: '20' }] });
  assert.deepEqual(result.seasons.map((season) => season.year), [2026, 2024]);
  assert.equal(result.seasons[1].receiving[0].name, 'Garrett Wilson');
  assert.ok(result.seasons[0].notes.some((note) => note.includes('Season-to-date')));
  assert.ok(!result.seasons[1].notes.some((note) => note.includes('Season-to-date')));
});

test('supports quoted commas, escaped quotes, CRLF, and a UTF-8 BOM', () => {
  const passingCsv = '\uFEFF' + csv([{ ...passing, player_display_name: 'Smith, "Geno"' }], passing) + '\r\n';
  const result = build({ passingCsv });
  assert.equal(result.seasons[0].passing[0].name, 'Smith, "Geno"');
});

test('allows known missing non-Jets team tags without assigning a club', () => {
  const result = build({ pass: [passing, { ...passing, player_gsis_id: '00-0029604', team_abbr: '' }] });
  assert.equal(result.seasons[0].passing.length, 1);
});

test('rejects duplicates rather than silently double-counting', () => {
  assert.throws(() => build({ receive: [receiving, receiving] }), /Duplicate NGS receiving/);
  assert.throws(() => build({ receive: [receiving, { ...receiving, week: '1' }, { ...receiving, week: '1' }] }), /Duplicate NGS receiving/);
});

test('rejects malformed seasons, weeks, samples and measured numeric values', () => {
  for (const season of ['2024oops', '2015', '2027', '2024.5']) assert.throws(() => build({ receive: [{ ...receiving, season }] }), /season/);
  assert.throws(() => build({ receive: [{ ...receiving, week: '-1' }] }), /week/);
  for (const targets of ['0', '', 'NA', '10.5', '1e999']) assert.throws(() => build({ receive: [{ ...receiving, targets }] }), /targets/);
  assert.throws(() => build({ receive: [{ ...receiving, avg_separation: 'Infinity' }] }), /avg_separation/);
  assert.throws(() => build({ rush: [{ ...rushing, rush_pct_over_expected: '33' }] }), /rush_pct_over_expected/);
});

test('rejects malformed CSV and missing required columns', () => {
  assert.throws(() => build({ passingCsv: 'season,season\n2024,2024' }), /headers/);
  assert.throws(() => build({ passingCsv: 'season,week\n2024,0' }), /column/);
  assert.throws(() => build({ passingCsv: csv([passing], passing) + '\n"unfinished' }), /Unclosed quote/);
  assert.throws(() => build({ passingCsv: csv([passing], passing) + '\nbroken,row' }), /CSV row/);
});

test('uses the preceding football season in January and preserves source timestamp separately', () => {
  const result = build({ receive: [{ ...receiving, season: '2025' }], checkedAt: '2026-01-12T14:00:00.000Z', sourceUpdatedAt: '2026-01-12 09:25:08 EST' });
  assert.equal(result.sourceUpdatedAt, '2026-01-12 09:25:08 EST');
  assert.ok(result.seasons[0].notes.some((note) => note.includes('Season-to-date')));
  assert.throws(() => build({ checkedAt: 'not a timestamp' }), /checkedAt/);
});
