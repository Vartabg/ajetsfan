import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { safeMediaImageUrl, safeMediaUrl, validateMediaCollection } from '../src/lib/media.ts';
import { imageDimensions } from '../src/lib/media-raster.mjs';
import { withDataLock } from './data-refresh.mjs';
import { publisherPlayback } from './media-playback.mjs';
import { discoverYouTubeChannel, jetsRelevant } from './youtube-channel.mjs';
import { isJetsRant } from '../src/lib/media-topics.mjs';
import { discoverYouTubeApi } from './youtube-api.mjs';

const appleSource = (id) => `https://itunes.apple.com/lookup?id=${id}&entity=podcastEpisode&limit=100`;
const youtubeSource = (id) => `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Publisher feeds only. Each rendered destination is checked against its own publisher. */
export const MEDIA_SOURCES = [
  { id: 'jets-x-factor', outletId: 'jets-x-factor', name: 'Jets X-Factor', url: 'https://jetsxfactor.com/feed/', type: 'rss', kind: 'article', host: 'jetsxfactor.com', pathname: /^\/(?:\d{4}\/\d{2}\/\d{2}\/|watch\/)/, videoPathname: /^\/watch\//, topics: ['Analysis'] },
  { id: 'new-york-post', outletId: 'new-york-post', name: 'New York Post Jets', url: 'https://nypost.com/tag/new-york-jets/feed/', type: 'rss', kind: 'article', host: 'nypost.com', pathname: /^\/(?:\d{4}\/\d{2}\/\d{2}\/sports\/|video\/)/, videoPathname: /^\/video\//, topics: ['Beat reporting'] },
  { id: 'jake-asman', outletId: 'jake-asman-show', name: 'The Jake Asman Show', url: youtubeSource('UCt8ZeGlv3VM8jLYO_EoDMPw'), channelId: 'UCt8ZeGlv3VM8jLYO_EoDMPw', type: 'youtube', kind: 'video', topics: ['Fan analysis'], jetsOnly: true },
  { id: 'bt-unleashed', outletId: 'bt-unleashed', name: 'BT Unleashed', url: youtubeSource('UCLJ2gpZBFl2ytuVlbNo9xAA'), channelId: 'UCLJ2gpZBFl2ytuVlbNo9xAA', type: 'youtube', kind: 'video', topics: ['Fan analysis'], jetsOnly: true },
  { id: 'jets-central', outletId: 'jets-central', name: 'Jets Central', url: youtubeSource('UCPrLo3MozRhkbV-XCPsQxDg'), channelId: 'UCPrLo3MozRhkbV-XCPsQxDg', type: 'youtube', kind: 'video', topics: ['Fan analysis'], jetsOnly: true },
  { id: 'matt-oleary', outletId: 'matt-oleary', name: 'Matt O’Leary', url: youtubeSource('UCLS0BYK5W7eT_SxW6pQA19w'), channelId: 'UCLS0BYK5W7eT_SxW6pQA19w', type: 'youtube', kind: 'video', topics: ['Fan analysis'], jetsOnly: true },
  { id: 'greenbean-jetsfan', outletId: 'greenbean-jetsfan', name: 'GreenBean Jetsfan', url: youtubeSource('UC3gaW1ds7Q0fy51vA0J5y2g'), channelId: 'UC3gaW1ds7Q0fy51vA0J5y2g', type: 'youtube', kind: 'video', topics: ['Fan analysis'], jetsOnly: true },
  { id: 'jets-media', outletId: 'jets-media', name: 'Jets Media', url: youtubeSource('UCNfqKk4bSwaBNPnPSo6eZ4w'), channelId: 'UCNfqKk4bSwaBNPnPSo6eZ4w', type: 'youtube', kind: 'video', topics: ['Fan analysis'], jetsOnly: true },
  { id: 'jets-talk-247', outletId: 'jets-talk-247', name: 'Jets Talk 24/7', url: youtubeSource('UCJ_CFZh_SqFLp6-71wdakVw'), channelId: 'UCJ_CFZh_SqFLp6-71wdakVw', type: 'youtube', kind: 'video', topics: ['Fan analysis'], jetsOnly: true },
  { id: 'talkin-jets', outletId: 'talkin-jets', name: 'Talkin Jets', url: youtubeSource('UCT6QwygPvX84-Y_fQryCtvA'), channelId: 'UCT6QwygPvX84-Y_fQryCtvA', youtubeTab: 'streams', type: 'youtube', kind: 'video', topics: ['Fan analysis'], jetsOnly: true },
  { id: 'espn-new-york-videos', outletId: 'espn-new-york', name: 'ESPN New York videos', url: youtubeSource('UCZDpKRXDSFSc6IXPMQ3GHpA'), channelId: 'UCZDpKRXDSFSc6IXPMQ3GHpA', type: 'youtube', kind: 'video', topics: ['Radio analysis'], jetsOnly: true },
  { id: 'espn-dipietro-rothenberg', outletId: 'espn-new-york', name: 'DiPietro & Rothenberg', url: appleSource(928624712), podcastId: 928624712, type: 'apple', kind: 'audio', topics: ['Radio analysis'], jetsOnly: true },
  { id: 'espn-don-hahn-rosenberg', outletId: 'espn-new-york', name: 'Don, Hahn & Rosenberg', url: appleSource(1788585041), podcastId: 1788585041, type: 'apple', kind: 'audio', topics: ['Radio analysis'], jetsOnly: true },
  { id: 'sny-videos', outletId: 'sny', name: 'SNY videos', url: youtubeSource('UCL_OEjsHTwsHK6WKWs7s7Uw'), channelId: 'UCL_OEjsHTwsHK6WKWs7s7Uw', type: 'youtube', kind: 'video', topics: ['TV analysis'], jetsOnly: true },
  { id: 'wfan-videos', outletId: 'wfan', name: 'WFAN videos', url: youtubeSource('UCSZ8QL2xzTHzW4ucCy1cjog'), channelId: 'UCSZ8QL2xzTHzW4ucCy1cjog', type: 'youtube', kind: 'video', topics: ['Radio analysis'], jetsOnly: true },
  { id: 'wfan-boomer-gio', outletId: 'wfan', name: 'Boomer & Gio', url: appleSource(386001601), podcastId: 386001601, type: 'apple', kind: 'audio', topics: ['Radio analysis'], jetsOnly: true },
  { id: 'wfan-evan-tiki', outletId: 'wfan', name: 'Evan & Tiki', url: appleSource(386002649), podcastId: 386002649, type: 'apple', kind: 'audio', topics: ['Radio analysis'], jetsOnly: true },
  { id: 'wfan-carton', outletId: 'wfan', name: 'The Carton Show with Craig Carton & Chris McMonigle', url: appleSource(942553546), podcastId: 942553546, type: 'apple', kind: 'audio', topics: ['Radio analysis'], jetsOnly: true },
  { id: 'wfan-daily', outletId: 'wfan', name: 'WFAN Daily', url: appleSource(386002669), podcastId: 386002669, type: 'apple', kind: 'audio', topics: ['Radio analysis'], jetsOnly: true },
  { id: 'francesa-videos', outletId: 'mike-francesa-podcast', name: 'Mike Francesa Podcast videos', url: youtubeSource('UCiL06Dv6Eygpj27Yx6MM8TA'), channelId: 'UCiL06Dv6Eygpj27Yx6MM8TA', type: 'youtube', kind: 'video', topics: ['Radio analysis'], jetsOnly: true },
  { id: 'francesa', outletId: 'mike-francesa-podcast', name: 'The Mike Francesa Podcast', url: appleSource(1615588712), podcastId: 1615588712, type: 'apple', kind: 'audio', topics: ['Radio analysis'], jetsOnly: true },
  { id: 'benigno', outletId: 'oh-the-pain', name: 'Oh the Pain Podcast', url: appleSource(1586455556), podcastId: 1586455556, type: 'apple', kind: 'audio', topics: ['Radio analysis'], jetsOnly: true },
  { id: 'lets-talk-jets', outletId: 'lets-talk-jets', name: 'Let’s Talk Jets Radio', url: appleSource(863176413), podcastId: 863176413, type: 'apple', kind: 'audio', topics: ['Fan analysis'] },
  { id: 'jets-collective', outletId: 'jets-collective', name: 'Jets Collective', url: appleSource(1887763130), podcastId: 1887763130, type: 'apple', kind: 'audio', topics: ['Roundtable'] },
];

const rows = (value) => Array.isArray(value) ? value : value ? [value] : [];
const prefix = (source) => `auto-${source.id}-`;
const newest = (a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || a.id.localeCompare(b.id);
const plainText = (value, max, label) => {
  if (typeof value !== 'string') throw new Error(`Missing ${label}`);
  // WordPress can put HTML numeric entities inside XML CDATA, after XML entity decoding.
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  const text = value.replace(/&#(x[\da-f]+|\d+);/gi, (entity, number) => {
    const point = Number.parseInt(number.replace(/^x/i, ''), /^x/i.test(number) ? 16 : 10);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  }).replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, name) => named[name]).replace(/\s+/g, ' ').trim();
  if (!text || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text) || /<[^>]*>/.test(text)) throw new Error(`Invalid ${label}`);
  return text;
};

/** Remove publisher tracking parameters, retaining parameters that identify the item. */
export function canonicalMediaUrl(value) {
  if (!safeMediaUrl(value)) throw new Error('Unsafe media destination');
  const url = new URL(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || ['uo', 'fbclid', 'gclid'].includes(key)) url.searchParams.delete(key);
  if (['www.youtube.com', 'youtube.com'].includes(url.hostname) && /^\/shorts\/[A-Za-z0-9_-]{11}$/.test(url.pathname) && !url.search) {
    const videoId = url.pathname.split('/').at(-1);
    url.pathname = '/watch';
    url.searchParams.set('v', videoId);
  }
  url.searchParams.sort();
  return url.href;
}

const contextAt = (publishedAt, now) => now.getTime() - Date.parse(publishedAt) <= 90 * 86_400_000 ? 'current' : 'archive';

function itemFrom({ title, publishedAt, url, author, youtubeId, embedAllowed }, source, now) {
  const date = Date.parse(publishedAt);
  if (!Number.isFinite(date)) throw new Error('Invalid publisher publication date');
  if (date > now.getTime()) return null;
  const canonical = canonicalMediaUrl(url);
  return {
    id: `${prefix(source)}${createHash('sha256').update(canonical).digest('hex').slice(0, 24)}`,
    title: plainText(title, 250, 'publisher headline'), kind: source.kind, outletId: source.outletId,
    author: plainText(author, 180, 'publisher author'), publishedAt: /^\d{4}-\d{2}-\d{2}$/.test(publishedAt) ? publishedAt : new Date(date).toISOString(), url: canonical,
    ...(youtubeId ? { youtubeId } : { image: null }),
    ...(typeof embedAllowed === 'boolean' ? { embedAllowed } : {}),
    summary: `Published by ${source.name}.${source.kind === 'article' ? ' Open the original for the publisher’s full coverage.' : ''}`,
    topics: [...source.topics, ...(isJetsRant(title) && !source.topics.includes('Rants') ? ['Rants'] : [])], context: contextAt(publishedAt, now),
    // Publication year does not establish the football season or a recorded game.
  };
}

function parseXml(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES || /<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true) throw new Error('Invalid publisher feed XML');
  return new XMLParser({ parseTagValue: false, trimValues: true, ignoreAttributes: false }).parse(text);
}

export function parseMediaSource(text, source, now = new Date(), imageHints = new Map(), excludedUrls = new Set()) {
  const parsed = [];
  if (source.type === 'apple') {
    const document = JSON.parse(text);
    if (!Array.isArray(document.results) || document.results.length > 101) throw new Error('Invalid podcast lookup response');
    const podcast = document.results.find((entry) => entry.kind === 'podcast' && entry.collectionId === source.podcastId);
    if (!podcast) throw new Error('Podcast publisher identity missing');
    for (const entry of document.results.filter((entry) => entry.kind === 'podcast-episode')) {
      if (entry.collectionId !== source.podcastId || !Number.isSafeInteger(entry.trackId) || entry.trackId < 1) throw new Error('Podcast episode identity mismatch');
      const url = new URL(canonicalMediaUrl(entry.trackViewUrl));
      if (url.hostname !== 'podcasts.apple.com' || !url.pathname.endsWith(`/id${source.podcastId}`) || url.searchParams.get('i') !== String(entry.trackId)) throw new Error('Podcast destination identity mismatch');
      if (source.jetsOnly && !jetsRelevant(entry.trackName ?? '', entry.description ?? '')) { excludedUrls.add(url.href); continue; }
      const item = itemFrom({ title: entry.trackName, publishedAt: entry.releaseDate, url: url.href, author: entry.artistName ?? podcast.artistName ?? source.name }, source, now);
      if (item) imageHints.set(item.url, [entry.artworkUrl600, podcast.artworkUrl600].filter(Boolean));
      parsed.push(item);
    }
  } else {
    const document = parseXml(text);
    if (source.type === 'youtube') {
      const feed = document.feed;
      // YouTube's root channelId strips the UC prefix; each entry and author URI retain it.
      if (!feed || ![source.channelId, source.channelId.slice(2)].includes(feed['yt:channelId'])
        || feed.author?.uri !== `https://www.youtube.com/channel/${source.channelId}`) throw new Error('Video channel identity mismatch');
      for (const entry of rows(feed.entry)) {
        if (entry['yt:channelId'] !== source.channelId || !/^[A-Za-z0-9_-]{11}$/.test(entry['yt:videoId'])) throw new Error('Video publisher identity mismatch');
        const link = rows(entry.link).find((value) => value['@_rel'] === 'alternate')?.['@_href'];
        const url = new URL(canonicalMediaUrl(link));
        const watch = url.pathname === '/watch' && url.searchParams.getAll('v').length === 1 && url.searchParams.get('v') === entry['yt:videoId'];
        const short = url.pathname === `/shorts/${entry['yt:videoId']}` && !url.search;
        if (url.hostname !== 'www.youtube.com' || (!watch && !short)) throw new Error('Video destination identity mismatch');
        if (source.jetsOnly && !jetsRelevant(entry.title ?? '', entry['media:group']?.['media:description'] ?? '')) { excludedUrls.add(url.href); continue; }
        const item = itemFrom({ title: entry.title, publishedAt: entry.published, url: url.href, author: entry.author?.name ?? source.name, youtubeId: entry['yt:videoId'] }, source, now);
        if (item) imageHints.set(item.url, ['maxresdefault', 'sddefault', 'hqdefault'].map((quality) => `https://i.ytimg.com/vi/${item.youtubeId}/${quality}.jpg`));
        parsed.push(item);
      }
    } else {
      const feed = document.rss?.channel;
      if (!feed || !rows(feed.item).length) throw new Error('Publisher RSS has no items');
      for (const entry of rows(feed.item).slice(0, 240)) {
        const url = new URL(canonicalMediaUrl(entry.link));
        if (url.hostname !== source.host || !source.pathname.test(url.pathname)) throw new Error('RSS destination publisher mismatch');
        if (source.jetsOnly && !jetsRelevant(entry.title ?? '', entry.description ?? '')) { excludedUrls.add(url.href); continue; }
        const itemSource = source.videoPathname?.test(url.pathname) ? { ...source, kind: 'video' } : source;
        const item = itemFrom({ title: entry.title, publishedAt: entry.pubDate, url: url.href, author: entry['dc:creator'] ?? entry.author ?? source.name }, itemSource, now);
        if (item) imageHints.set(item.url, [
          ...rows(entry.enclosure).filter((value) => /^image\/(?:jpeg|png|webp)$/i.test(value['@_type'] ?? '')).map((value) => value['@_url']),
          ...rows(entry['media:content']).filter((value) => value['@_medium'] === 'image' || /^image\//i.test(value['@_type'] ?? '') || /\.(?:jpe?g|png|webp)(?:[/?]|$)/i.test(value['@_url'] ?? '')).map((value) => value['@_url']),
          ...rows(entry['media:thumbnail']).map((value) => value['@_url']),
        ].filter(Boolean));
        parsed.push(item);
      }
    }
  }
  const unique = new Map();
  for (const item of parsed.filter(Boolean).sort(newest)) if (!unique.has(item.url)) unique.set(item.url, item);
  return [...unique.values()];
}

async function fetchBytes(url, fetcher, { accept, headers = {}, limit = MAX_BYTES, image = false, redirectCheck } = {}) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(20_000), redirect: redirectCheck ? 'manual' : 'error', headers: { Accept: accept, ...headers } });
  if (redirectCheck && [301, 302, 303, 307, 308].includes(response.status) && response.headers.get('location')) {
    const destination = new URL(response.headers.get('location'), url).href;
    if (!redirectCheck(destination)) throw new Error('Publisher picture redirects outside its permitted source');
    // One checked CDN hop only; the final exact URL is stored for the optimizer, which follows none.
    return fetchBytes(destination, fetcher, { accept, limit, image });
  }
  if (!response.ok) throw new Error(`Publisher HTTP ${response.status}`);
  if (image && !/^image\/(?:jpeg|png|webp)(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error('Publisher response is not a supported raster image');
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Publisher response exceeds size limit');
  if (!response.body) throw new Error('Publisher response has no body');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('Publisher response exceeds size limit'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

async function fetchSource(source, fetcher) {
  return (await fetchBytes(source.url, fetcher, { accept: source.type === 'apple' ? 'application/json' : 'application/rss+xml, application/atom+xml, text/xml' })).toString('utf8');
}

export { imageDimensions };

export function imageForSource(value, source, item) {
  if (!safeMediaImageUrl(value)) return false;
  const url = new URL(value);
  if (url.hash) return false;
  if (item.youtubeId) return new RegExp(`^https://i\\.ytimg\\.com/vi/${item.youtubeId}/(?:maxresdefault|sddefault|hqdefault)\\.jpg$`).test(value);
  if (source.type === 'apple') return /^is[1-5]-ssl\.mzstatic\.com$/.test(url.hostname) && /^\/image\/(?:thumb\/)?Podcasts[^/]*\//.test(url.pathname);
  if (source.host === 'www.newyorkjets.com') return url.hostname === 'static.clubs.nfl.com' && /^\/image\/(?:upload|private)\/.*\/jets\//.test(url.pathname) && !url.search;
  if (source.host === 'jetsxfactor.com') return url.hostname === source.host && url.pathname.startsWith('/wp-content/uploads/');
  if (source.host === 'nypost.com') return url.hostname === source.host && /^\/wp-content(?:\/|%2[fF])uploads(?:\/|%2[fF])/.test(url.pathname);
  if (['sny.tv', 'www.sny.tv'].includes(source.host)) return (url.hostname === 'assets-jpcust.jwpsrv.com' && /^\/(?:thumbs|thumbnails)\//.test(url.pathname))
    || (url.hostname === 'cdn.jwplayer.com' && /^\/v2\/media\/[A-Za-z0-9]{8}\/poster\.jpg$/.test(url.pathname));
  if (source.host === 'www.audacy.com') return url.hostname === source.host && url.pathname.startsWith('/media-library/');
  return false;
}

const decodeAttribute = (value) => value.replace(/&amp;/g, '&').replace(/&#(x[\da-f]+|\d+);/gi, (match, number) => {
  const point = Number.parseInt(number.replace(/^x/i, ''), /^x/i.test(number) ? 16 : 10);
  return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
});

/** Only the publisher's designated preview metadata, never an arbitrary body image. */
export function pageImageHints(html, item) {
  const images = [], canonical = [];
  for (const tag of html.match(/<(?:meta|link)\b[^>]*>/gi)?.slice(0, 300) ?? []) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((match) => [match[1].toLowerCase(), decodeAttribute(match[2] ?? match[3])]));
    if ((attrs.property ?? attrs.name)?.toLowerCase() === 'og:image' && attrs.content) images.push(attrs.content);
    if (attrs.rel?.toLowerCase() === 'canonical' && attrs.href) canonical.push(attrs.href);
  }
  if (canonical.some((url) => { try { return canonicalMediaUrl(url) !== item.url; } catch { return true; } })) return [];
  return images.slice(0, 2);
}

function limitRequests(limit = 4) {
  let active = 0;
  const waiting = [];
  return async (operation) => {
    if (active >= limit) await new Promise((resolve) => waiting.push(resolve));
    else active++;
    try { return await operation(); }
    finally { if (waiting.length) waiting.shift()(); else active--; }
  };
}

async function enrichPicture(item, source, hints, old, fetcher, request, cache) {
  let candidates = hints ?? [];
  let playback = old?.playback ?? item.playback;
  if (source.type === 'rss') {
    try {
      const html = await request(() => fetchBytes(item.url, fetcher, { accept: 'text/html' }));
      candidates = [...pageImageHints(html.toString('utf8'), item), ...candidates];
      playback = publisherPlayback(item, html.toString('utf8')) ?? undefined;
    } catch { /* Feed preview metadata remains valid when the article cannot be checked. */ }
  }
  const verified = [];
  for (const url of [...new Set(candidates)].filter((url) => imageForSource(url, source, item)).slice(0, 4)) {
    try {
      if (!cache.has(url)) cache.set(url, request(async () => {
        let deliveredUrl = url;
        const bytes = await fetchBytes(url, fetcher, { accept: 'image/jpeg,image/png,image/webp', limit: MAX_IMAGE_BYTES, image: true, redirectCheck: (destination) => {
          if (!imageForSource(destination, source, item)) return false;
          deliveredUrl = destination; return true;
        } });
        return { url: deliveredUrl, ...imageDimensions(bytes), fingerprint: createHash('sha256').update(bytes).digest('hex').slice(0, 16) };
      }));
      const size = await cache.get(url);
      // A missing YouTube maxres thumbnail may return a successful 120px placeholder.
      if (size.width < (source.type === 'apple' ? 600 : 640) || size.height < 300 || size.width > 4000 || size.height > 4000 || size.width / size.height > 4 || size.height / size.width > 4) continue;
      verified.push(size);
      if (item.youtubeId) break; // Highest verified video quality is tried first.
    } catch { /* Picture failures must not prevent fresh reporting from publishing. */ }
  }
  verified.sort((a, b) => b.width * b.height - a.width * a.height);
  const metadata = { ...item };
  // Atom has no embedding flag; keep a prior explicit permission for this exact
  // recording until a verified API/watch response supplies a new value.
  if (metadata.embedAllowed === undefined && typeof old?.embedAllowed === 'boolean'
    && item.youtubeId && old.youtubeId === item.youtubeId && canonicalMediaUrl(old.url) === canonicalMediaUrl(item.url)) {
    metadata.embedAllowed = old.embedAllowed;
  }
  delete metadata.playback;
  return { ...metadata, ...(playback ? { playback } : {}), image: verified[0] ?? (old?.image && old.image.width >= 600 && old.image.height >= 300 && imageForSource(old.image.url, source, item) ? old.image : null) };
}

/** Give every contributing source a turn before one prolific channel can fill the edition. */
export function selectAutomaticMedia(groups, curated, limit) {
  const seen = new Set(curated.map((item) => canonicalMediaUrl(item.url)));
  const selected = [];
  const ordered = groups.map((items) => [...items].sort(newest));
  while (selected.length < limit) {
    const available = ordered.filter((items) => {
      while (items.length && seen.has(canonicalMediaUrl(items[0].url))) items.shift();
      return items.length;
    }).sort((a, b) => newest(a[0], b[0]));
    if (!available.length) break;
    for (const items of available) {
      if (selected.length >= limit) break;
      while (items.length && seen.has(canonicalMediaUrl(items[0].url))) items.shift();
      if (!items.length) continue;
      const item = items.shift(), canonical = canonicalMediaUrl(item.url);
      seen.add(canonical); selected.push(item);
    }
  }
  return selected.sort(newest);
}

/** Sources fail independently. A failed check never re-dates its previously verified items. */
export async function refreshMedia({ curated, previous = null, sources = MEDIA_SOURCES, now = new Date(), fetcher = fetch, onError = console.warn, perSource = 6, maxItems = curated.items.length + 60, youtubeApiKey = null }) {
  validateMediaCollection(curated);
  if (previous) validateMediaCollection(previous);
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(perSource) || perSource < 1 || perSource > 60 || !Number.isInteger(maxItems) || maxItems < curated.items.length || maxItems > 300) throw new Error('Invalid media refresh bounds');
  const attemptedAt = now.toISOString(), outlets = new Map(curated.outlets.map((outlet) => [outlet.id, outlet]));
  const request = limitRequests(), pictureCache = new Map();
  const checked = await Promise.all(sources.map(async (source) => {
    if (!/^[a-z0-9-]+$/.test(source.id) || !outlets.has(source.outletId)) throw new Error('Unknown media source outlet');
    const old = previous?.sources?.find((entry) => entry.id === source.id && entry.url === source.url);
    const oldItems = old?.checkedAt ? previous.items.filter((item) => item.id.startsWith(prefix(source)))
      .map((item) => ({ ...item, context: contextAt(item.publishedAt, now) })) : [];
    try {
      const imageHints = new Map(), excludedUrls = new Set();
      let fresh;
      const fromDiscovery = (discovery) => {
        for (const id of discovery.excludedVideoIds) excludedUrls.add(`https://www.youtube.com/watch?v=${id}`);
        return discovery.records.map((recording) => itemFrom(recording, source, now)).filter(Boolean);
      };
      if (source.type === 'youtube' && youtubeApiKey) {
        fresh = fromDiscovery(await discoverYouTubeApi(source, { apiKey: youtubeApiKey, now, limit: perSource,
          fetchText: async (url, headers) => (await request(() => fetchBytes(url, fetcher, { accept: 'application/json', headers }))).toString('utf8') }));
      } else {
        try { fresh = parseMediaSource(await request(() => fetchSource(source, fetcher)), source, now, imageHints, excludedUrls).slice(0, perSource); }
        catch (error) {
          if (source.type !== 'youtube') throw error;
          fresh = fromDiscovery(await discoverYouTubeChannel(source, { now, limit: perSource,
            fetchText: async (url) => (await request(() => fetchBytes(url, fetcher, { accept: 'text/html' }))).toString('utf8') }));
        }
      }
      if (source.type === 'youtube') for (const item of fresh) imageHints.set(item.url, ['maxresdefault', 'sddefault', 'hqdefault'].map((quality) => `https://i.ytimg.com/vi/${item.youtubeId}/${quality}.jpg`));
      const enriched = await Promise.all(fresh.map((item) => enrichPicture(item, source, imageHints.get(item.url), oldItems.find((oldItem) => oldItem.url === item.url), fetcher, request, pictureCache)));
      const merged = new Map(oldItems.filter((item) => !excludedUrls.has(canonicalMediaUrl(item.url))).map((item) => [canonicalMediaUrl(item.url), item]));
      enriched.forEach((item) => merged.set(item.url, item));
      const items = [...merged.values()].sort(newest).slice(0, perSource);
      return { source, items, state: { id: source.id, name: source.name, url: source.url, status: 'ready', checkedAt: attemptedAt, attemptedAt, itemCount: 0 } };
    } catch (error) {
      onError(`${source.name}: ${error.message}; ${old?.checkedAt ? 'retaining last verified media' : 'media unavailable'}.`);
      const retained = oldItems.sort(newest).slice(0, perSource);
      const items = source.type === 'youtube' ? await Promise.all(retained.map((item) => enrichPicture(item, source,
        ['maxresdefault', 'sddefault', 'hqdefault'].map((quality) => `https://i.ytimg.com/vi/${item.youtubeId}/${quality}.jpg`), item, fetcher, request, pictureCache))) : retained;
      return { source, items, state: { id: source.id, name: source.name, url: source.url, status: old?.checkedAt ? 'retained' : 'unavailable', checkedAt: old?.checkedAt ?? null, attemptedAt, itemCount: 0 } };
    }
  }));
  const automatic = selectAutomaticMedia(checked.map(({ items }) => items), curated.items, maxItems - curated.items.length);
  const successfulChecks = checked.flatMap(({ state }) => state.checkedAt ? [state.checkedAt] : []);
  const checkedAt = [curated.checkedAt, ...successfulChecks].sort().at(-1);
  const curatedItems = await Promise.all(curated.items.map(async (item) => {
    const host = new URL(item.url).hostname;
    if (!item.youtubeId && !['www.newyorkjets.com', 'sny.tv', 'www.sny.tv', 'www.audacy.com', 'jetsxfactor.com', 'nypost.com'].includes(host)) return item;
    const source = item.youtubeId ? { type: 'youtube' } : { type: 'rss', host };
    const hints = item.youtubeId ? ['maxresdefault', 'sddefault', 'hqdefault'].map((quality) => `https://i.ytimg.com/vi/${item.youtubeId}/${quality}.jpg`) : item.image ? [item.image.url] : [];
    return enrichPicture(item, source, hints, previous?.items.find((old) => old.id === item.id) ?? item, fetcher, request, pictureCache);
  }));
  return validateMediaCollection({ schemaVersion: 1, checkedAt, curatedCheckedAt: curated.checkedAt, items: [...curatedItems, ...automatic], outlets: curated.outlets,
    sources: checked.map(({ source, state }) => ({ ...state, itemCount: automatic.filter((item) => item.id.startsWith(prefix(source))).length })),
  });
}

export async function refreshMediaFiles({ root = process.cwd(), ...options } = {}) {
  const curated = JSON.parse(await readFile(path.join(root, 'src', 'lib', 'media-catalog.json'), 'utf8'));
  const out = path.join(root, 'public', 'data');
  await mkdir(out, { recursive: true });
  return withDataLock(out, async () => {
    const destination = path.join(out, 'media.json');
    let previous = null;
    try { previous = JSON.parse(await readFile(destination, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const collection = await refreshMedia({ curated, previous, youtubeApiKey: process.env.YOUTUBE_API_KEY, ...options });
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, `${JSON.stringify(collection, null, 2)}\n`); await rename(temporary, destination); }
    finally { await rm(temporary, { force: true }); }
    return collection;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  refreshMediaFiles().then((collection) => {
    console.log(`Media refreshed: ${collection.items.length} items; ${collection.sources.filter((source) => source.status === 'ready').length}/${collection.sources.length} publishers checked successfully.`);
  }).catch((error) => { console.error(`Media refresh failed: ${error.message}`); process.exitCode = 1; });
}
