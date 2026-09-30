export type EditorialPhotoAsset = {
  src: string;
  alt: string;
  caption: string;
  credit: string;
  sourceHref: string;
  position: string;
  editionSeason: number;
  gameId?: string;
  playerId?: string;
};

const DETROIT_GAME: EditorialPhotoAsset = {
  src: "https://static.clubs.nfl.com/image/upload/t_new_photo_album/jets/w4iaybamzldx2n76cyaq.jpg",
  alt: "A Jets defender tackles a Lions receiver on the field in Detroit.",
  caption: "At Detroit · Week 3 · Sep 27, 2026",
  credit: "Dylan Goodman / © New York Jets",
  sourceHref: "https://www.newyorkjets.com/photos/game-photos-jets-vs-lions-week-3-09-27-2026",
  position: "50% 50%",
  editionSeason: 2026,
  gameId: "2026_03_NYJ_DET",
};

// An older fixture's photograph must never become the next game's cover.
export function gameEditorialPhoto(gameId: string): EditorialPhotoAsset | null {
  return gameId === DETROIT_GAME.gameId ? DETROIT_GAME : null;
}

const PLAYER_PHOTOS: EditorialPhotoAsset[] = [
  {
    src: "https://static.clubs.nfl.com/image/upload/t_editorial_landscape_12_desktop/jets/ugmzeq07j3qmtxr7fkzz.png",
    alt: "Geno Smith draws back the football to throw, wearing his white Jets number 7 jersey and green helmet.",
    caption: "At Detroit · Sep 27, 2026",
    credit: "Source: New York Jets",
    sourceHref: "https://www.newyorkjets.com/news/geno-smith-playing-elite-level-jets-vs-lions-09-28-2026",
    position: "20% 45%",
    editionSeason: 2026,
    gameId: "2026_03_NYJ_DET",
    playerId: "00-0030565",
  },
  {
    src: "https://static.clubs.nfl.com/image/upload/t_editorial_landscape_12_desktop/jets/hmrooczbnjwyyganfx5e.jpg",
    alt: "Breece Hall runs with the football in green Jets practice gear.",
    caption: "Practice · Sep 10, 2026",
    credit: "Source: New York Jets",
    sourceHref: "https://www.newyorkjets.com/news/jets-breece-hall-feeling-fresh-ahead-of-season-opener-09-10-2026",
    position: "45% 45%",
    editionSeason: 2026,
    playerId: "00-0038120",
  },
  {
    src: "https://static.clubs.nfl.com/image/upload/t_editorial_landscape_12_desktop/jets/j1kmcnvic9zo339zmqgo.png",
    alt: "Garrett Wilson reaches for a contested catch with a Detroit defender alongside him.",
    caption: "At Detroit · Sep 27, 2026",
    credit: "Source: New York Jets",
    sourceHref: "https://www.newyorkjets.com/news/garrett-wilson-puts-elite-talent-on-display-with-touchdown-107-yards-vs-detroit-09-27-2026",
    position: "49% 35%",
    editionSeason: 2026,
    gameId: "2026_03_NYJ_DET",
    playerId: "00-0037740",
  },
];

const TEAM_COVER: EditorialPhotoAsset = {
  src: "https://static.clubs.nfl.com/image/upload/t_new_photo_album/jets/udgfcm2afq9kjcpofhng.jpg",
  alt: "Breece Hall, in a grass-stained Jets jersey, shrugs with a phone in one hand on the stadium sideline.",
  caption: "Breece Hall · Archive photograph",
  credit: "Source: New York Jets",
  sourceHref: "https://www.newyorkjets.com/photos/breece-hall-jets-career-photo-gallery",
  position: "50% 50%",
  editionSeason: 2026,
  playerId: "00-0038120",
};

export function teamEditorialPhoto(season: number): EditorialPhotoAsset | null {
  return TEAM_COVER.editionSeason === season ? TEAM_COVER : null;
}

export function playerActionPhoto(playerId: string, season: number): EditorialPhotoAsset | null {
  return PLAYER_PHOTOS.find((photo) => photo.playerId === playerId && photo.editionSeason === season) ?? null;
}
