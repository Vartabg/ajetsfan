import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { safeMediaUrl, validateMediaCollection } from '../src/lib/media.ts';
import { withDataLock } from './data-refresh.mjs';

const appleSource = (id) => `https://itunes.apple.com/lookup?id=${id}&entity=podcastEpisode&limit=100`;
const youtubeSource = (id) => `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;
const MAX_BYTES = 3 * 1024 * 1024;
const JETS = /\bjets\b|\bnyj\b|#nyjets\b|#newyorkjets\b/i;

/** Publisher feeds only. Each rendered destination is checked against its own publisher. */
export const MEDIA_SOURCES = [
  { id: 'jets-news', outletId: 'jets', name: 'New York Jets news', url: 'https://www.newyorkjets.com/rss/news', type: 'rss', kind: 'article', host: 'www.newyorkjets.com', pathname: /^\/news\//, topics: ['Reporting'] },
  { id: 'jets-videos', outletId: 'jets', name: 'New York Jets videos', url: 'https://www.newyorkjets.com/rss/videos', type: 'rss', kind: 'video', host: 'www.newyorkjets.com', pathname: /^\/video\//, topics: ['Team video'] },
  { id: 'jets-x-factor', outletId: 'jets-x-factor', name: 'Jets X-Factor', url: 'https://jetsxfactor.com/feed/', type: 'rss', kind: 'article', host: 'jetsxfactor.com', pathname: /^\/(?:\d{4}\/\d{2}\/\d{2}\/|watch\/)/, videoPathname: /^\/watch\//, topics: ['Analysis'] },
  { id: 'new-york-post', outletId: 'new-york-post', name: 'New York Post Jets', url: 'https://nypost.com/tag/new-york-jets/feed/', type: 'rss', kind: 'article', host: 'nypost.com', pathname: /^\/(?:\d{4}\/\d{2}\/\d{2}\/sports\/|video\/)/, videoPathname: /^\/video\//, topics: ['Beat reporting'] },
  { id: 'jake-asman', outletId: 'jake-asman-show', name: 'The Jake Asman Show', url: youtubeSource('UCt8ZeGlv3VM8jLYO_EoDMPw'), channelId: 'UCt8ZeGlv3VM8jLYO_EoDMPw', type: 'youtube', kind: 'video', topics: ['Fan analysis'], jetsOnly: true },
  { id: 'bt-unleashed', outletId: 'bt-unleashed', name: 'BT Unleashed', url: youtubeSource('UCLJ2gpZBFl2ytuVlbNo9xAA'), channelId: 'UCLJ2gpZBFl2ytuVlbNo9xAA', type: 'youtube', kind: 'video', topics: ['Fan analysis'], jetsOnly: true },
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

function itemFrom({ title, publishedAt, url, author, youtubeId }, source, now) {
  const date = Date.parse(publishedAt);
  if (!Number.isFinite(date)) throw new Error('Invalid publisher publication date');
  if (date > now.getTime()) return null;
  const canonical = canonicalMediaUrl(url);
  return {
    id: `${prefix(source)}${createHash('sha256').update(canonical).digest('hex').slice(0, 24)}`,
    title: plainText(title, 250, 'publisher headline'), kind: source.kind, outletId: source.outletId,
    author: plainText(author, 180, 'publisher author'), publishedAt: new Date(date).toISOString(), url: canonical,
    ...(youtubeId ? { youtubeId } : { image: null }),
    summary: `Published by ${source.name}. Open the original for the publisher’s full coverage.`,
    topics: [...source.topics], context: contextAt(publishedAt, now),
    // Publication year does not establish the football season or a recorded game.
  };
}

function parseXml(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES || /<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true) throw new Error('Invalid publisher feed XML');
  return new XMLParser({ parseTagValue: false, trimValues: true, ignoreAttributes: false }).parse(text);
}

export function parseMediaSource(text, source, now = new Date()) {
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
      if (source.jetsOnly && !JETS.test(`${entry.trackName ?? ''} ${entry.description ?? ''}`)) continue;
      parsed.push(itemFrom({ title: entry.trackName, publishedAt: entry.releaseDate, url: url.href, author: entry.artistName ?? podcast.artistName ?? source.name }, source, now));
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
        if (source.jetsOnly && !JETS.test(`${entry.title ?? ''} ${entry['media:group']?.['media:description'] ?? ''}`)) continue;
        parsed.push(itemFrom({ title: entry.title, publishedAt: entry.published, url: url.href, author: entry.author?.name ?? source.name, youtubeId: entry['yt:videoId'] }, source, now));
      }
    } else {
      const feed = document.rss?.channel;
      if (!feed || !rows(feed.item).length) throw new Error('Publisher RSS has no items');
      for (const entry of rows(feed.item).slice(0, 240)) {
        const url = new URL(canonicalMediaUrl(entry.link));
        if (url.hostname !== source.host || !source.pathname.test(url.pathname)) throw new Error('RSS destination publisher mismatch');
        if (source.jetsOnly && !JETS.test(`${entry.title ?? ''} ${entry.description ?? ''}`)) continue;
        const itemSource = source.videoPathname?.test(url.pathname) ? { ...source, kind: 'video' } : source;
        parsed.push(itemFrom({ title: entry.title, publishedAt: entry.pubDate, url: url.href, author: entry['dc:creator'] ?? entry.author ?? source.name }, itemSource, now));
      }
    }
  }
  const unique = new Map();
  for (const item of parsed.filter(Boolean).sort(newest)) if (!unique.has(item.url)) unique.set(item.url, item);
  return [...unique.values()];
}

async function fetchSource(source, fetcher) {
  const response = await fetcher(source.url, { signal: AbortSignal.timeout(30_000), redirect: 'error', headers: { Accept: source.type === 'apple' ? 'application/json' : 'application/rss+xml, application/atom+xml, text/xml' } });
  if (!response.ok) throw new Error(`Publisher HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Publisher response exceeds size limit');
  if (!response.body) throw new Error('Publisher response has no body');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Publisher response exceeds size limit'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}

/** Sources fail independently. A failed check never re-dates its previously verified items. */
export async function refreshMedia({ curated, previous = null, sources = MEDIA_SOURCES, now = new Date(), fetcher = fetch, onError = console.warn, perSource = 6, maxItems = curated.items.length + 60 }) {
  validateMediaCollection(curated);
  if (previous) validateMediaCollection(previous);
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(perSource) || perSource < 1 || perSource > 60 || !Number.isInteger(maxItems) || maxItems < curated.items.length || maxItems > 300) throw new Error('Invalid media refresh bounds');
  const attemptedAt = now.toISOString(), outlets = new Map(curated.outlets.map((outlet) => [outlet.id, outlet]));
  const checked = await Promise.all(sources.map(async (source) => {
    if (!/^[a-z0-9-]+$/.test(source.id) || !outlets.has(source.outletId)) throw new Error('Unknown media source outlet');
    const old = previous?.sources?.find((entry) => entry.id === source.id && entry.url === source.url);
    const oldItems = old?.checkedAt ? previous.items.filter((item) => item.id.startsWith(prefix(source)))
      .map((item) => ({ ...item, context: contextAt(item.publishedAt, now) })) : [];
    try {
      const fresh = parseMediaSource(await fetchSource(source, fetcher), source, now);
      const merged = new Map(oldItems.map((item) => [canonicalMediaUrl(item.url), item]));
      fresh.forEach((item) => merged.set(item.url, item));
      const items = [...merged.values()].sort(newest).slice(0, perSource);
      return { source, items, state: { id: source.id, name: source.name, url: source.url, status: 'ready', checkedAt: attemptedAt, attemptedAt, itemCount: 0 } };
    } catch (error) {
      onError(`${source.name}: ${error.message}; ${old?.checkedAt ? 'retaining last verified media' : 'media unavailable'}.`);
      return { source, items: oldItems.sort(newest).slice(0, perSource), state: { id: source.id, name: source.name, url: source.url, status: old?.checkedAt ? 'retained' : 'unavailable', checkedAt: old?.checkedAt ?? null, attemptedAt, itemCount: 0 } };
    }
  }));
  const seen = new Set(curated.items.map((item) => canonicalMediaUrl(item.url)));
  const automatic = checked.flatMap(({ items }) => items).sort(newest).filter((item) => {
    const canonical = canonicalMediaUrl(item.url);
    if (seen.has(canonical)) return false;
    seen.add(canonical); return true;
  }).slice(0, maxItems - curated.items.length);
  const successfulChecks = checked.flatMap(({ state }) => state.checkedAt ? [state.checkedAt] : []);
  const checkedAt = [curated.checkedAt, ...successfulChecks].sort().at(-1);
  return validateMediaCollection({ schemaVersion: 1, checkedAt, curatedCheckedAt: curated.checkedAt, items: [...curated.items, ...automatic], outlets: curated.outlets,
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
    const collection = await refreshMedia({ curated, previous, ...options });
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
