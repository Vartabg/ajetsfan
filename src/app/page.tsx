import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import FocusHome from "@/components/FocusHome";
import { selectLead } from "@/lib/current";
import { buildFocus } from "@/lib/focus";
import { loadCurrent, loadCurve, loadGames } from "@/lib/load-games";
import { mediaCollection } from "@/lib/media-catalog";
import { pageMetadata } from "@/lib/site";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--focus-display", axes: ["opsz"] });
const text = Instrument_Sans({ subsets: ["latin"], variable: "--focus-text" });

export const metadata = pageMetadata({
  path: "/", title: "ajetsfan · the Jets, one thing at a time",
  description: "The latest Jets result, the next game, the season, the division, a big play and the newest coverage, one at a time, with every section a tap away.",
});

export default async function Home() {
  const [games, snapshot] = await Promise.all([loadGames(), loadCurrent()]);
  const lead = selectLead(games, snapshot);
  const curve = lead.analysisStatus === "ready" && lead.analysis ? await loadCurve(lead.analysis.id) : [];
  return <FocusHome data={buildFocus({ games, snapshot, curve, media: mediaCollection })} className={`${display.variable} ${text.variable}`} />;
}
