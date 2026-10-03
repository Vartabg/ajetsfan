import { loadCoverage } from "@/lib/load-coverage";
import { formatDate } from "@/lib/current";
import { ShareImage } from "@/lib/share-image";

export const alt = "Official Jets headlines, dated and linked, from The Back Page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const coverage = await loadCoverage();
  const latest = coverage?.news.items.toSorted((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id))[0];
  return ShareImage({
    eyebrow: "Official team coverage",
    title: "Team news.",
    detail: latest ? `Latest: “${latest.title}” · ${formatDate(latest.publishedAt)}` : "Dated official Jets headlines, with direct links to the original reporting.",
  });
}
