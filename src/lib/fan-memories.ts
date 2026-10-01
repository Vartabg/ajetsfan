import { gameHref } from "./explorer";
import type { Board, Game } from "./games";

type MemoryFixture = Pick<Game, "id" | "season" | "week" | "seasonType" | "date" | "opponent" | "atHome" | "jetsScore" | "oppScore" | "wentToOt"> & {
  outcome: "win" | "loss";
};

export type FanMemory = {
  fixture: MemoryFixture;
  title: string;
  /** Original fan commentary; never a player quote or a historical eyewitness account. */
  reaction: string;
  epitaph: string;
  /** Original, factual précis supported by the primary team source below. */
  fact: string;
  source: { label: string; url: string };
};

/** Editorial selections, deliberately separate from the probability rankings. */
export const FAN_MEMORIES: readonly FanMemory[] = [
  {
    fixture: { id: "2000_08_MIA_NYJ", season: 2000, week: 8, seasonType: "REG", date: "2000-10-23", opponent: "MIA", atHome: true, jetsScore: 40, oppScore: 37, outcome: "win", wentToOt: true },
    title: "Monday Night Miracle",
    reaction: "Jumbo caught it. Sleep could wait.",
    epitaph: "Jumbo caught it. Sleep could wait.",
    fact: "Trailing 30–7 after three quarters, the Jets rallied. Jumbo Elliott caught the tying touchdown with 42 seconds left; John Hall’s field goal won it in overtime.",
    source: { label: "Jets account of the Monday Night Miracle", url: "https://www.newyorkjets.com/news/do-you-believe-in-miracles-jets-roar-back-from-23-down-rock-dolphins-40-37-in-ot" },
  },
  {
    fixture: { id: "2010_19_NYJ_NE", season: 2010, week: 19, seasonType: "POST", date: "2011-01-16", opponent: "NE", atHome: false, jetsScore: 28, oppScore: 21, outcome: "win", wentToOt: false },
    title: "Foxborough, January 2011",
    reaction: "Keep this receipt forever.",
    epitaph: "Foxborough. Twenty-eight to twenty-one. Keep the receipt.",
    fact: "The Jets returned to Gillette after a 45–3 regular-season loss and beat New England in the divisional playoffs, reaching their second straight AFC Championship Game.",
    source: { label: "Jets game report from the Foxborough playoff win", url: "https://www.newyorkjets.com/news/how-sweet-it-is-jets-topple-patriots-28-21-3248694" },
  },
  {
    fixture: { id: "2002_18_IND_NYJ", season: 2002, week: 18, seasonType: "POST", date: "2003-01-04", opponent: "IND", atHome: true, jetsScore: 41, oppScore: 0, outcome: "win", wentToOt: false },
    title: "Forty-one to nothing",
    reaction: "Our Jets. Please frame the score.",
    epitaph: "Forty-one to nothing. We’d like this score on stationery.",
    fact: "Chad Pennington’s Jets shut out Peyton Manning’s Colts in the 2002 season’s AFC Wild Card game at the Meadowlands.",
    source: { label: "Jets history of the Colts playoff shutout", url: "https://www.newyorkjets.com/news/the-jets-vs-peyton-manning-5-facts-16901857" },
  },
  {
    fixture: { id: "2012_12_NE_NYJ", season: 2012, week: 12, seasonType: "REG", date: "2012-11-22", opponent: "NE", atHome: true, jetsScore: 19, oppScore: 49, outcome: "loss", wentToOt: false },
    title: "Thanksgiving, 2012",
    reaction: "Dinner remains evidence.",
    epitaph: "Thanksgiving dinner remains evidence. No further questions.",
    fact: "New England scored 35 points in the second quarter. The Jets committed five turnovers, including Mark Sanchez’s fumble after colliding with Brandon Moore.",
    source: { label: "Jets postgame account of Thanksgiving 2012", url: "https://www.newyorkjets.com/news/postgame-we-helped-them-they-outplayed-us-8906264" },
  },
];

const fixtureFields = ["id", "season", "week", "seasonType", "date", "opponent", "atHome", "jetsScore", "oppScore", "outcome", "wentToOt"] as const;

function matchesMemory(game: Game, memory: FanMemory): boolean {
  return !game.dataSuspect && game.swing != null && Number.isFinite(game.swing) && game.swing >= 0 && game.swing <= 1
    && fixtureFields.every((field) => game[field] === memory.fixture[field]);
}

/** Corrected fixtures cannot inherit the old story or its specific epitaph. */
export function fanMemoryForGame(game: Game): FanMemory | null {
  return FAN_MEMORIES.find((memory) => matchesMemory(game, memory)) ?? null;
}

export type MemoryCase = { memory: FanMemory; game: Game; board: Board; href: string };

export function selectFanMemories(games: Game[]): MemoryCase[] {
  return FAN_MEMORIES.flatMap((memory) => {
    const matches = games.filter((game) => game.id === memory.fixture.id);
    // A conflicting duplicate is not enough evidence to publish this case.
    const game = matches.length === 1 ? matches[0] : null;
    if (!game || !matchesMemory(game, memory)) return [];
    const board: Board = game.outcome === "win" ? "miracle" : "heartbreak";
    return [{ memory, game, board, href: gameHref(game.id, board) }];
  });
}
