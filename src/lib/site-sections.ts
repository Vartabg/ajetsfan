/** Pages rebuilt as focus views; they carry their own navigation instead of the site header and footer. */
export const FOCUS_ROUTES = ["/", "/game-day", "/team", "/team/roster", "/team/stats", "/team/news", "/film-room", "/media", "/seasons", "/morgue", "/discover", "/stories", "/history", "/history/trades", "/puzzle", "/how-made"];
/** Every published destination shares the focus frame, including its detail pages. */
export const isFocusRoute = (pathname: string) => FOCUS_ROUTES.includes(pathname) || /^\/seasons\/\d{4}(?:\/guide)?$/.test(pathname) || pathname.startsWith("/games/") || pathname.startsWith("/players/");

/** Every destination the home page offers, in the order a visitor scans them. */
export const SECTIONS = [
  { href: "/game-day", label: "Game Day", note: "Schedule, standings and the matchup" },
  { href: "/team", label: "Team", note: "Roster, player stats and news" },
  { href: "/film-room", label: "Film Room", note: "Big plays, drawn out" },
  { href: "/media", label: "Media", note: "Video, posts, articles and audio" },
  { href: "/seasons", label: "Seasons", note: "Every season’s results" },
  { href: "/morgue", label: "Game archive", note: "Every analyzed game, ranked" },
  { href: "/discover", label: "Deep cuts", note: "Same scores, different stories and improbable finishes" },
  { href: "/puzzle", label: "Daily puzzle", note: "Which Jets game is it?" },
  { href: "/stories", label: "Game stories", note: "How games turned, told visually" },
  { href: "/history", label: "History", note: "Rivalries and remembered games" },
  { href: "/history/trades", label: "Trade ledger", note: "Every pick, followed" },
  { href: "/how-made", label: "How it’s made", note: "Sources and methods" },
];
