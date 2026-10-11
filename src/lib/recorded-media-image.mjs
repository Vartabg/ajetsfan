import { mediaImage, safeMediaImageUrl } from './media.ts';
import { mediaAssetVersion } from './media-asset-paths.mjs';
import { imageDimensions } from './media-raster.mjs';

const MAX_BYTES = 5 * 1024 * 1024;
const failure = (status) => new Response('Media picture unavailable', { status, headers: { 'Cache-Control': 'no-store' } });

/** No remote destination is accepted from a visitor; resolve only the exact catalog picture. */
/** @param {import('./media').MediaItem|null|undefined} item @param {string} expectedVersion @param {{fetcher?: typeof fetch}} [options] */
export async function recordedMediaImageResponse(item, expectedVersion, { fetcher = fetch } = {}) {
  if (!item || !/^[a-f0-9]{16}$/.test(expectedVersion) || mediaAssetVersion(item, 'image') !== expectedVersion) return failure(404);
  const image = mediaImage(item);
  if (!image || !safeMediaImageUrl(image.url) || new URL(image.url).hash
    || (item.youtubeId && !new RegExp(`^https://i\\.ytimg\\.com/vi/${item.youtubeId}/(?:maxresdefault|sddefault|hqdefault)\\.jpg$`).test(image.url))) return failure(404);
  try {
    const response = await fetcher(image.url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000), headers: { Accept: 'image/jpeg,image/png,image/webp' } });
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!response.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(type ?? '') || !response.body || Number(response.headers.get('content-length')) > MAX_BYTES) return failure(502);
    const chunks = [], reader = response.body.getReader();
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_BYTES) { await reader.cancel(); return failure(502); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const data = Buffer.concat(chunks);
    const jpeg = data.length > 4 && data[0] === 255 && data[1] === 216;
    const png = data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp = data.length >= 30 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
    if (!(type === 'image/jpeg' && jpeg || type === 'image/png' && png || type === 'image/webp' && webp)) return failure(502);
    const size = imageDimensions(data);
    // A publisher can replace a valid URL with a small placeholder between edition refreshes.
    if (size.width < Math.min(image.width, 600) || size.height < Math.min(image.height, 300) || size.width > 4000 || size.height > 4000) return failure(502);
    return new Response(data, { headers: { 'Content-Type': type, 'Content-Length': String(data.length), 'Cache-Control': 'public, max-age=3600, s-maxage=3600', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return failure(502); }
}
