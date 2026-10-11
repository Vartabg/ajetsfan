import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverYouTubeChannel, jetsRelevant, publicYouTubeCandidates, publicYouTubeVideo } from './youtube-channel.mjs';

const channelId = 'UCt8ZeGlv3VM8jLYO_EoDMPw';
const now = new Date('2026-10-11T02:00:00Z');
const videoId = 'abcdEF12345';
const channelUrl = `https://www.youtube.com/channel/${channelId}/videos`;
const videoUrl = (id = videoId) => `https://www.youtube.com/watch?v=${id}`;
const channel = (ids = [videoId], edit = (value) => value) => {
  const data = {
    metadata: { channelMetadataRenderer: { externalId: channelId } },
    contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: {
      selected: true, endpoint: { browseEndpoint: { browseId: channelId } },
      content: { richGridRenderer: { contents: ids.map((id) => ({ richItemRenderer: { content: { lockupViewModel: {
        contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: id,
        metadata: { lockupMetadataViewModel: { title: { content: 'Jets opening' } } },
      } } } })) } },
    } }] } },
    recommendations: { videoRenderer: { videoId: 'foreign1234' } },
  };
  return `<link href="https://www.youtube.com/channel/${channelId}" rel="canonical"><script>var ytInitialData = ${JSON.stringify(edit(data))};</script>`;
};
const recording = (id = videoId, edit = (value) => value) => {
  const data = {
    playabilityStatus: { status: 'OK', playableInEmbed: true },
    videoDetails: { videoId: id, channelId, title: 'Friday Opening: Jets, Giants and Yankees', author: 'A fan creator', shortDescription: 'Jets and Giants conversation.', isPrivate: false, isCrawlable: true },
    microformat: { playerMicroformatRenderer: {
      externalChannelId: channelId, externalVideoId: id, canonicalUrl: videoUrl(id), isFamilySafe: true,
      isUnlisted: false, hasYpcMetadata: false, publishDate: '2026-10-09T07:03:46-07:00',
    } },
    streamingData: { formats: [{ url: 'https://video.example/private-stream' }] },
  };
  return `<script>var ytInitialPlayerResponse = ${JSON.stringify(edit(data))};</script>`;
};

test('channel candidates come only from the verified selected tab, with modern and legacy renderers', () => {
  assert.deepEqual(publicYouTubeCandidates(channel([videoId, videoId, 'nextVID1234']), channelId), [videoId, 'nextVID1234']);
  const legacy = channel([videoId], (value) => {
    value.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content = { gridRenderer: { items: [{ videoRenderer: { videoId } }] } };
    return value;
  });
  assert.deepEqual(publicYouTubeCandidates(legacy, channelId), [videoId]);
  const fifty = Array.from({ length: 50 }, (_, index) => `vid${String(index).padStart(8, '0')}`);
  assert.equal(publicYouTubeCandidates(channel(fifty), channelId, 100).length, 24);
});

test('foreign channel metadata, unselected tabs, missing objects and oversized responses fail closed', () => {
  assert.throws(() => publicYouTubeCandidates(channel().replace(channelId, 'UC3gaW1ds7Q0fy51vA0J5y2g'), channelId), /channel identity mismatch/);
  assert.throws(() => publicYouTubeCandidates(channel([], (value) => {
    value.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.endpoint.browseEndpoint.browseId = 'foreign';
    return value;
  }), channelId), /verified.*tab/);
  assert.throws(() => publicYouTubeCandidates(channel([], (value) => {
    value.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.selected = false;
    return value;
  }), channelId), /verified.*tab/);
  assert.throws(() => publicYouTubeCandidates('<script>unrelated = {};</script>', channelId), /Missing public/);
  assert.throws(() => publicYouTubeCandidates('x'.repeat(3 * 1024 * 1024 + 1), channelId), /oversized/);
  assert.throws(() => publicYouTubeCandidates(channel(['invalid']), channelId), /No public/);
});

test('watch metadata keeps exact publisher dates and attribution while exposing no stream URL', () => {
  const item = publicYouTubeVideo(recording(), channelId, videoId, now);
  assert.equal(item.publishedAt, '2026-10-09T14:03:46.000Z');
  assert.equal(item.title, 'Friday Opening: Jets, Giants and Yankees');
  assert.equal(item.author, 'A fan creator');
  assert.equal(item.embedAllowed, true);
  assert.equal(item.url, videoUrl());
  assert.equal(JSON.stringify(item).includes('private-stream'), false);
  const dateOnly = publicYouTubeVideo(recording(videoId, (value) => {
    value.microformat.playerMicroformatRenderer.publishDate = '2026-10-09';
    return value;
  }), channelId, videoId, now);
  assert.equal(dateOnly.publishedAt, '2026-10-09');
});

test('Jets inclusion is verified in title or description even for a mixed sports opening', () => {
  const mixed = recording(videoId, (value) => {
    value.videoDetails.title = 'Friday Opening';
    value.videoDetails.shortDescription = 'Jets, Giants and baseball';
    return value;
  });
  assert.ok(publicYouTubeVideo(mixed, channelId, videoId, now));
  const unrelated = mixed.replace('Jets, Giants and baseball', 'Giants and baseball');
  assert.equal(publicYouTubeVideo(unrelated, channelId, videoId, now), null);
});

test('station footers, generic channel descriptions and hashtags do not qualify unrelated sports', () => {
  assert.equal(jetsRelevant('Yankees postseason fallout', 'Judge and Boone face difficult questions.\n\nSubscribe for the latest sports news!\nJets and Giants coverage every day.'), false);
  assert.equal(jetsRelevant('Giants injury news', 'The Giants defense must improve.\n\nFollow The Show:\nListen to the Jets podcast.'), false);
  assert.equal(jetsRelevant('Baseball conversation', 'Jets Media is your go-to destination for ALL things New York Jets.\n#Jets #NewYorkJets'), false);
  assert.equal(jetsRelevant('Friday Opening', 'Yankees and Giants analysis.\n0:15 Jets offensive-line problems\nFollow us: @WFAN660'), true);
  assert.equal(jetsRelevant('Friday Opening', '<p>The hosts discuss Giants and Jets practice.</p><p>Subscribe for more.</p>'), true);
  assert.equal(jetsRelevant('Baseball conversation', 'Yankees discussion. https://example.com/jets/video'), false);
  assert.equal(jetsRelevant('Knicks practice update', 'The coach discusses bench roles.\nWatch More: https://on.sny.tv/example\nAbout SNY:\nSNY is the television home of the New York Mets, Jets and New York sports.'), false);
});

test('private, age-gated, unlisted, paid and known owner-blocked videos are excluded', () => {
  const restrictions = [
    (value) => { value.playabilityStatus.status = 'LOGIN_REQUIRED'; },
    (value) => { value.playabilityStatus.playableInEmbed = false; },
    (value) => { value.videoDetails.isPrivate = true; },
    (value) => { value.videoDetails.isCrawlable = false; },
    (value) => { value.microformat.playerMicroformatRenderer.isUnlisted = true; },
    (value) => { value.microformat.playerMicroformatRenderer.isFamilySafe = false; },
    (value) => { value.microformat.playerMicroformatRenderer.hasYpcMetadata = true; },
  ];
  for (const restrict of restrictions) assert.equal(publicYouTubeVideo(recording(videoId, (value) => { restrict(value); return value; }), channelId, videoId, now), null);
  const uncertain = publicYouTubeVideo(recording(videoId, (value) => { delete value.playabilityStatus.playableInEmbed; return value; }), channelId, videoId, now);
  assert.equal(uncertain.embedAllowed, undefined);
});

test('recording owner, video identity, destination and date errors cannot become imported selections', () => {
  const invalid = [
    (value) => { value.videoDetails.channelId = 'foreign'; },
    (value) => { value.videoDetails.videoId = 'foreign1234'; },
    (value) => { value.microformat.playerMicroformatRenderer.externalChannelId = 'foreign'; },
    (value) => { value.microformat.playerMicroformatRenderer.canonicalUrl = 'https://www.youtube.com/watch?v=foreign1234'; },
    (value) => { value.microformat.playerMicroformatRenderer.publishDate = '2 days ago'; },
    (value) => { value.microformat.playerMicroformatRenderer.publishDate = '2026-02-30'; },
  ];
  for (const change of invalid) assert.throws(() => publicYouTubeVideo(recording(videoId, (value) => { change(value); return value; }), channelId, videoId, now), /identity|destination|date/);
  assert.equal(publicYouTubeVideo(recording(videoId, (value) => { value.microformat.playerMicroformatRenderer.publishDate = '2026-10-12'; return value; }), channelId, videoId, now), null);
});

test('JSON strings containing braces and escapes are parsed without executing publisher JavaScript', () => {
  const special = recording(videoId, (value) => { value.videoDetails.title = 'Jets {film} \\" quote'; return value; });
  assert.equal(publicYouTubeVideo(special, channelId, videoId, now).title, 'Jets {film} \\" quote');
  assert.throws(() => publicYouTubeVideo(`<script>var ytInitialPlayerResponse = (() => ({}))();</script>`, channelId, videoId, now), /Invalid.*object/);
});

test('bounded discovery uses four requests at once and stops after enough verified recordings', async () => {
  const ids = Array.from({ length: 24 }, (_, index) => `vid${String(index).padStart(8, '0')}`);
  let active = 0;
  let peak = 0;
  const fetched = [];
  const { records: items, excludedVideoIds } = await discoverYouTubeChannel({ channelId }, { now, fetchText: async (url) => {
    fetched.push(url);
    if (url === channelUrl) return channel(ids);
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return recording(new URL(url).searchParams.get('v'));
  } });
  assert.equal(items.length, 6);
  assert.equal(peak, 4);
  assert.equal(fetched.length, 9);
  assert.equal(fetched.some((url) => !url.startsWith('https://www.youtube.com/')), false);
  assert.deepEqual(excludedVideoIds, []);
});

test('total metadata failures preserve caller failure state rather than returning a verified empty channel', async () => {
  await assert.rejects(discoverYouTubeChannel({ channelId }, { now, fetchText: async (url) => {
    if (url === channelUrl) return channel();
    throw new Error('Publisher timeout');
  } }), /metadata unavailable/);
  const empty = await discoverYouTubeChannel({ channelId }, { now, fetchText: async (url) => {
    if (url === channelUrl) return channel();
    return recording(videoId, (value) => { value.videoDetails.title = 'Baseball'; value.videoDetails.shortDescription = 'Only baseball'; return value; });
  } });
  assert.deepEqual(empty, { records: [], excludedVideoIds: [videoId] });
});

test('live recordings use the same verified owner metadata through a fixed streams tab', async () => {
  const fetched = [];
  const { records: items } = await discoverYouTubeChannel({ channelId, youtubeTab: 'streams' }, { now, fetchText: async (url) => {
    fetched.push(url);
    return url.endsWith('/streams') ? channel() : recording();
  } });
  assert.equal(items.length, 1);
  assert.equal(fetched[0], `https://www.youtube.com/channel/${channelId}/streams`);
  await assert.rejects(discoverYouTubeChannel({ channelId, youtubeTab: '../foreign' }, { fetchText: async () => assert.fail('Invalid tabs must not fetch') }), /Invalid.*tab/);
  await assert.rejects(discoverYouTubeChannel({ channelId: `${channelId}/../../foreign` }, { fetchText: async () => assert.fail('Invalid owner must not fetch') }), /Invalid.*channel identity/);
});

test('only exact verified rejected identities are eligible for removal; transient and absent IDs remain unclassified', async () => {
  const unrelated = 'unrelated01';
  const blocked = 'blocked0001';
  const failed = 'timeout0001';
  const result = await discoverYouTubeChannel({ channelId }, { now, fetchText: async (url) => {
    if (url === channelUrl) return channel([unrelated, blocked, failed]);
    const id = new URL(url).searchParams.get('v');
    if (id === failed) throw new Error('Publisher timeout');
    return recording(id, (value) => {
      if (id === unrelated) { value.videoDetails.title = 'Baseball'; value.videoDetails.shortDescription = 'Only baseball'; }
      else value.playabilityStatus.status = 'UNPLAYABLE';
      return value;
    });
  } });
  assert.deepEqual(result, { records: [], excludedVideoIds: [unrelated, blocked] });
  assert.equal(result.excludedVideoIds.includes(failed), false);
  assert.equal(result.excludedVideoIds.includes('absent00001'), false);
  assert.throws(() => publicYouTubeVideo('<script>var ytInitialPlayerResponse = {"playabilityStatus":{"status":"UNPLAYABLE"}};</script>', channelId, videoId, now), /identity unavailable/);
  const microOnly = recording(videoId, (value) => { delete value.videoDetails; value.playabilityStatus.status = 'UNPLAYABLE'; return value; });
  assert.equal(publicYouTubeVideo(microOnly, channelId, videoId, now), null);
  const canonicalOnly = recording(videoId, (value) => { delete value.videoDetails; delete value.microformat.playerMicroformatRenderer.externalVideoId; value.playabilityStatus.status = 'UNPLAYABLE'; return value; });
  assert.equal(publicYouTubeVideo(canonicalOnly, channelId, videoId, now), null);
});

test('missing or unknown playback statuses retain verified identities rather than pruning prior media', async () => {
  for (const status of [undefined, 'ERROR', 'NEW_PROVIDER_STATUS']) {
    const incomplete = recording(videoId, (value) => {
      if (status === undefined) delete value.playabilityStatus;
      else value.playabilityStatus.status = status;
      return value;
    });
    assert.throws(() => publicYouTubeVideo(incomplete, channelId, videoId, now), /playback status unavailable/);
    await assert.rejects(discoverYouTubeChannel({ channelId }, { now, fetchText: async (url) => url === channelUrl ? channel() : incomplete }), /metadata unavailable/);
  }
  for (const status of ['UNPLAYABLE', 'LOGIN_REQUIRED', 'AGE_CHECK_REQUIRED', 'CONTENT_CHECK_REQUIRED']) {
    assert.equal(publicYouTubeVideo(recording(videoId, (value) => { value.playabilityStatus.status = status; return value; }), channelId, videoId, now), null);
  }
});

test('incomplete or wrongly typed visibility metadata remains transient while explicit restrictions exclude', () => {
  const fields = [
    ['videoDetails', 'isPrivate'], ['videoDetails', 'isCrawlable'],
    ['microformat', 'isUnlisted'], ['microformat', 'isFamilySafe'],
  ];
  for (const [group, field] of fields) {
    for (const replacement of [undefined, 'false']) {
      assert.throws(() => publicYouTubeVideo(recording(videoId, (value) => {
        const object = group === 'microformat' ? value.microformat.playerMicroformatRenderer : value[group];
        if (replacement === undefined) delete object[field]; else object[field] = replacement;
        return value;
      }), channelId, videoId, now), /visibility metadata unavailable/);
    }
  }
  assert.throws(() => publicYouTubeVideo(recording(videoId, (value) => {
    value.playabilityStatus.playableInEmbed = 'false'; return value;
  }), channelId, videoId, now), /embed permission unavailable/);
  assert.throws(() => publicYouTubeVideo(recording(videoId, (value) => {
    value.microformat.playerMicroformatRenderer.hasYpcMetadata = 'false'; return value;
  }), channelId, videoId, now), /visibility metadata unavailable/);
});
