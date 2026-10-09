import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { canonicalMediaUrl, MEDIA_SOURCES, parseMediaSource, refreshMedia, refreshMediaFiles } from './refresh-media.mjs';
import { mediaImage, validateMediaCollection } from '../src/lib/media.ts';

const now = new Date('2026-10-09T22:00:00Z');
const oldCheck = '2026-10-08T22:00:00.000Z';
const news = MEDIA_SOURCES.find((source) => source.id === 'jets-news');
const videos = MEDIA_SOURCES.find((source) => source.id === 'jets-videos');
const outlet = { id: 'jets', name: 'New York Jets', kind: 'official', url: 'https://www.newyorkjets.com/', people: ['New York Jets'] };
const curated = { checkedAt: oldCheck, items: [], outlets: [outlet] };
const xmlItem = (slug = 'practice', changes = '') => `<item><title>Jets &amp; Browns practice</title><link>https://www.newyorkjets.com/news/${slug}</link><pubDate>Fri, 09 Oct 2026 20:00:00 GMT</pubDate>${changes}</item>`;
const rss = (...items) => `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Jets</title>${items.join('')}</channel></rss>`;
const fetcher = (map) => async (url) => {
  const result = map.get(url);
  if (result instanceof Error) throw result;
  return result instanceof Response ? result : new Response(result ?? '', { status: result === undefined ? 503 : 200 });
};
const refresh = (options = {}) => refreshMedia({ curated, now, sources: [news], fetcher: fetcher(new Map([[news.url, rss(xmlItem())]])), onError: () => {}, ...options });
const atom = (source, changes = '') => `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/"><yt:channelId>${source.channelId}</yt:channelId><author><name>Jake Asman</name><uri>https://www.youtube.com/channel/${source.channelId}</uri></author><entry><yt:channelId>${source.channelId}</yt:channelId><yt:videoId>abcdEF12345</yt:videoId><title>Jets film review</title><link rel="alternate" href="https://www.youtube.com/watch?v=abcdEF12345"/><published>2026-10-09T20:00:00Z</published><author><name>Jake Asman</name></author>${changes}</entry></feed>`;

test('RSS imports publisher headline, author and publication time without copying its description', () => {
  const [item] = parseMediaSource(rss(xmlItem('practice', '<dc:creator>Eric Allen</dc:creator><description>Full article body and statistics.</description>')), news, now);
  assert.equal(item.title, 'Jets & Browns practice');
  assert.equal(item.author, 'Eric Allen');
  assert.equal(item.publishedAt, '2026-10-09T20:00:00.000Z');
  assert.equal(item.summary, 'Published by New York Jets news. Open the original for the publisher’s full coverage.');
  assert.equal(item.image, null);
  assert.equal(item.seasons, undefined);
  assert.equal(item.gameIds, undefined);
});

test('future publisher entries are withheld while dated reporting remains usable', () => {
  const future = xmlItem('tomorrow').replace('Fri, 09 Oct 2026 20:00:00 GMT', 'Sat, 10 Oct 2026 20:00:00 GMT');
  const items = parseMediaSource(rss(xmlItem(), future), news, now);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://www.newyorkjets.com/news/practice');
});

test('WordPress numeric entities and first-party film routes preserve readable video attribution', () => {
  for (const [sourceId, destination] of [['jets-x-factor', 'https://jetsxfactor.com/watch/jets-film/'], ['new-york-post', 'https://nypost.com/video/jets-film/']]) {
    const source = MEDIA_SOURCES.find((entry) => entry.id === sourceId);
    const xml = rss(xmlItem().replace('https://www.newyorkjets.com/news/practice', destination).replace('Jets &amp; Browns practice', '<![CDATA[Jets&#8217; film &#124; Week 5]]>'));
    const [item] = parseMediaSource(xml, source, now);
    assert.equal(item.kind, 'video');
    assert.equal(item.title, 'Jets’ film | Week 5');
    assert.equal(item.url, destination);
  }
});

test('malformed XML, entities and cross-publisher RSS destinations are rejected', () => {
  assert.throws(() => parseMediaSource('<rss><channel>', news, now), /XML/);
  assert.throws(() => parseMediaSource('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + rss(xmlItem()), news, now), /XML/);
  assert.throws(() => parseMediaSource(rss(xmlItem().replace('www.newyorkjets.com/news/', 'nypost.com/news/')), news, now), /publisher mismatch/);
  assert.throws(() => parseMediaSource(rss(xmlItem().replace('www.newyorkjets.com/news/', 'www.newyorkjets.com/video/')), news, now), /publisher mismatch/);
  assert.throws(() => canonicalMediaUrl('https://www.newyorkjets.com.evil.example/news/item'), /Unsafe/);
});

test('YouTube verifies both channel and watch identity, with no inferred embed permission', () => {
  const source = MEDIA_SOURCES.find((value) => value.id === 'jake-asman');
  const [item] = parseMediaSource(atom(source), source, now);
  assert.equal(item.kind, 'video');
  assert.equal(item.author, 'Jake Asman');
  assert.equal(item.youtubeId, 'abcdEF12345');
  assert.equal(item.embedAllowed, undefined);
  assert.equal(item.image, undefined);
  assert.deepEqual(mediaImage(item), { url: 'https://i.ytimg.com/vi/abcdEF12345/hqdefault.jpg', width: 480, height: 360 });
  assert.doesNotThrow(() => validateMediaCollection({ checkedAt: now.toISOString(), items: [item], outlets: [{ id: source.outletId, name: source.name, kind: 'independent', url: 'https://www.youtube.com/@JakeAsman', people: ['Jake Asman'] }] }));
  assert.equal(parseMediaSource(atom(source).replace(`<yt:channelId>${source.channelId}</yt:channelId>`, `<yt:channelId>${source.channelId.slice(2)}</yt:channelId>`), source, now).length, 1);
  assert.equal(parseMediaSource(atom(source).replace('watch?v=abcdEF12345', 'shorts/abcdEF12345'), source, now)[0].url, 'https://www.youtube.com/watch?v=abcdEF12345');
  assert.throws(() => parseMediaSource(atom(source).replace(source.channelId, 'UCforeignchannel'), source, now), /channel identity/);
  assert.throws(() => parseMediaSource(atom(source).replace(`/channel/${source.channelId}`, '/channel/UCforeignchannel'), source, now), /channel identity/);
  assert.throws(() => parseMediaSource(atom(source).replace('watch?v=abcdEF12345', 'watch?v=foreign1234'), source, now), /destination identity/);
  assert.equal(parseMediaSource(atom(source).replace('Jets film review', 'Yankees game review'), source, now).length, 0);
});

test('Apple lookup uses verified episode URLs and filters unrelated sports', () => {
  const source = MEDIA_SOURCES.find((value) => value.id === 'francesa');
  const podcast = { kind: 'podcast', collectionId: source.podcastId, artistName: 'BetRivers Network' };
  const episode = { kind: 'podcast-episode', collectionId: source.podcastId, trackId: 100001, trackName: 'Football Friday', description: 'Jets and Giants discussion', releaseDate: '2026-10-09T20:00:00Z', trackViewUrl: `https://podcasts.apple.com/us/podcast/football-friday/id${source.podcastId}?i=100001&uo=4` };
  const body = (entry = episode) => JSON.stringify({ results: [podcast, entry] });
  const [item] = parseMediaSource(body(), source, now);
  assert.equal(item.url, `https://podcasts.apple.com/us/podcast/football-friday/id${source.podcastId}?i=100001`);
  assert.equal(item.author, 'BetRivers Network');
  assert.equal(item.summary.includes('Jets and Giants'), false);
  assert.throws(() => parseMediaSource(body({ ...episode, collectionId: 999 }), source, now), /identity mismatch/);
  assert.throws(() => parseMediaSource(body({ ...episode, trackViewUrl: episode.trackViewUrl.replace('i=100001', 'i=100002') }), source, now), /destination identity/);
  assert.equal(parseMediaSource(body({ ...episode, description: 'Yankees discussion' }), source, now).length, 0);
});

test('curated entries take precedence over duplicate feed and tracking URLs', async () => {
  const item = parseMediaSource(rss(xmlItem('practice')), news, now)[0];
  const original = { ...item, id: 'curated-practice', summary: 'An editorial synopsis.', url: `${item.url}?utm_source=rss` };
  const result = await refresh({ curated: { ...curated, checkedAt: now.toISOString(), items: [original] } });
  assert.deepEqual(result.items, [original]);
  assert.equal(result.sources[0].itemCount, 0);
  assert.equal(result.curatedCheckedAt, now.toISOString());
});

test('feed failures retain last good items and their successful-check timestamp independently', async () => {
  const video = rss(xmlItem('film').replace('/news/', '/video/'));
  const previous = await refresh({ sources: [news, videos], fetcher: fetcher(new Map([[news.url, rss(xmlItem())], [videos.url, video]])) });
  const later = new Date('2026-10-10T22:00:00Z');
  const result = await refresh({ previous, now: later, sources: [news, videos], fetcher: fetcher(new Map([[news.url, new Error('timeout')], [videos.url, video]])) });
  assert.equal(result.sources[0].status, 'retained');
  assert.equal(result.sources[0].checkedAt, now.toISOString());
  assert.equal(result.sources[0].attemptedAt, later.toISOString());
  assert.equal(result.sources[1].status, 'ready');
  assert.equal(result.sources[1].checkedAt, later.toISOString());
  assert.equal(result.checkedAt, later.toISOString());
  assert.deepEqual(result.items.find((item) => item.kind === 'article'), previous.items.find((item) => item.kind === 'article'));
});

test('an all-failed run advances attempts while retaining the edition success timestamp', async () => {
  const previous = await refresh();
  const result = await refresh({ previous, now: new Date('2026-10-10T22:00:00Z'), fetcher: fetcher(new Map()) });
  assert.equal(result.checkedAt, previous.checkedAt);
  assert.equal(result.curatedCheckedAt, oldCheck);
  assert.deepEqual(result.items, previous.items);
  assert.equal(result.sources[0].status, 'retained');
});

test('previous feed entries age into archive context when newer entries are future-filtered', async () => {
  const previous = await refresh();
  const later = new Date('2027-02-08T22:00:00Z');
  const future = rss(xmlItem('tomorrow').replace('Fri, 09 Oct 2026 20:00:00 GMT', 'Tue, 09 Feb 2027 20:00:00 GMT'));
  const result = await refresh({ previous, now: later, fetcher: fetcher(new Map([[news.url, future]])) });
  assert.equal(result.sources[0].status, 'ready');
  assert.equal(result.items[0].context, 'archive');
  assert.equal(result.items[0].publishedAt, previous.items[0].publishedAt);
  assert.equal(result.items[0].url, previous.items[0].url);
  const retained = await refresh({ previous, now: later, fetcher: fetcher(new Map()) });
  assert.equal(retained.items[0].context, 'archive');
  assert.equal(retained.sources[0].checkedAt, previous.sources[0].checkedAt);
});

test('first-run failures publish honest unavailable source states with curated items preserved', async () => {
  const result = await refresh({ fetcher: fetcher(new Map()) });
  assert.equal(result.checkedAt, oldCheck);
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.sources[0], { id: news.id, name: news.name, url: news.url, status: 'unavailable', checkedAt: null, attemptedAt: now.toISOString(), itemCount: 0 });
});

test('rolling feeds accumulate stable entries within six newest selections per source', async () => {
  const previous = await refresh({ fetcher: fetcher(new Map([[news.url, rss(...Array.from({ length: 8 }, (_, i) => xmlItem(`old-${i}`)))]])) });
  assert.equal(previous.items.length, 6);
  const result = await refresh({ previous, fetcher: fetcher(new Map([[news.url, rss(xmlItem('brand-new').replace('20:00:00', '21:00:00'))]])) });
  assert.equal(result.items.length, 6);
  assert.equal(result.items[0].title, 'Jets & Browns practice');
  assert.equal(result.items[0].url, 'https://www.newyorkjets.com/news/brand-new');
  assert.equal(result.sources[0].itemCount, 6);
  const capped = await refresh({ previous, maxItems: 2 });
  assert.equal(capped.items.length, 2);
  assert.equal(capped.sources[0].itemCount, 2);
});

test('oversized upstream responses retain the validated previous source', async () => {
  const previous = await refresh();
  const response = new Response('x', { headers: { 'Content-Length': '99999999' } });
  const result = await refresh({ previous, fetcher: fetcher(new Map([[news.url, response]])) });
  assert.equal(result.sources[0].status, 'retained');
  assert.deepEqual(result.items, previous.items);
});

test('file refresh writes a validated snapshot atomically and releases the shared data lock', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jets-media-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'src', 'lib'), { recursive: true });
  await writeFile(path.join(root, 'src', 'lib', 'media-catalog.json'), JSON.stringify(curated));
  const result = await refreshMediaFiles({ root, now, sources: [news], fetcher: fetcher(new Map([[news.url, rss(xmlItem())]])), onError: () => {} });
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'public', 'data', 'media.json'), 'utf8')), result);
  assert.deepEqual(await readdir(path.join(root, 'public', 'data')), ['media.json']);
  assert.deepEqual(await readdir(path.join(root, 'public')), ['data']);
});

test('a corrupt previous file fails publication instead of silently erasing retained media', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jets-media-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'src', 'lib'), { recursive: true });
  await mkdir(path.join(root, 'public', 'data'), { recursive: true });
  await writeFile(path.join(root, 'src', 'lib', 'media-catalog.json'), JSON.stringify(curated));
  await writeFile(path.join(root, 'public', 'data', 'media.json'), '{bad');
  await assert.rejects(refreshMediaFiles({ root, now, sources: [news] }), SyntaxError);
  assert.equal(await readFile(path.join(root, 'public', 'data', 'media.json'), 'utf8'), '{bad');
});
