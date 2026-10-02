export const NEXTGEN_SOURCES = {
  passing: 'https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/ngs_passing.csv.gz',
  receiving: 'https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/ngs_receiving.csv.gz',
  rushing: 'https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/ngs_rushing.csv.gz',
};

const MISSING = /^(?:NA|N\/A|null|NaN)$/i;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const IDENTITY = ['season', 'season_type', 'week', 'player_gsis_id', 'player_display_name', 'player_position', 'team_abbr'];
const CONFIG = {
  passing: { sample: 'attempts', sampleLabel: 'pass attempts', metrics: [
    ['avg_time_to_throw', 'Time to throw', 'seconds', 'Average snap-to-release time on pass attempts; sacks excluded.', 0],
    ['avg_intended_air_yards', 'Intended air yards', 'yards', 'Average target depth measured from the line of scrimmage.'],
    ['completion_percentage_above_expectation', 'Completion over expected', 'percent', 'Percentage points above the NGS completion-probability model; not an efficiency rank.', -100, 100],
    ['aggressiveness', 'Tight-window throws', 'percent', 'Share of attempts with a defender within one yard of the receiver at completion or incompletion.', 0, 100],
    ['expected_completion_percentage', 'Expected completion', 'percent', 'Average completion probability assigned by the NGS model.', 0, 100],
  ] },
  receiving: { sample: 'targets', sampleLabel: 'targets', metrics: [
    ['avg_separation', 'Target separation', 'yards', 'Average distance to the nearest defender at completion or incompletion, on targets; not all routes.', 0],
    ['avg_cushion', 'Cushion at snap', 'yards', 'Average distance to the aligned defender at the snap, for targeted receivers.', 0],
    ['avg_intended_air_yards', 'Target depth', 'yards', 'Average intended air yards on targets, measured from the line of scrimmage.'],
    ['avg_yac_above_expectation', 'YAC over expected', 'yards', 'Average yards after catch above the NGS expected-YAC model.'],
    ['percent_share_of_intended_air_yards', 'Air-yard share', 'percent', 'Share of the team’s intended air yards represented by this receiver’s targets.', 0, 100],
  ] },
  rushing: { sample: 'rush_attempts', sampleLabel: 'rush attempts', metrics: [
    ['rush_yards_over_expected_per_att', 'Rush yards over expected / carry', 'yards', 'Yards gained above the NGS rushing model per attempt; negative values mean fewer yards than expected.'],
    ['percent_attempts_gte_eight_defenders', 'Eight-plus defenders in box', 'percent', 'Share of rush attempts with at least eight defenders in the box at the snap.', 0, 100],
    ['avg_time_to_los', 'Time to line of scrimmage', 'seconds', 'Average time from the snap until the runner crosses the line of scrimmage.', 0],
    ['efficiency', 'Rushing efficiency', 'ratio', 'Total distance traveled divided by rushing yards gained; a lower ratio indicates a more direct path.'],
    ['rush_pct_over_expected', 'Rushes over expected', 'percent', 'Share of rush attempts gaining more yards than the NGS model expected. Source fractions are converted to percent.', 0, 1, 100],
  ] },
};

/** Parse quoted CSV without changing missing values into numbers. */
function parseCsv(text, label) {
  if (typeof text !== 'string' || !text.trim()) throw new Error(`Missing NGS ${label} CSV`);
  const records = [];
  let row = [], field = '', quoted = false, closed = false;
  const input = text.replace(/^\uFEFF/, '');
  const finishField = () => { row.push(field); field = ''; closed = false; };
  const finishRow = () => { finishField(); if (row.some((value) => value !== '')) records.push(row); row = []; };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === '"') {
      if (field || closed) throw new Error(`Invalid quoting in NGS ${label} CSV`);
      quoted = true;
    } else if (char === ',') finishField();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      finishRow();
    } else {
      if (closed) throw new Error(`Unexpected text after quote in NGS ${label} CSV`);
      field += char;
    }
  }
  if (quoted) throw new Error(`Unclosed quote in NGS ${label} CSV`);
  if (field || row.length || closed) finishRow();
  const headers = records.shift()?.map((header) => header.trim());
  if (!headers?.length || headers.some((header) => !header) || new Set(headers).size !== headers.length) throw new Error(`Invalid headers in NGS ${label} CSV`);
  for (const header of [...IDENTITY, CONFIG[label].sample]) if (!headers.includes(header)) throw new Error(`Missing NGS ${label} column: ${header}`);
  return records.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`Invalid NGS ${label} CSV row ${index + 2}`);
    return Object.fromEntries(headers.map((header, i) => [header, values[i].trim()]));
  });
}

function number(value, label, { required = false, integer = false, min = -Infinity, max = Infinity } = {}) {
  if (value === undefined || value === '' || MISSING.test(value)) {
    if (required) throw new Error(`Missing NGS ${label}`);
    return null;
  }
  if (!NUMBER.test(value)) throw new Error(`Invalid NGS ${label}: ${value}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed)) || parsed < min || parsed > max) throw new Error(`Invalid NGS ${label}: ${value}`);
  return parsed;
}

function readRows(csv, kind, maxYear) {
  const seen = new Set();
  return parseCsv(csv, kind).map((row) => {
    const year = number(row.season, `${kind} season`, { required: true, integer: true, min: 2016, max: maxYear });
    const week = number(row.week, `${kind} week`, { required: true, integer: true, min: 0, max: 30 });
    if (!['REG', 'POST'].includes(row.season_type)) throw new Error(`Invalid NGS ${kind} season type: ${row.season_type}`);
    if (!/^\d{2}-\d{7}$/.test(row.player_gsis_id) || !row.player_display_name || !row.player_position ||
        (row.team_abbr && !/^[A-Z]{2,3}$/.test(row.team_abbr))) throw new Error(`Invalid NGS ${kind} player identity`);
    const key = `${year}/${row.season_type}/${week}/${row.player_gsis_id}`;
    if (seen.has(key)) throw new Error(`Duplicate NGS ${kind} player row: ${key}`);
    seen.add(key);
    return { row, year, week };
  });
}

function buildPlayers(rows, kind, year) {
  const config = CONFIG[kind];
  return rows.filter((entry) => entry.year === year && entry.week === 0 && entry.row.season_type === 'REG' && entry.row.team_abbr === 'NYJ').map(({ row }) => {
    const sample = number(row[config.sample], `${kind} ${config.sample}`, { required: true, integer: true, min: 1 });
    const metrics = config.metrics.flatMap(([id, label, unit, note, min, max, scale = 1]) => {
      const value = number(row[id], `${kind} ${id}`, { min, max });
      return value === null ? [] : [{ id, label, value: value * scale, unit, note }];
    });
    const teams = [...new Set(rows.filter((entry) => entry.year === year && entry.row.season_type === 'REG' && entry.row.player_gsis_id === row.player_gsis_id)
      .map((entry) => entry.row.team_abbr).filter(Boolean))].sort();
    return { id: row.player_gsis_id, name: row.player_display_name, team: 'NYJ', position: row.player_position, sample, sampleLabel: config.sampleLabel, metrics,
      ...(teams.length > 1 ? { teams } : {}) };
  }).sort((a, b) => b.sample - a.sample || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Use published REG week-0 season aggregates, never an average of weekly rates. */
export function buildNextGenCollection({ passingCsv, receivingCsv, rushingCsv, checkedAt, sourceUpdatedAt }) {
  if (typeof checkedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(checkedAt) || !Number.isFinite(Date.parse(checkedAt))) throw new Error('Invalid NGS checkedAt');
  const now = new Date(checkedAt), maxYear = now.getUTCFullYear();
  // January and February belong to the preceding football season.
  const currentSeason = maxYear - (now.getUTCMonth() < 2 ? 1 : 0);
  if (sourceUpdatedAt !== undefined && (typeof sourceUpdatedAt !== 'string' || !sourceUpdatedAt.trim() || sourceUpdatedAt.length > 100)) throw new Error('Invalid NGS sourceUpdatedAt');
  const inputs = { passing: passingCsv, receiving: receivingCsv, rushing: rushingCsv };
  const datasets = Object.fromEntries(Object.entries(inputs).map(([kind, csv]) => [kind, readRows(csv, kind, maxYear)]));
  const years = [...new Set(Object.values(datasets).flatMap((rows) => rows.filter((entry) => entry.week === 0 && entry.row.season_type === 'REG' && entry.row.team_abbr === 'NYJ').map((entry) => entry.year)))].sort((a, b) => b - a);
  const seasons = years.map((year) => ({
    year, phase: 'regular',
    passing: buildPlayers(datasets.passing, 'passing', year), receiving: buildPlayers(datasets.receiving, 'receiving', year), rushing: buildPlayers(datasets.rushing, 'rushing', year),
    notes: [
      'Published NGS-qualified regular-season aggregates with a Jets team tag. Workload minimums vary by statistic and period; this is not the complete roster.',
      'Traded-player season aggregates may include production with every club, not only the Jets. Weekly team tags identify additional clubs when available.',
      'Missing measurements are omitted. No league rank or percentile is inferred from this qualified-player sample.',
      ...(year >= currentSeason ? ['Season-to-date snapshot; this season may still be in progress.'] : []),
    ],
  }));
  return { schemaVersion: 1, checkedAt, sources: { ...NEXTGEN_SOURCES }, ...(sourceUpdatedAt !== undefined ? { sourceUpdatedAt } : {}), seasons };
}
