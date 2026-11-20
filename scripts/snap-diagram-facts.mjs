const integer = (value, low, high) => Number.isSafeInteger(value) && value >= low && value <= high;
const directions = ['left', 'middle', 'right'];
const lateralFlags = ['lateral_reception', 'lateral_rush', 'lateral_return', 'lateral_recovery'];
const kickTypes = { kickoff: 'kickoff', punt: 'punt', field_goal: 'fieldGoal', extra_point: 'extraPoint' };

const credits = [
  ['sack', 'sack'], ['half_sack_1', 'halfSack'], ['half_sack_2', 'halfSack'],
  ['pass_defense_1', 'passDefended'], ['pass_defense_2', 'passDefended'],
  ...[1, 2].map((n) => [`solo_tackle_${n}`, 'soloTackle']),
  ...[1, 2].map((n) => [`tackle_with_assist_${n}`, 'tackleWithAssist']),
  ...[1, 2, 3, 4].map((n) => [`assist_tackle_${n}`, 'assistTackle']),
];
const usesTackleTeam = (prefix) => prefix.includes('tackle');
export const diagramColumns = [
  'defteam', 'pass_location', 'pass_length', 'run_location', 'run_gap', 'shotgun',
  'return_team', 'return_yards', 'touchback', 'kick_distance', 'field_goal_result', 'extra_point_result',
  'kickoff_attempt', 'punt_attempt', 'field_goal_attempt', 'punt_blocked', 'own_kickoff_recovery',
  'kickoff_fair_catch', 'kickoff_downed', 'kickoff_out_of_bounds', 'punt_fair_catch', 'punt_downed', 'punt_out_of_bounds',
  ...['kicker', 'punter', 'kickoff_returner', 'punt_returner', 'blocked', 'lateral_punt_returner', 'lateral_kickoff_returner']
    .flatMap((field) => [`${field}_player_name`, `${field}_player_id`]),
  ...credits.flatMap(([prefix]) => [`${prefix}_player_name`, `${prefix}_player_id`,
    ...(usesTackleTeam(prefix) ? [`${prefix}_team`] : [])]),
];

export function player(value, id) {
  if (typeof value !== 'string') return;
  const name = value.trim();
  if (!name || name.length > 100 || /^(?:na|none|null|team|unknown)$/i.test(name) || /[;,|/\n&]|\band\b/i.test(name)) return;
  if (id != null && (typeof id !== 'string' || /[;,|/\s&]/.test(id))) return;
  return name;
}

function credited(row, prefix) {
  const id = row[`${prefix}_player_id`];
  return typeof id === 'string' && !!id.trim() ? player(row[`${prefix}_player_name`], id) : undefined;
}

function ordinary(row) {
  return row.posteam && row.defteam && row.posteam !== row.defteam &&
    [row.posteam, row.defteam].every((team) => team === row.home_team || team === row.away_team) &&
    ['penalty', 'aborted_play', 'fumble', 'fumble_lost', 'safety', 'replay_or_challenge', ...lateralFlags]
      .every((field) => row[field] === 0) && row.play_deleted !== 1 &&
    !/\b(?:fumbl\w*|muff\w*|lateral\w*|backwards? pass|reverse|flea.flicker|penalt(?:y|ies)|no play|challeng\w*|review(?:ed)?|revers(?:ed|al)|aborted)\b/i.test(row.description);
}

function addCredits(facts, row, tackleTeam, passDefense, sack, opposingIds) {
  const seen = new Set();
  const players = [];
  for (const [prefix, role] of credits) {
    const tackle = usesTackleTeam(prefix);
    if (tackle ? !tackleTeam || row[`${prefix}_team`] !== tackleTeam : role === 'passDefended' ? !passDefense : !sack) continue;
    const name = credited(row, prefix);
    const id = row[`${prefix}_player_id`];
    if (name && !seen.has(id) && !opposingIds.includes(id)) {
      seen.add(id);
      players.push({ name, role });
    }
  }
  // Different credited people can share the abbreviated display name.
  const counts = new Map();
  for (const { name } of players) counts.set(name, (counts.get(name) ?? 0) + 1);
  const distinct = players.filter(({ name }) => counts.get(name) === 1);
  if (distinct.length) facts.defenders = distinct;
}

export function addScrimmageDiagram(facts, row) {
  if (!ordinary(row)) return;
  const { kind } = facts;
  if (row.shotgun === 1) facts.shotgun = true;
  if (kind === 'rush') {
    if (directions.includes(row.run_location)) facts.direction = row.run_location;
    if (['guard', 'tackle', 'end'].includes(row.run_gap)) facts.runGap = row.run_gap;
  } else if (['completion', 'incompletion', 'interception'].includes(kind)) {
    if (directions.includes(row.pass_location)) facts.direction = row.pass_location;
    if (['short', 'deep'].includes(row.pass_length)) facts.passLength = row.pass_length;
    if (kind === 'interception' && facts.interceptor && row.return_team === row.defteam && integer(row.return_yards, -120, 120)) {
      facts.interceptionReturnYards = row.return_yards;
    }
  }
  const offensiveIds = [facts.passer && row.passer_player_id, facts.rusher && row.rusher_player_id, facts.target && row.receiver_player_id];
  addCredits(facts, row, ['rush', 'sack', 'completion'].includes(kind) ? row.defteam : null,
    kind === 'incompletion' || kind === 'interception', kind === 'sack', offensiveIds);
}

export function addKickDiagram(facts, row) {
  const kind = kickTypes[row.play_type];
  if (!kind || !ordinary(row) || row.two_point_attempt !== 0 ||
    row.pass_attempt !== 0 || row.rush_attempt !== 0 || row.punt_blocked !== 0 || row.own_kickoff_recovery !== 0 ||
    row.blocked_player_id || row.lateral_punt_returner_player_id || row.lateral_kickoff_returner_player_id ||
    /\b(?:on[ -]?side|blocked|free kick|drop[ -]?kick|squib|fake[sd]?)\b/i.test(row.description) ||
    !Object.keys(kickTypes).every((type) => row[`${type}_attempt`] === Number(type === row.play_type))) return;
  const kick = { kind };
  const kicker = credited(row, kind === 'punt' ? 'punter' : 'kicker');
  if (kicker) kick.kicker = kicker;
  if (integer(row.kick_distance, 0, 120)) kick.kickYards = row.kick_distance;
  if (kind === 'fieldGoal' || kind === 'extraPoint') {
    const result = kind === 'fieldGoal' ? row.field_goal_result : row.extra_point_result;
    if (kind === 'fieldGoal' ? !['made', 'missed'].includes(result) : !['good', 'failed'].includes(result)) return;
    if (row.return_team || row.return_yards) return;
    kick.outcome = ['made', 'good'].includes(result) ? 'made' : 'missed';
  } else {
    // nflverse records possession for the receiving team on kickoffs and the kicking team on punts.
    const receiving = kind === 'kickoff' ? row.posteam : row.defteam;
    if (row.return_team && row.return_team !== receiving) return;
    if (row.touchback === 1) kick.touchback = true;
    const returner = row.return_team === receiving && credited(row, `${kind}_returner`);
    if (returner && !kick.touchback) {
      kick.returner = returner;
      if (['fair_catch', 'downed', 'out_of_bounds'].every((term) => row[`${kind}_${term}`] === 0) &&
        integer(row.return_yards, -120, 120)) {
        kick.returnYards = row.return_yards;
        addCredits(facts, row, kind === 'kickoff' ? row.defteam : row.posteam, false, false, [row[`${kind}_returner_player_id`]]);
      }
    }
  }
  if (Object.keys(kick).length > 1) facts.kick = kick;
}
