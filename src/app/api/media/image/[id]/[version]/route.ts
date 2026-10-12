import { loadMediaAssetCollections } from "@/lib/load-media";
import { recordedMediaImageResponse } from "@/lib/recorded-media-image.mjs";
import { mediaAssetVersion } from "@/lib/media-asset-paths.mjs";

/** Serve only a versioned picture recorded in the server's validated media edition. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  const { id, version } = await params;
  if (new URL(_request.url).search) return new Response("Media picture unavailable", { status: 404, headers: { "Cache-Control": "no-store" } });
  const collections = await loadMediaAssetCollections();
  const item = collections.flatMap((collection) => collection.items).find((item) => item.id === id && mediaAssetVersion(item, "image") === version);
  return recordedMediaImageResponse(item, version);
}
