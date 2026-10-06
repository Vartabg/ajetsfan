import FocusHome from "@/components/FocusHome";
import { selectLead } from "@/lib/current";
import { buildFocus } from "@/lib/focus";
import { loadCurrent, loadCurve, loadGames } from "@/lib/load-games";
import { mediaCollection } from "@/lib/media-catalog";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "./focus-fonts";

export const metadata = pageMetadata({
  path: "/", title: "ajetsfan · the Jets, one thing at a time",
  description: "The latest Jets result, the next game, the season, the division, a big play and the newest coverage, one at a time, with every section a tap away.",
});

export default async function Home() {
  const [games, snapshot] = await Promise.all([loadGames(), loadCurrent()]);
  const lead = selectLead(games, snapshot);
  const curve = lead.analysisStatus === "ready" && lead.analysis ? await loadCurve(lead.analysis.id) : [];
  return <FocusHome data={buildFocus({ games, snapshot, curve, media: mediaCollection })} className={focusFonts} />;
}
