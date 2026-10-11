import { ImageResponse } from "next/og";
import { createElement as h } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { mediaCollection } from "@/lib/media-catalog";
import { formatMediaDate } from "@/lib/media";
import { mediaAssetVersion } from "@/lib/media-asset-paths.mjs";

const font = readFile(path.join(process.cwd(), "public/fonts/Anton-Regular.ttf")).then((bytes) => Uint8Array.from(bytes).buffer);

/** Crisp, factual title cards for sources without usable publisher artwork. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  if (new URL(_request.url).search) return new Response("Media not found", { status: 404 });
  const { id, version } = await params;
  const item = mediaCollection.items.find((entry) => entry.id === id);
  if (!item || version !== mediaAssetVersion(item, "title")) return new Response("Media not found", { status: 404 });
  const source = mediaCollection.outlets.find((outlet) => outlet.id === item.outletId)?.name ?? item.author;
  const square = item.kind === "audio";
  const width = 1600, height = square ? 1600 : 900;
  const label = { video: "WATCH", audio: "LISTEN", article: "READ", post: "POST" }[item.kind];
  const titleSize = square ? item.title.length > 180 ? 72 : item.title.length > 130 ? 88 : 112 : item.title.length > 180 ? 52 : item.title.length > 130 ? 68 : item.title.length > 80 ? 82 : 102;
  return new ImageResponse(h("div", { style: { width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: square ? 100 : 80, background: "#102b22", color: "#f2f4e9", position: "relative" } },
    h("div", { style: { position: "absolute", right: -150, top: -200, width: 730, height: 1400, border: "2px solid #53705e", borderRadius: 365, transform: "rotate(28deg)", opacity: .35 } }),
    h("div", { style: { position: "absolute", right: -85, top: -115, width: 550, height: 1200, border: "2px solid #53705e", borderRadius: 275, transform: "rotate(28deg)", opacity: .35 } }),
    h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 32, color: "#c9e7b5", letterSpacing: "3px" } },
      h("span", null, "AJETSFAN"), h("span", null, label)),
    h("div", { style: { display: "flex", flex: 1, alignItems: "center", fontFamily: "Anton", fontWeight: 400, fontSize: titleSize, lineHeight: 1.13, letterSpacing: "-.5px", maxWidth: square ? 1320 : 1400 } }, item.title),
    h("div", { style: { display: "flex", flexDirection: "column", gap: 10, paddingTop: 25, borderTop: "2px solid #53705e", fontSize: 30 } },
      h("span", null, source), h("span", { style: { color: "#adc2b1", fontSize: 25 } }, formatMediaDate(item.publishedAt)))) , {
    width, height,
    fonts: [{ name: "Anton", data: await font, weight: 400, style: "normal" }],
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
