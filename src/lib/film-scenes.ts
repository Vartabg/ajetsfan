import type { FilmScene } from "./film-room";

/** Labeled scene recreations accompany sources; they are never film evidence. */
export const filmScenes: Partial<Record<string, FilmScene>> = {
  "wilson-cleveland": {
    kind: "reference",
    src: "https://static.clubs.nfl.com/image/private/t_editorial_landscape_12_desktop_3x/f_auto/jets/zlqrkeixkuukaccd4ctj.jpg", width: 2880, height: 2160,
    alt: "Garrett Wilson in his white number 17 Jets uniform holding the ball in the end zone at Cleveland, with Browns defenders number 22 and 28, September 18, 2022.",
    caption: "The original photograph from the Jets’ account of the 2022 Cleveland comeback. Wilson wore number 17 in this game. One still cannot establish coverage, blocking assignments or the route’s full sequence.",
    reference: { label: "New York Jets · Cleveland comeback report", url: "https://www.newyorkjets.com/news/jets-shock-browns-with-13-point-comeback-in-last-2-minutes-for-31-30-win" },
  },
  "sanchez-thanksgiving": {
    src: "/media/reconstructions/sanchez-thanksgiving-2012.webp", width: 1672, height: 941,
    alt: "AI-generated recreation of the tight archival frame of Mark Sanchez bent forward in his green number 6 Jets uniform, November 22, 2012.",
    caption: "Source-based recreation of the tightly cropped 2012 archival frame. The ball and most of the lineman are outside the reference view; this image cannot explain the collision or blocking assignments.",
    reference: { label: "NFL · Sanchez’s postgame report and archival frame", url: "https://www.nfl.com/news/mark-sanchez-stunned-by-new-york-jets-butt-fumble-0ap1000000102529" },
  },
};
