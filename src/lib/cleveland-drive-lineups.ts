import type { Snap, SnapGame, SnapParticipant } from "./snap-types";

/**
 * NYJ at CLE, 2022 REG week 2. The two per-play GSIS lists were independently
 * joined to that week's team roster, then cross-checked against the numeric IDs
 * in players_on_play. Source order carries no information about alignment.
 *
 * NFL Next Gen Stats via nflverse. Selected and joined data use CC BY-SA 4.0.
 * https://creativecommons.org/licenses/by-sa/4.0/
 * https://github.com/nflverse/nflverse-data/releases/download/pbp_participation/pbp_participation_2022.parquet
 * https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_2022.parquet
 * NFL gamebook, starting positions, substitutions, and the 0:30 QB hit
 * https://static.www.nfl.com/image/upload/v1677628106/gamecenter/7ae81ee8-d24c-11ec-b23d-d15a91047884.pdf
 * nflverse play-by-play, same game and play keys, including qb_hit_1_player_id
 * https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2022.parquet
 */
const player = (id: string, name: string, position: string, number: number): SnapParticipant =>
  ({ id, name, position, number });
const jets = {
  flacco: player("00-0026158", "Joe Flacco", "QB", 19),
  fant: player("00-0032466", "George Fant", "LT", 76),
  tomlinson: player("00-0032234", "Laken Tomlinson", "LG", 78),
  mcgovern: player("00-0033011", "Connor McGovern", "C", 60),
  veraTucker: player("00-0036979", "Alijah Vera-Tucker", "RG", 75),
  mitchell: player("00-0038114", "Max Mitchell", "RT", 61),
  carter: player("00-0036924", "Michael Carter", "RB", 32),
  conklin: player("00-0034270", "Tyler Conklin", "TE", 83),
  moore: player("00-0036980", "Elijah Moore", "WR", 8),
  wilson: player("00-0037740", "Garrett Wilson", "WR", 17),
  davis: player("00-0033871", "Corey Davis", "WR", 84),
  berrios: player("00-0034419", "Braxton Berrios", "WR", 10),
  smith: player("00-0035510", "Jeff Smith", "WR", 16),
};
const browns = {
  thomas: player("00-0037314", "Isaiah Thomas", "DE", 58),
  wright: player("00-0037251", "Alex Wright", "DE", 94),
  winovich: player("00-0035654", "Chase Winovich", "DE", 69),
  elliott: player("00-0036266", "Jordan Elliott", "DT", 96),
  garrett: player("00-0033868", "Myles Garrett", "DE", 95),
  bryan: player("00-0034842", "Taven Bryan", "DT", 99),
  walker: player("00-0033570", "Anthony Walker", "MLB", 5),
  owusuKoramoah: player("00-0036915", "Jeremiah Owusu-Koramoah", "OLB", 28),
  newsome: player("00-0036996", "Greg Newsome", "CB", 20),
  ward: player("00-0034856", "Denzel Ward", "CB", 21),
  emerson: player("00-0037250", "Martin Emerson", "CB", 23),
  delpit: player("00-0036282", "Grant Delpit", "SS", 22),
  johnson: player("00-0033927", "John Johnson", "FS", 43),
};

// Each listed group was independently verified on all three or the specified plays.
const commonOffense = [jets.flacco, jets.fant, jets.tomlinson, jets.mcgovern, jets.veraTucker, jets.mitchell, jets.carter, jets.conklin];
const commonDefense = [browns.thomas, browns.elliott, browns.walker, browns.owusuKoramoah, browns.newsome, browns.ward, browns.emerson, browns.delpit, browns.johnson];
type Lineup = {
  down: number; clock: number; direction: string; target: string | null; formation: string;
  offense: SnapParticipant[]; defense: SnapParticipant[]; quarterbackHitBy?: string;
};
const plays: Partial<Record<string, Lineup>> = {
  "4155": { down: 1, clock: 35, direction: "left", target: "E.Moore", formation: "SHOTGUN",
    offense: [...commonOffense, jets.moore, jets.wilson, jets.davis], defense: [...commonDefense, browns.wright, browns.winovich] },
  "4177": { down: 2, clock: 30, direction: "right", target: null, formation: "EMPTY",
    offense: [...commonOffense, jets.berrios, jets.smith, jets.davis], defense: [...commonDefense, browns.garrett, browns.bryan],
    quarterbackHitBy: browns.garrett.id },
  "4199": { down: 3, clock: 25, direction: "middle", target: "G.Wilson", formation: "SHOTGUN",
    offense: [...commonOffense, jets.moore, jets.berrios, jets.wilson], defense: [...commonDefense, browns.garrett, browns.bryan] },
};

function matches(play: Snap, lineup: Lineup): boolean {
  const facts = play.facts;
  const touchdown = lineup.down === 3;
  return play.quarter === 4 && play.clock === lineup.clock && play.possession === "jets" && play.down === lineup.down &&
    play.distance === 10 && play.yardline === 15 && play.drive === 19 && play.type === "pass" &&
    play.before?.[0] === 24 && play.before[1] === 30 && play.after?.[0] === (touchdown ? 30 : 24) && play.after[1] === 30 &&
    facts?.kind === (touchdown ? "completion" : "incompletion") && facts.touchdown === touchdown &&
    facts.passer === "J.Flacco" && (facts.target ?? null) === lineup.target && facts.direction === lineup.direction &&
    (facts.charting?.formation === undefined || facts.charting.formation === lineup.formation);
}

/** Add only each exact match. The archive and its cached snap objects stay independent of this study. */
export function withClevelandDriveLineups(game: SnapGame): SnapGame {
  if (game.source !== "nflverse" || game.id !== "2022_02_NYJ_CLE" || game.date !== "2022-09-18" || game.home || game.opponent !== "CLE" ||
    game.final?.[0] !== 31 || game.final[1] !== 30) return game;
  const selected = game.plays.map((play) => {
    const lineup = plays[play.key];
    if (!lineup || !matches(play, lineup) || game.plays.filter((other) => other.key === play.key).length !== 1) return play;
    const onField = {
      offense: lineup.offense.map((p) => ({ ...p })), defense: lineup.defense.map((p) => ({ ...p })),
      ...(lineup.quarterbackHitBy ? { quarterbackHitBy: lineup.quarterbackHitBy } : {}),
    };
    const facts = { ...play.facts, onField };
    // Untargeted 4177 has a raw nflfastR air_yards value of 4. There is no
    // named recipient or independent NGS depth from which to place the pass.
    if (lineup.target === null) delete facts.airYards;
    return { ...play, facts };
  });
  return { ...game, plays: selected };
}
