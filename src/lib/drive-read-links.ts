type ReadLocation = {
  play?: string;
  phase?: "snap" | "action";
  series?: "cleveland-15";
  follow?: string;
};

/** The URL identifies one revealed boundary. Omitting the phase opens before the selected play. */
export function driveReadHref(gameId: string, location: ReadLocation = {}) {
  const query = new URLSearchParams();
  if (location.series) query.set("series", location.series);
  if (location.play) query.set("play", location.play);
  if (location.phase === "action") query.set("phase", "action");
  if (location.follow) query.set("follow", location.follow);
  const suffix = query.toString();
  return "/replay/" + encodeURIComponent(gameId) + "/read" + (suffix ? "?" + suffix : "");
}
