import test from 'node:test';
import assert from 'node:assert/strict';
import { MEDIA_SOURCES, refreshMedia, selectAutomaticMedia } from './refresh-media.mjs';

const source = MEDIA_SOURCES.find((entry) => entry.id === 'wfan-videos');
const now = new Date('2026-10-11T01:00:00Z');
const videoId = 'abcdEF12345';
const channelUrl = `https://www.youtube.com/channel/${source.channelId}/videos`;
const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
const curated = { checkedAt: '2026-10-08T00:00:00Z', items: [], outlets: [{ id: 'wfan', name: 'WFAN', kind: 'radio', url: channelUrl, people: ['WFAN'] }] };
const channelPage = (ids = [videoId]) => `<link rel="canonical" href="https://www.youtube.com/channel/${source.channelId}"><script>var ytInitialData = ${JSON.stringify({ metadata: { channelMetadataRenderer: { externalId: source.channelId } }, contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { selected: true, endpoint: { browseEndpoint: { browseId: source.channelId } }, content: { gridRenderer: { items: ids.map((id) => ({ videoRenderer: { videoId: id } })) } } } }] } } })};</script>`;
const recordingPage = (id = videoId, edit = (value) => value) => `<script>var ytInitialPlayerResponse = ${JSON.stringify(edit({ playabilityStatus: { status: 'OK', playableInEmbed: true }, videoDetails: { videoId: id, channelId: source.channelId, title: 'Jets and Giants opening thoughts', shortDescription: 'Evan and Tiki discuss both teams.', author: 'WFAN', isPrivate: false, isCrawlable: true }, microformat: { playerMicroformatRenderer: { externalChannelId: source.channelId, canonicalUrl: `https://www.youtube.com/watch?v=${id}`, publishDate: '2026-10-10', isUnlisted: false, isFamilySafe: true } } }))};</script>`;
const channel = channelPage();
const recording = recordingPage();
const fetcher = (pages) => async (url) => new Response(pages.get(url) ?? '', { status: pages.has(url) ? 200 : 404 });
const refresh = (options = {}) => refreshMedia({ curated, now, sources: [source], fetcher: fetcher(new Map([[channelUrl, channel], [videoUrl, recording]])), onError: () => {}, ...options });

test('failed Atom discovery uses exact public channel and playable recording metadata', async () => {
  const result = await refresh();
  assert.equal(result.sources[0].status, 'ready');
  assert.equal(result.sources[0].checkedAt, now.toISOString());
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].publishedAt, '2026-10-10');
  assert.equal(result.items[0].youtubeId, videoId);
  assert.equal(result.items[0].embedAllowed, true);
  assert.equal(result.items[0].image, null);
  assert.equal(result.items[0].summary, 'Published by WFAN videos.');
});

test('a failed public-metadata fallback retains its prior successful source timestamp', async () => {
  const previous = await refresh();
  const result = await refresh({ previous, now: new Date('2026-10-11T04:00:00Z'), fetcher: fetcher(new Map([[channelUrl, channel], [videoUrl, '<html>unavailable</html>']])) });
  assert.equal(result.sources[0].status, 'retained');
  assert.equal(result.sources[0].checkedAt, previous.sources[0].checkedAt);
  assert.equal(result.items[0].publishedAt, previous.items[0].publishedAt);
});

const apiVideo = (id = videoId, edit = (value) => value) => edit({
  id, snippet: { channelId: source.channelId, channelTitle: 'WFAN', title: 'Jets and Giants opening thoughts', description: 'Evan and Tiki discuss both teams.', publishedAt: '2026-10-10T14:00:00Z' },
  status: { privacyStatus: 'public', embeddable: true }, contentDetails: {},
});
function officialApiFetcher(videos, requests = [], candidates = videos) {
  const uploads = source.channelId.replace(/^UC/, 'UU');
  return async (url, options) => {
    requests.push({ url, headers: options.headers });
    const pathname = new URL(url).pathname;
    if (new URL(url).hostname !== 'www.googleapis.com') return new Response('', { status: 404 });
    let body;
    if (pathname.endsWith('/channels')) body = { kind: 'youtube#channelListResponse', items: [{ id: source.channelId, contentDetails: { relatedPlaylists: { uploads } } }] };
    else if (pathname.endsWith('/playlistItems')) body = { kind: 'youtube#playlistItemListResponse', items: candidates.map(({ id }) => ({ snippet: { channelId: source.channelId, playlistId: uploads, resourceId: { kind: 'youtube#video', videoId: id } }, contentDetails: { videoId: id } })) };
    else if (pathname.endsWith('/videos')) body = { kind: 'youtube#videoListResponse', items: videos };
    else assert.fail(`Unexpected API method: ${pathname}`);
    return new Response(JSON.stringify(body));
  };
}

test('configured official API discovery takes precedence and keeps credentials out of images, URLs and snapshots', async () => {
  const apiKey = 'test-only-secret-key';
  const requests = [];
  const result = await refresh({ youtubeApiKey: apiKey, fetcher: officialApiFetcher([apiVideo()], requests) });
  assert.equal(result.sources[0].status, 'ready');
  assert.equal(result.items[0].publishedAt, '2026-10-10T14:00:00.000Z');
  assert.equal(result.items[0].embedAllowed, true);
  assert.equal(requests.filter(({ url }) => new URL(url).hostname === 'www.googleapis.com').length, 3);
  assert.ok(requests.every(({ url }) => !url.includes(apiKey)));
  assert.ok(requests.every(({ url }) => !url.startsWith('https://www.youtube.com/')));
  for (const { url, headers } of requests) assert.equal(headers['X-Goog-Api-Key'], new URL(url).hostname === 'www.googleapis.com' ? apiKey : undefined);
  assert.equal(JSON.stringify(result).includes(apiKey), false);
});

test('an official API failure retains source history and never falls through to throttled public metadata or leaks a key', async () => {
  const previous = await refresh();
  const apiKey = 'test-only-secret-key';
  const requests = [], errors = [];
  const result = await refresh({ previous, youtubeApiKey: apiKey, now: new Date('2026-10-11T04:00:00Z'), onError: (message) => errors.push(message), fetcher: async (url) => {
    requests.push(url);
    if (new URL(url).hostname === 'www.googleapis.com') throw new Error(`Upstream request failed with credential ${apiKey}`);
    return new Response('', { status: 404 });
  } });
  assert.equal(result.sources[0].status, 'retained');
  assert.equal(result.sources[0].checkedAt, previous.sources[0].checkedAt);
  assert.deepEqual(result.items, previous.items);
  assert.ok(requests.every((url) => !url.startsWith('https://www.youtube.com/')));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /YouTube Data API metadata unavailable/);
  assert.equal(`${JSON.stringify(result)}${errors.join(' ')}`.includes(apiKey), false);
});

test('refresh prunes only exact rejected public recordings while preserving transient and absent older recordings', async () => {
  const ids = ['blocked0001', 'unrelated01', 'timeout0001', 'unknown0001', 'absent00001'];
  const oldPages = new Map([[channelUrl, channelPage(ids)], ...ids.map((id) => [`https://www.youtube.com/watch?v=${id}`, recordingPage(id)])]);
  const previous = await refresh({ fetcher: fetcher(oldPages) });
  assert.equal(previous.items.length, ids.length);
  const freshId = 'fresh000001';
  const candidates = [...ids.filter((id) => id !== 'absent00001'), freshId];
  const pages = new Map([[channelUrl, channelPage(candidates)]]);
  pages.set(`https://www.youtube.com/watch?v=${ids[0]}`, recordingPage(ids[0], (value) => { value.playabilityStatus.status = 'UNPLAYABLE'; return value; }));
  pages.set(`https://www.youtube.com/watch?v=${ids[1]}`, recordingPage(ids[1], (value) => { value.videoDetails.title = 'Yankees postseason discussion'; value.videoDetails.shortDescription = 'Baseball only.\nSubscribe for Jets and Giants coverage.'; return value; }));
  pages.set(`https://www.youtube.com/watch?v=${ids[3]}`, recordingPage(ids[3], (value) => { delete value.playabilityStatus; return value; }));
  pages.set(`https://www.youtube.com/watch?v=${freshId}`, recordingPage(freshId));
  const result = await refresh({ previous, fetcher: fetcher(pages) });
  assert.equal(result.sources[0].status, 'ready');
  assert.deepEqual(result.items.map((item) => item.youtubeId).sort(), ['timeout0001', 'unknown0001', 'absent00001', freshId].sort());
});

test('official API rejected playback metadata removes a known older recording while retaining missing resources', async () => {
  const previous = await refresh();
  const result = await refresh({ previous, youtubeApiKey: 'test-only-secret-key', fetcher: officialApiFetcher([apiVideo(videoId, (value) => { value.status.embeddable = false; return value; })]) });
  assert.equal(result.sources[0].status, 'ready');
  assert.equal(result.items.length, 0);
  const absent = await refresh({ previous, youtubeApiKey: 'test-only-secret-key', fetcher: officialApiFetcher([], [], [apiVideo()]) });
  assert.equal(absent.sources[0].status, 'ready');
  assert.deepEqual(absent.items, previous.items);
});

test('automatic media adds a Rants topic only when a Jets headline explicitly describes an outburst', async () => {
  const titles = ['Joe Benigno TORCHES Jets in Epic Rant!', 'Jets fall to Bears', 'Jets DESTROY the Browns in Week 5'];
  for (const title of titles) {
    const result = await refresh({ youtubeApiKey: 'test-only-secret-key', fetcher: officialApiFetcher([apiVideo(videoId, (value) => { value.snippet.title = title; return value; })]) });
    assert.equal(result.items[0].topics.includes('Rants'), title === titles[0], title);
    assert.ok(result.items[0].topics.includes('Radio analysis'));
  }
});

const podcastSource = MEDIA_SOURCES.find((entry) => entry.id === 'wfan-boomer-gio');
const relevanceEpisodes = (updated) => [
  { id: videoId, title: updated ? 'Yankees postseason discussion' : 'Jets postseason discussion', description: 'Baseball only.\nSubscribe for Jets and Giants coverage.' },
  { id: 'mixed000001', title: updated ? 'Opening thoughts' : 'Jets opening thoughts', description: 'Jets and Giants coaching discussion.\nFollow us for more.' },
];
const atomFeed = (updated) => `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/"><yt:channelId>${source.channelId}</yt:channelId><author><uri>https://www.youtube.com/channel/${source.channelId}</uri></author>${relevanceEpisodes(updated).map(({ id, title, description }) => `<entry><yt:channelId>${source.channelId}</yt:channelId><yt:videoId>${id}</yt:videoId><title>${title}</title><published>2026-10-10T14:00:00Z</published><link rel="alternate" href="https://www.youtube.com/watch?v=${id}"/><media:group><media:description><![CDATA[${description}]]></media:description></media:group></entry>`).join('')}</feed>`;
const podcastFeed = (updated) => JSON.stringify({ results: [{ kind: 'podcast', collectionId: podcastSource.podcastId, artistName: 'WFAN' }, ...relevanceEpisodes(updated).map(({ title, description }, index) => ({ kind: 'podcast-episode', collectionId: podcastSource.podcastId, trackId: 101 + index, trackName: title, description, releaseDate: '2026-10-10T14:00:00Z', trackViewUrl: `https://podcasts.apple.com/us/podcast/boomer-gio/id${podcastSource.podcastId}?i=${101 + index}` }))] });

test('Atom metadata preserves known embed permission for the same recording and leaves new permission unknown', async () => {
  const previous = await refresh({ fetcher: fetcher(new Map([[source.url, atomFeed(false)]])) });
  previous.items = previous.items.map((item) => ({ ...item, embedAllowed: item.youtubeId === videoId }));
  const freshId = 'fresh000001';
  const freshEntry = `<entry><yt:channelId>${source.channelId}</yt:channelId><yt:videoId>${freshId}</yt:videoId><title>Jets coaching update</title><published>2026-10-10T15:00:00Z</published><link rel="alternate" href="https://www.youtube.com/watch?v=${freshId}"/></entry>`;
  const feed = atomFeed(false).replace('Jets postseason discussion', 'Jets postseason discussion updated').replace('</feed>', `${freshEntry}</feed>`);
  const checked = new Date('2026-10-11T01:30:00Z');
  const result = await refresh({ previous, now: checked, fetcher: fetcher(new Map([[source.url, feed]])) });
  const items = new Map(result.items.map((item) => [item.youtubeId, item]));
  assert.equal(result.sources[0].status, 'ready');
  assert.equal(result.sources[0].checkedAt, checked.toISOString());
  assert.equal(items.size, 3);
  assert.equal(items.get(videoId).title, 'Jets postseason discussion updated');
  assert.equal(items.get(videoId).embedAllowed, true);
  assert.equal(items.get('mixed000001').embedAllowed, false);
  assert.equal(items.get(freshId).embedAllowed, undefined);
});

for (const [name, feedSource, body] of [['Atom', source, atomFeed], ['Apple', podcastSource, podcastFeed]]) {
  test(`${name} refresh removes an older unrelated episode despite its Jets footer and keeps topical mixed coverage`, async () => {
    const previous = await refresh({ sources: [feedSource], fetcher: fetcher(new Map([[feedSource.url, body(false)]])) });
    assert.equal(previous.items.length, 2);
    const result = await refresh({ previous, sources: [feedSource], fetcher: fetcher(new Map([[feedSource.url, body(true)]])) });
    assert.equal(result.sources[0].status, 'ready');
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].title, 'Opening thoughts');
    assert.equal(result.items[0].summary.includes('coaching discussion'), false);
  });
}

const entry = (name, publishedAt) => ({ id: name, url: `https://www.youtube.com/watch?v=${name}`, publishedAt });
test('frequent WFAN uploads cannot crowd slower fan sources out of a bounded edition', () => {
  const fast = Array.from({ length: 6 }, (_, index) => entry(`wfan${index}`, `2026-10-10T${23 - index}:00:00Z`));
  const fan = [entry('fan0', '2026-10-08T12:00:00Z'), entry('fan1', '2026-10-07T12:00:00Z')];
  const another = [entry('other0', '2026-10-06T12:00:00Z')];
  const items = selectAutomaticMedia([fast, fan, another], [], 4);
  assert.deepEqual(items.map((item) => item.id), ['wfan0', 'wfan1', 'fan0', 'other0']);
  assert.equal(items.length, 4);
  assert.deepEqual(selectAutomaticMedia([fast], [], 0), []);
});

test('balanced selection excludes curated and cross-feed duplicates by canonical identity', () => {
  const duplicate = entry('same', '2026-10-10T12:00:00Z');
  const fresh = entry('fresh', '2026-10-09T12:00:00Z');
  assert.deepEqual(selectAutomaticMedia([[duplicate, fresh], [duplicate]], [{ ...duplicate, url: `${duplicate.url}&utm_source=feed` }], 3), [fresh]);
});

test('curated duplicates do not consume a slower source’s allocation turns', () => {
  const duplicates = [0, 1, 2].map((index) => entry(`curated${index}`, '2026-10-10T12:00:00Z'));
  const slow = entry('slower-unique', '2026-10-01T12:00:00Z');
  const prolific = Array.from({ length: 22 }, (_, sourceIndex) => Array.from({ length: 6 }, (_, index) => entry(`fast${sourceIndex}-${index}`, `2026-10-10T${23 - index}:00:00Z`)));
  const items = selectAutomaticMedia([...prolific, [...duplicates, slow]], duplicates, 60);
  assert.equal(items.length, 60);
  assert.ok(items.some((item) => item.id === slow.id));
});
