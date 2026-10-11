import { mediaCollection } from "@/lib/media-catalog";
import { recordedMediaImageResponse } from "@/lib/recorded-media-image.mjs";

/** Serve only a versioned picture recorded in the server's validated media edition. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  const { id, version } = await params;
  if (new URL(_request.url).search) return new Response("Media picture unavailable", { status: 404, headers: { "Cache-Control": "no-store" } });
  return recordedMediaImageResponse(mediaCollection.items.find((item) => item.id === id), version);
}
