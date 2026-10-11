import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverYouTubeApi, youTubeApiRecord } from './youtube-api.mjs';

const source = { channelId: 'UCt8ZeGlv3VM8jLYO_EoDMPw' };
const playlistId = 'UUt8ZeGlv3VM8jLYO_EoDMPw';
const id = 'abcdEF12345';
const now = new Date('2026-10-11T02:00:00Z');
const apiKey = 'example-test-key';
const video = (videoId = id, changes = {}) => ({
  kind: 'youtube#video', id: videoId,
  snippet: { channelId: source.channelId, channelTitle: 'Jets fan creator', title: 'Friday Opening: Jets and Giants', description: 'Discussion of both New York football teams.', publishedAt: '2026-10-09T14:03:46Z', liveBroadcastContent: 'none' },
  status: { privacyStatus: 'public', embeddable: true },
  contentDetails: { contentRating: {} },
  ...changes,
});
const uploads = (ids = [id]) => ({ kind: 'youtube#playlistItemListResponse', items: ids.map((videoId) => ({
  kind: 'youtube#playlistItem',
  snippet: { channelId: source.channelId, playlistId, resourceId: { kind: 'youtube#video', videoId }, videoOwnerChannelId: source.channelId },
  contentDetails: { videoId },
})) });
const fixtures = (ids = [id], videos = ids.map((videoId) => video(videoId))) => ({
  channels: { kind: 'youtube#channelListResponse', items: [{ id: source.channelId, contentDetails: { relatedPlaylists: { uploads: playlistId } } }] },
  playlistItems: uploads(ids), videos: { kind: 'youtube#videoListResponse', items: videos },
});
const run = (responses = fixtures(), options = {}) => discoverYouTubeApi(source, {
  apiKey, now, fetchText: async (url) => JSON.stringify(responses[new URL(url).pathname.split('/').at(-1)]), ...options,
});

test('official discovery uses three bounded list requests with the key only in headers', async () => {
  const calls = [];
  const responses = fixtures();
  const result = await run(responses, { fetchText: async (url, headers) => {
    const parsed = new URL(url);
    calls.push({ parsed, headers });
    return JSON.stringify(responses[parsed.pathname.split('/').at(-1)]);
  } });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].publishedAt, '2026-10-09T14:03:46.000Z');
  assert.equal(result.records[0].embedAllowed, true);
  assert.deepEqual(result.excludedVideoIds, []);
  assert.deepEqual(calls.map(({ parsed }) => parsed.pathname), ['/youtube/v3/channels', '/youtube/v3/playlistItems', '/youtube/v3/videos']);
  assert.equal(calls[1].parsed.searchParams.get('maxResults'), '25');
  assert.equal(calls[2].parsed.searchParams.get('part'), 'snippet,status,contentDetails');
  for (const { parsed, headers } of calls) {
    assert.equal(parsed.origin, 'https://www.googleapis.com');
    assert.equal(parsed.searchParams.has('key'), false);
    assert.equal(parsed.href.includes(apiKey), false);
    assert.equal(headers['X-Goog-Api-Key'], apiKey);
  }
  assert.equal(JSON.stringify(result).includes(apiKey), false);
});

test('API media retains only exact public embeddable Jets records and no native video URLs', () => {
  const valid = video();
  const item = youTubeApiRecord(valid, source.channelId, now);
  assert.equal(item.url, `https://www.youtube.com/watch?v=${id}`);
  for (const status of [{ privacyStatus: 'private', embeddable: true }, { privacyStatus: 'unlisted', embeddable: true }, { privacyStatus: 'public', embeddable: false }]) {
    assert.equal(youTubeApiRecord({ ...valid, status }, source.channelId, now), null);
  }
  assert.equal(youTubeApiRecord({ ...valid, contentDetails: { contentRating: { ytRating: 'ytAgeRestricted' } } }, source.channelId, now), null);
  assert.equal(youTubeApiRecord({ ...valid, snippet: { ...valid.snippet, liveBroadcastContent: 'upcoming' } }, source.channelId, now), null);
  assert.equal(youTubeApiRecord({ ...valid, snippet: { ...valid.snippet, title: 'Yankees postseason', description: 'Judge discussion.\nAbout SNY:\nThe home of the Mets, Jets and New York sports.' } }, source.channelId, now), null);
  assert.equal(youTubeApiRecord({ ...valid, snippet: { ...valid.snippet, title: 'Friday Opening', description: 'Giants and Jets analysis' } }, source.channelId, now).title, 'Friday Opening');
  assert.equal(Object.hasOwn(item, 'streamingData'), false);
});

test('foreign channels, playlists and recordings cannot enter the edition', async () => {
  const wrongChannel = fixtures();
  wrongChannel.channels.items[0].id = 'foreign';
  await assert.rejects(run(wrongChannel), /channel identity mismatch/);
  for (const change of [
    (value) => { value.snippet.channelId = 'foreign'; },
    (value) => { value.snippet.playlistId = 'foreign'; },
    (value) => { value.snippet.resourceId.videoId = 'foreign1234'; },
    (value) => { value.snippet.videoOwnerChannelId = 'foreign'; },
  ]) {
    const responses = fixtures();
    change(responses.playlistItems.items[0]);
    await assert.rejects(run(responses), /uploads owner identity mismatch/);
  }
  const wrongVideo = fixtures();
  wrongVideo.videos.items[0].snippet.channelId = 'foreign';
  await assert.rejects(run(wrongVideo), /recording owner identity mismatch/);
  const extraVideo = fixtures();
  extraVideo.videos.items.push(video('foreign1234'));
  await assert.rejects(run(extraVideo), /candidate recording identity mismatch/);
});

test('exact rejected API identities are removed while absent resources remain retained', async () => {
  const blocked = 'blocked0001';
  const unrelated = 'unrelated01';
  const missing = 'absent00001';
  const valid = video();
  const result = await run(fixtures([id, blocked, unrelated, missing], [valid,
    video(blocked, { status: { privacyStatus: 'public', embeddable: false } }),
    video(unrelated, { snippet: { ...valid.snippet, title: 'Baseball', description: 'Baseball only' } }),
  ]));
  assert.deepEqual(result.excludedVideoIds, [blocked, unrelated]);
  assert.deepEqual(result.records.map((item) => item.youtubeId), [id]);
  assert.equal(result.excludedVideoIds.includes(missing), false);
});

test('publication time comes from video metadata and future or invalid dates cannot be invented', () => {
  const valid = video();
  for (const publishedAt of ['2 days ago', '2026-02-30T14:03:46Z', '2026-10-09']) {
    assert.throws(() => youTubeApiRecord({ ...valid, snippet: { ...valid.snippet, publishedAt } }, source.channelId, now), /publication date/);
  }
  assert.equal(youTubeApiRecord({ ...valid, snippet: { ...valid.snippet, publishedAt: '2026-10-12T14:03:46Z' } }, source.channelId, now), null);
  assert.throws(() => youTubeApiRecord({ ...valid, status: { privacyStatus: 'public' } }, source.channelId, now), /playback status/);
});

test('request failures and provider JSON errors are redacted and never turn into successful empty feeds', async () => {
  await assert.rejects(run(fixtures(), { fetchText: async () => { throw new Error(`Header X-Goog-Api-Key: ${apiKey}`); } }), (error) => error.message === 'YouTube Data API metadata unavailable' && !error.message.includes(apiKey));
  await assert.rejects(run(fixtures(), { fetchText: async () => JSON.stringify({ error: { message: `Bad key ${apiKey}` } }) }), (error) => error.message === 'YouTube Data API request failed' && !error.message.includes(apiKey));
  await assert.rejects(run(fixtures(), { fetchText: async () => 'x'.repeat(3 * 1024 * 1024 + 1) }), /Oversized/);
  await assert.rejects(run(fixtures(), { fetchText: async () => '{' }), /Invalid.*JSON/);
  await assert.rejects(run(fixtures(), { apiKey: undefined, fetchText: async () => assert.fail('No key must not fetch') }), /not configured/);
});

test('candidate and rendered limits stay bounded and publication dates determine newest selections', async () => {
  const ids = Array.from({ length: 25 }, (_, index) => `vid${String(index).padStart(8, '0')}`);
  const videos = ids.map((videoId, index) => {
    const entry = video(videoId);
    entry.snippet.publishedAt = new Date(Date.UTC(2026, 9, 9, 0, index)).toISOString();
    return entry;
  });
  const result = await run(fixtures(ids, videos), { limit: 100, candidateLimit: 100 });
  assert.equal(result.records.length, 6);
  assert.equal(result.records[0].youtubeId, ids.at(-1));
  const empty = await run(fixtures([], []));
  assert.deepEqual(empty, { records: [], excludedVideoIds: [] });
});
