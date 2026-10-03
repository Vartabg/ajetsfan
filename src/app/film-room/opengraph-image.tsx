import { jetsPlays } from "@/lib/jets-playbook";
import { defensiveFormations, offensiveFormations } from "@/lib/playbook";
import { ShareImage } from "@/lib/share-image";

export const alt = "The Film Room from The Back Page: Jets plays on an editable chalkboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ShareImage({
    eyebrow: "Plays, sources and scouting concepts",
    title: "Film Room.",
    detail: `Run a Jets play. Follow a player. Draw your own answer. ${jetsPlays.length} sourced studies · ${offensiveFormations.length + defensiveFormations.length} formations.`,
  });
}
