import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { canonicalMediaUrl, imageDimensions, imageForSource, MEDIA_SOURCES, pageImageHints, parseMediaSource, refreshMedia, refreshMediaFiles } from './refresh-media.mjs';
import { mediaImage, validateMediaCollection } from '../src/lib/media.ts';

const now = new Date('2026-10-09T22:00:00Z');
const oldCheck = '2026-10-08T22:00:00.000Z';
// Explicit parser fixtures; the team's own feeds are not part of the live Media Room.
const news = { id: 'jets-news', outletId: 'jets', name: 'New York Jets news', url: 'https://www.newyorkjets.com/rss/news', type: 'rss', kind: 'article', host: 'www.newyorkjets.com', pathname: /^\/news\//, topics: ['Reporting'] };
const videos = { ...news, id: 'jets-videos', name: 'New York Jets videos', url: 'https://www.newyorkjets.com/rss/videos', kind: 'video', pathname: /^\/video\//, topics: ['Team video'] };
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

test('the registered Media Room feeds exclude team publishing and retain verified publisher identities', async () => {
  const catalog = JSON.parse(await readFile(new URL('../src/lib/media-catalog.json', import.meta.url), 'utf8'));
  const outlets = new Set(catalog.outlets.map((value) => value.id));
  assert.equal(outlets.has('jets'), false);
  assert.equal(new Set(MEDIA_SOURCES.map((source) => source.id)).size, MEDIA_SOURCES.length);
  for (const source of MEDIA_SOURCES) {
    assert.notEqual(source.outletId, 'jets');
    assert.doesNotMatch(new URL(source.url).hostname, /(?:^|\.)newyorkjets\.com$/);
    assert.equal(outlets.has(source.outletId), true, `${source.id} has its attributable outlet`);
    if (source.type === 'youtube') {
      const url = new URL(source.url);
      assert.equal(url.hostname, 'www.youtube.com');
      assert.equal(url.pathname, '/feeds/videos.xml');
      assert.equal(url.searchParams.get('channel_id'), source.channelId);
      assert.match(source.channelId, /^UC[A-Za-z0-9_-]{22}$/);
    }
    if (source.type === 'apple') {
      const url = new URL(source.url);
      assert.equal(url.hostname, 'itunes.apple.com');
      assert.equal(url.searchParams.get('id'), String(source.podcastId));
      assert.equal(url.searchParams.get('entity'), 'podcastEpisode');
    }
  }
  for (const item of catalog.items) {
    assert.notEqual(item.outletId, 'jets');
    assert.doesNotMatch(new URL(item.url).hostname, /(?:^|\.)newyorkjets\.com$/);
  }
});

test('fan channels and current WFAN shows use their researched channel and podcast identities', () => {
  const channels = {
    'wfan-videos': 'UCSZ8QL2xzTHzW4ucCy1cjog',
    'jets-central': 'UCPrLo3MozRhkbV-XCPsQxDg',
    'matt-oleary': 'UCLS0BYK5W7eT_SxW6pQA19w',
    'greenbean-jetsfan': 'UC3gaW1ds7Q0fy51vA0J5y2g',
    'jets-media': 'UCNfqKk4bSwaBNPnPSo6eZ4w',
    'jets-talk-247': 'UCJ_CFZh_SqFLp6-71wdakVw',
    'talkin-jets': 'UCT6QwygPvX84-Y_fQryCtvA',
  };
  for (const [id, channelId] of Object.entries(channels)) {
    const source = MEDIA_SOURCES.find((value) => value.id === id);
    assert.equal(source?.channelId, channelId, id);
    assert.equal(source.type, 'youtube');
    assert.equal(source.jetsOnly, true);
  }
  for (const [id, podcastId] of Object.entries({ 'wfan-boomer-gio': 386001601, 'wfan-evan-tiki': 386002649, 'wfan-carton': 942553546, 'wfan-daily': 386002669 })) {
    const source = MEDIA_SOURCES.find((value) => value.id === id);
    assert.equal(source?.podcastId, podcastId, id);
    assert.equal(source.type, 'apple');
    assert.equal(source.outletId, 'wfan');
    assert.equal(source.jetsOnly, true);
  }
  const carton = MEDIA_SOURCES.find((value) => value.id === 'wfan-carton');
  assert.match(carton.name, /Carton/);
  assert.doesNotMatch(carton.name, /Roberts/);
});

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

test('mixed-sports videos include Jets discussion named only in the description and omit unrelated episodes', () => {
  const source = MEDIA_SOURCES.find((value) => value.id === 'bt-unleashed');
  const generic = atom(source).replace('Jets film review', 'New York sports roundtable');
  const description = (value) => generic.replace('</entry>', `<media:group><media:description>${value}</media:description></media:group></entry>`);
  const [item] = parseMediaSource(description('Giants and Jets reaction after Sunday'), source, now);
  assert.equal(item.title, 'New York sports roundtable');
  assert.equal(item.summary.includes('Giants and Jets reaction'), false);
  assert.equal(parseMediaSource(description('Yankees and Mets playoff discussion'), source, now).length, 0);
  assert.equal(parseMediaSource(generic, source, now).length, 0);
});

test('mixed-sports RSS uses description relevance without copying the publisher description', () => {
  const source = { ...news, jetsOnly: true };
  const generic = xmlItem('roundtable').replace('Jets &amp; Browns practice', 'New York sports roundtable');
  const [item] = parseMediaSource(rss(generic.replace('</item>', '<description>Giants and NYJ roster discussion.</description></item>')), source, now);
  assert.equal(item.title, 'New York sports roundtable');
  assert.equal(item.summary.includes('NYJ roster'), false);
  assert.equal(parseMediaSource(rss(generic.replace('</item>', '<description>Yankees and Mets playoff discussion.</description></item>')), source, now).length, 0);
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

test('WFAN keeps a mixed-sports episode with Jets coverage in its description and excludes unrelated sports', () => {
  const source = MEDIA_SOURCES.find((value) => value.id === 'wfan-boomer-gio');
  const podcast = { kind: 'podcast', collectionId: source.podcastId, artistName: 'WFAN' };
  const episode = { kind: 'podcast-episode', collectionId: source.podcastId, trackId: 100002, trackName: 'Hour 2: Monday morning reaction', description: 'Jets coaching and Giants offense discussion.', releaseDate: '2026-10-09T20:00:00Z', trackViewUrl: `https://podcasts.apple.com/us/podcast/boomer-gio/id${source.podcastId}?i=100002` };
  const body = (description) => JSON.stringify({ results: [podcast, { ...episode, description }] });
  const [item] = parseMediaSource(body(episode.description), source, now);
  assert.equal(item.outletId, 'wfan');
  assert.equal(item.title, episode.trackName);
  assert.equal(item.author, 'WFAN');
  assert.equal(item.summary.includes(episode.description), false);
  assert.equal(parseMediaSource(body('Yankees and Mets playoff discussion.'), source, now).length, 0);
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

test('removed team feeds cannot leak back from previous editions during either fresh or retained checks', async () => {
  const source = MEDIA_SOURCES.find((value) => value.id === 'new-york-post');
  const publisher = { id: source.outletId, name: source.name, kind: 'beat', url: 'https://nypost.com/', people: ['Reporter'] };
  const body = rss(xmlItem('roundtable').replace('https://www.newyorkjets.com/news/roundtable', 'https://nypost.com/2026/10/09/sports/jets-roundtable/'));
  const oldCurated = { ...curated, outlets: [outlet, publisher] };
  const previous = await refresh({ curated: oldCurated, sources: [news, videos, source], fetcher: fetcher(new Map([[news.url, rss(xmlItem())], [videos.url, rss(xmlItem('film').replace('/news/', '/video/'))], [source.url, body]])) });
  assert.equal(previous.items.filter((item) => item.outletId === 'jets').length, 2);
  for (const upstream of [body, new Error('publisher temporarily unavailable')]) {
    const requested = [];
    const result = await refresh({ curated: { ...curated, outlets: [publisher] }, previous, sources: [source], fetcher: async (url, options) => {
      requested.push(url);
      return fetcher(new Map([[source.url, upstream]]))(url, options);
    } });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].outletId, source.outletId);
    assert.deepEqual(result.sources.map((value) => value.id), [source.id]);
    assert.equal(result.sources[0].status, upstream instanceof Error ? 'retained' : 'ready');
    assert.equal(requested.some((url) => new URL(url).hostname === 'www.newyorkjets.com'), false);
    assert.equal(result.items.some((item) => item.id.startsWith('auto-jets-news-') || item.id.startsWith('auto-jets-videos-')), false);
  }
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

const jpeg = (width, height) => {
  const data = Buffer.from([255, 216, 255, 192, 0, 11, 8, 0, 0, 0, 0, 1, 1, 17, 0, 255, 217]);
  data.writeUInt16BE(height, 7); data.writeUInt16BE(width, 9);
  return new Response(data, { headers: { 'Content-Type': 'image/jpeg' } });
};
const jetsPicture = (name) => `https://static.clubs.nfl.com/image/upload/t_editorial_landscape_12_desktop/jets/${name}.jpg`;
const enclosure = (url, attrs = '') => `<media:content url="${url}" medium="image" ${attrs}/><enclosure url="${url}" type="image/jpeg"/>`;
const verifiedImage = (value) => {
  const { fingerprint, ...image } = value;
  assert.match(fingerprint, /^[a-f0-9]{16}$/);
  return image;
};

test('RSS pictures use actual pixels, choose a larger publisher candidate, and avoid unassociated hosts', async () => {
  const small = jetsPicture('small'), large = jetsPicture('large'), foreign = 'https://media.pff.com/foreign.jpg';
  const body = rss(xmlItem('practice', `${enclosure(small, 'width="2000" height="1000"')}${enclosure(large, 'width="20" height="20"')}${enclosure(foreign)}`));
  const calls = [], responses = new Map([[news.url, body], [small, jpeg(640, 360)], [large, jpeg(1280, 720)]]);
  const result = await refresh({ fetcher: async (url, options) => { calls.push(url); return fetcher(responses)(url, options); } });
  assert.deepEqual(verifiedImage(result.items[0].image), { url: large, width: 1280, height: 720 });
  assert.equal(calls.includes(foreign), false);
  assert.equal(result.sources[0].status, 'ready');
});

test('canonical publisher og:image supplies the associated picture; body images and another page canonical are ignored', async () => {
  const item = parseMediaSource(rss(xmlItem()), news, now)[0], large = jetsPicture('original');
  const html = `<html><head><link rel="canonical" href="${item.url}"><meta property="og:image" content="${large}"></head><body><img src="${jetsPicture('unrelated')}"></body></html>`;
  assert.deepEqual(pageImageHints(html, item), [large]);
  assert.deepEqual(pageImageHints(html.replace(item.url, item.url + '-different'), item), []);
  const result = await refresh({ fetcher: fetcher(new Map([[news.url, rss(xmlItem())], [item.url, html], [large, jpeg(1600, 900)]])) });
  assert.deepEqual(verifiedImage(result.items[0].image), { url: large, width: 1600, height: 900 });
});

test('picture fetch failures retain the same item’s last verified art without blocking new metadata', async () => {
  const picture = jetsPicture('stable'), body = rss(xmlItem('practice', enclosure(picture)));
  const previous = await refresh({ fetcher: fetcher(new Map([[news.url, body], [picture, jpeg(1280, 720)]])) });
  const nextBody = body.replace('Jets &amp; Browns practice', 'Jets &amp; Browns update');
  const result = await refresh({ previous, fetcher: fetcher(new Map([[news.url, nextBody], [picture, new Error('timeout')]])) });
  assert.equal(result.items[0].title, 'Jets & Browns update');
  assert.deepEqual(result.items[0].image, previous.items[0].image);
  assert.equal(result.sources[0].status, 'ready');
});

test('tiny images, non-image responses, redirects and oversized art produce a picture-free item', async () => {
  const picture = jetsPicture('tiny'), body = rss(xmlItem('practice', enclosure(picture)));
  for (const response of [jpeg(120, 90), new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }), new Response('', { status: 302, headers: { Location: 'http://127.0.0.1/private' } }), new Response('x', { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '99999999' } })]) {
    const result = await refresh({ fetcher: fetcher(new Map([[news.url, body], [picture, response]])) });
    assert.equal(result.items[0].image, null);
    assert.equal(result.sources[0].status, 'ready');
  }
});

test('YouTube uses measured maxres, falls back to real sddefault, and withholds successful tiny placeholders', async () => {
  const source = MEDIA_SOURCES.find((value) => value.id === 'jake-asman');
  const outlet = { id: source.outletId, name: source.name, kind: 'independent', url: 'https://www.youtube.com/@JakeAsman', people: ['Jake Asman'] };
  const options = { curated: { ...curated, outlets: [outlet] }, sources: [source] };
  const url = (quality) => `https://i.ytimg.com/vi/abcdEF12345/${quality}.jpg`;
  const best = await refresh({ ...options, fetcher: fetcher(new Map([[source.url, atom(source)], [url('maxresdefault'), jpeg(1280, 720)]])) });
  assert.deepEqual(verifiedImage(mediaImage(best.items[0])), { url: url('maxresdefault'), width: 1280, height: 720 });
  const fallback = await refresh({ ...options, fetcher: fetcher(new Map([[source.url, atom(source)], [url('maxresdefault'), jpeg(120, 90)], [url('sddefault'), jpeg(640, 480)]])) });
  assert.equal(mediaImage(fallback.items[0]).url, url('sddefault'));
  const none = await refresh({ ...options, fetcher: fetcher(new Map([[source.url, atom(source)], [url('maxresdefault'), jpeg(120, 90)], [url('sddefault'), jpeg(120, 90)], [url('hqdefault'), jpeg(480, 360)]])) });
  assert.equal(mediaImage(none.items[0]), null);
  assert.throws(() => validateMediaCollection({ ...best, items: [{ ...best.items[0], image: { ...best.items[0].image, url: url('maxresdefault').replace('abcdEF12345', 'foreign1234') } }] }), /video picture/);
  assert.throws(() => validateMediaCollection({ ...best, items: [{ ...best.items[0], image: { ...best.items[0].image, url: jetsPicture('unrelated') } }] }), /video picture/);
});

test('Apple artwork is associated with the verified episode or podcast and measured instead of resizing a URL', async () => {
  const source = MEDIA_SOURCES.find((value) => value.id === 'jets-collective');
  const art = 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/publisher/cover.jpg/600x600bb.jpg';
  const body = JSON.stringify({ results: [{ kind: 'podcast', collectionId: source.podcastId, artworkUrl600: art }, { kind: 'podcast-episode', collectionId: source.podcastId, trackId: 100001, trackName: 'Jets discussion', releaseDate: now.toISOString(), trackViewUrl: `https://podcasts.apple.com/us/podcast/jets-collective/id${source.podcastId}?i=100001` }] });
  const result = await refresh({ curated: { ...curated, outlets: [{ ...outlet, id: source.outletId }] }, sources: [source], fetcher: fetcher(new Map([[source.url, body], [art, jpeg(600, 600)]])) });
  assert.deepEqual(verifiedImage(result.items[0].image), { url: art, width: 600, height: 600 });
  assert.equal(imageForSource('https://is1-ssl.mzstatic.com/image/thumb/Music211/unrelated/600x600bb.jpg', source, result.items[0]), false);
  assert.equal(imageForSource('https://static.clubs.nfl.com/image/upload/jets/somebody.jpg', source, result.items[0]), false);
});

test('raster dimension checks cover JPEG, PNG and WebP without trusting malformed headers', async () => {
  assert.deepEqual(imageDimensions(await jpeg(1920, 1080).arrayBuffer()), { width: 1920, height: 1080 });
  const png = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png); png.write('IHDR', 12); png.writeUInt32BE(1280, 16); png.writeUInt32BE(720, 20);
  assert.deepEqual(imageDimensions(png), { width: 1280, height: 720 });
  const webp = Buffer.alloc(30); webp.write('RIFF'); webp.write('WEBP', 8); webp.write('VP8X', 12); webp.writeUIntLE(599, 24, 3); webp.writeUIntLE(599, 27, 3);
  assert.deepEqual(imageDimensions(webp), { width: 600, height: 600 });
  for (const input of ['<svg width="2000" height="1000"/>', Buffer.from([255, 216, 255, 192, 0, 255, 8]), Buffer.alloc(24)]) assert.throws(() => imageDimensions(input), /invalid raster/);
});

test('curated publisher recordings gain verified playback and retain it only during a failed check', async () => {
  const item = { ...parseMediaSource(rss(xmlItem()), news, now)[0], id: 'sny-verified-video', kind: 'video', outletId: 'sny', title: 'Bart Scott on the Jets running game', url: 'https://sny.tv/video/bart-scott-on-jets-running-game', image: null };
  const sny = { id: 'sny', name: 'SNY', kind: 'tv', url: 'https://sny.tv/', people: ['Bart Scott'] };
  const ownCurated = { ...curated, checkedAt: now.toISOString(), items: [item], outlets: [outlet, sny] };
  const stream = 'https://cdn.jwplayer.com/videos/DVpjLn82-1lACodv2.mp4';
  const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'VideoObject', name: item.title, url: item.url, contentUrl: stream })}</script>`;
  const first = await refresh({ curated: ownCurated, fetcher: fetcher(new Map([[news.url, rss(xmlItem())], [item.url, html]])) });
  const recording = first.items.find((value) => value.id === item.id);
  assert.deepEqual(recording.playback, { kind: 'video', url: stream, type: 'video/mp4' });
  assert.equal(recording.summary, item.summary);
  const retained = await refresh({ curated: ownCurated, previous: first, fetcher: fetcher(new Map([[news.url, rss(xmlItem())], [item.url, new Error('timeout')]])) });
  assert.deepEqual(retained.items.find((value) => value.id === item.id).playback, recording.playback);
  const removed = await refresh({ curated: ownCurated, previous: first, fetcher: fetcher(new Map([[news.url, rss(xmlItem())], [item.url, '<html><title>Video unavailable</title></html>']])) });
  assert.equal(removed.items.find((value) => value.id === item.id).playback, undefined);
  assert.throws(() => validateMediaCollection({ ...first, items: first.items.map((value) => value.id === item.id ? { ...value, playback: { kind: 'video', url: 'https://evil.example/stream.mp4' } } : value) }), /Invalid media playback/);
});

test('a publisher image CDN redirect stores only the checked final picture URL', async () => {
  const original = jetsPicture('preview'), delivered = jetsPicture('delivery'), body = rss(xmlItem('practice', enclosure(original)));
  const result = await refresh({ fetcher: fetcher(new Map([[news.url, body], [original, new Response('', { status: 302, headers: { Location: delivered } })], [delivered, jpeg(1280, 720)]])) });
  assert.deepEqual(verifiedImage(result.items[0].image), { url: delivered, width: 1280, height: 720 });
  const second = jetsPicture('second');
  const chained = await refresh({ fetcher: fetcher(new Map([[news.url, body], [original, new Response('', { status: 302, headers: { Location: delivered } })], [delivered, new Response('', { status: 302, headers: { Location: second } })], [second, jpeg(1280, 720)]])) });
  assert.equal(chained.items[0].image, null);
});

test('a retained verified YouTube identity can improve its picture without inventing a fresh feed check', async () => {
  const source = MEDIA_SOURCES.find((value) => value.id === 'jake-asman');
  const ytOutlet = { id: source.outletId, name: source.name, kind: 'independent', url: 'https://www.youtube.com/@JakeAsman', people: ['Jake Asman'] };
  const options = { curated: { ...curated, outlets: [ytOutlet] }, sources: [source] };
  const previous = await refresh({ ...options, fetcher: fetcher(new Map([[source.url, atom(source)]])) });
  const poster = 'https://i.ytimg.com/vi/abcdEF12345/maxresdefault.jpg';
  const result = await refresh({ ...options, previous, now: new Date('2026-10-10T22:00:00Z'), fetcher: fetcher(new Map([[source.url, new Error('feed offline')], [poster, jpeg(1280, 720)]])) });
  assert.deepEqual(verifiedImage(result.items[0].image), { url: poster, width: 1280, height: 720 });
  assert.equal(result.sources[0].status, 'retained');
  assert.equal(result.sources[0].checkedAt, previous.sources[0].checkedAt);
  assert.equal(result.items[0].publishedAt, previous.items[0].publishedAt);
});
