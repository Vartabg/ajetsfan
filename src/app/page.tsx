import FocusHome from "@/components/FocusHome";
import { selectLead } from "@/lib/current";
import { buildFocus } from "@/lib/focus";
import { loadCurrent, loadCurve, loadGames } from "@/lib/load-games";
import { loadMediaCollection, scheduleStaleMediaRecovery } from "@/lib/load-media";
import { pageMetadata } from "@/lib/site";
import { focusFonts } from "./focus-fonts";

export const dynamic = "force-dynamic";
export const maxDuration = 180;
export const metadata = pageMetadata({
  path: "/", title: "ajetsfan · the Jets, one thing at a time",
  description: "The latest Jets result, the next game, the season, the division, a big play, surprising archive discoveries and the newest coverage, one at a time.",
});

export default async function Home() {
  const [games, snapshot, mediaCollection] = await Promise.all([loadGames(), loadCurrent(), loadMediaCollection()]);
  await scheduleStaleMediaRecovery();
  const lead = selectLead(games, snapshot);
  const curve = lead.analysisStatus === "ready" && lead.analysis ? await loadCurve(lead.analysis.id) : [];
  return <FocusHome data={buildFocus({ games, snapshot, curve, media: mediaCollection })} className={focusFonts} />;
}
