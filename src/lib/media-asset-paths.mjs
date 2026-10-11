import { mediaImage } from './media.ts';

// Cache identity, not authorization: routes still resolve a known, validated catalog item.
function version(value) {
  const text = JSON.stringify(value);
  let first = 0x811c9dc5, second = 0x9e3779b9;
  for (let index = 0; index < text.length; index++) {
    first = Math.imul(first ^ text.charCodeAt(index), 0x01000193);
    second = Math.imul(second ^ text.charCodeAt(index), 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

/** @param {import('./media').MediaItem} item @param {'image'|'title'} purpose */
export function mediaAssetVersion(item, purpose) {
  if (purpose === 'title') return version([item.id, item.title, item.kind, item.author, item.outletId, item.publishedAt]);
  const image = mediaImage(item);
  return version([item.id, image?.url, image?.width, image?.height, image?.fingerprint]);
}

/** @param {import('./media').MediaItem} item @returns {string|null} */
export function mediaImagePath(item) {
  const image = mediaImage(item);
  if (!image) return null;
  if (image.url.startsWith('/')) {
    const local = image.url.match(/^\/api\/media\/image\/([a-z0-9-]{1,80})\/([a-f0-9]{16})$/);
    return local?.[1] === item.id ? image.url : null;
  }
  return `/api/media/image/${item.id}/${mediaAssetVersion(item, 'image')}`;
}

/** @param {import('./media').MediaItem} item */
export const mediaTitleCardPath = (item) => `/api/media/thumbnail/${item.id}/${mediaAssetVersion(item, 'title')}`;

/** Only call after server-side catalog validation; the local route holds the original URL. */
/** @param {import('./media').MediaItem} item @returns {import('./media').MediaItem} */
export function compactMediaItem(item) {
  const image = mediaImage(item), local = mediaImagePath(item);
  return { ...item, image: image && local ? { ...image, url: local } : null };
}
