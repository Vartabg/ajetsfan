import { loadTradeLedger } from "@/lib/load-trades";
import { ShareImage } from "@/lib/share-image";

export const alt = "The Jets trade ledger from The Back Page: every pick, followed";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const ledger = await loadTradeLedger();
  return ShareImage({
    eyebrow: ledger ? `Jets history · ${ledger.firstSeason}–${ledger.lastSeason}` : "Jets history",
    title: "The trade ledger.",
    detail: ledger ? `${ledger.counts.trades} recorded trades · ${ledger.counts.picksGiven} picks sent, ${ledger.counts.picksReceived} received · each pick followed to what it became.` : "Every pick, followed to what it became.",
  });
}
