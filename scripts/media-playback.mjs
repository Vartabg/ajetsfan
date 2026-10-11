import { safeMediaPlaybackMetadata } from '../src/lib/media-playback-validation.mjs';

const MAX_BYTES = 3 * 1024 * 1024;
const names = (value) => typeof value === 'string' ? value.normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim() : '';
const typeIs = (object, value) => object?.['@type'] === value || Array.isArray(object?.['@type']) && object['@type'].includes(value);

function canonicalPage(html) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = Object.fromEntries([...match[0].matchAll(/\b([a-z][a-z0-9_-]*)\s*=\s*(["'])(.*?)\2/gi)]
      .map((attribute) => [attribute[1].toLowerCase(), attribute[3].replace(/&amp;/g, '&')]));
    if (attrs.rel?.toLowerCase() === 'canonical') return attrs.href;
  }
  return null;
}

function structuredObjects(html) {
  const objects = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!/\btype\s*=\s*["']application\/ld\+json["']/i.test(match[1])) continue;
    if (objects.length > 100 || match[2].length > 150_000) break;
    try {
      const parsed = JSON.parse(match[2]);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        objects.push(row);
        if (Array.isArray(row['@graph'])) objects.push(...row['@graph'].filter((node) => node && typeof node === 'object').slice(0, 100));
      }
    } catch { /* One malformed optional metadata block cannot become a player. */ }
  }
  return objects.slice(0, 200);
}

/** Read a publisher's declared media metadata, never scripts or a guessed watch-page iframe. */
export function publisherPlayback(item, html) {
  if (typeof html !== 'string' || Buffer.byteLength(html) > MAX_BYTES) return null;
  let source;
  try { source = new URL(item.url); } catch { return null; }
  if (source.protocol !== 'https:' || source.username || source.password || source.port) return null;
  const objects = structuredObjects(html);
  if (item.kind === 'video' && ['sny.tv', 'www.sny.tv'].includes(source.hostname)) {
    for (const object of objects.filter((row) => typeIs(row, 'VideoObject') && names(row.name) === names(item.title))) {
      if ((object.url ?? canonicalPage(html)) !== item.url) continue;
      const playback = { kind: 'video', url: object.contentUrl, type: 'video/mp4' };
      if (safeMediaPlaybackMetadata({ ...item, playback })) return playback;
    }
  }
  if (item.kind === 'audio' && source.hostname === 'www.audacy.com') {
    for (const object of objects.filter((row) => typeIs(row, 'PodcastEpisode') && row.url === item.url)) {
      const media = object.associatedMedia;
      if (!typeIs(media, 'AudioObject')) continue;
      const playback = { kind: 'iframe', url: media.embedUrl };
      if (safeMediaPlaybackMetadata({ ...item, playback })) return playback;
    }
  }
  return null;
}
