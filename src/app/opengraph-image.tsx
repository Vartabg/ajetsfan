import { ShareImage } from "@/lib/share-image";

export const alt = "ajetsfan: this week’s Jets game, the season, standings, leaders and news, one thing at a time.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ShareImage({ eyebrow: "ajetsfan", title: "The Jets, one thing at a time.", detail: "Live and latest scores, the next game, standings, player stats, team news and coverage." });
}
