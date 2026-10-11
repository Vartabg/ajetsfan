import test from 'node:test';
import assert from 'node:assert/strict';
import { publisherPlayback } from './media-playback.mjs';

const sny = { kind: 'video', title: 'Bart Scott on the outlook of Jets running game without Breece Hall | Jets Game Plan',
  url: 'https://sny.tv/video/bart-scott-on-the-outlook-of-jets-running-game-without-breece-hall-jets-game-plan' };
const video = { '@type': 'VideoObject', name: sny.title, contentUrl: 'https://cdn.jwplayer.com/videos/DVpjLn82-1lACodv2.mp4' };
const audacy = { kind: 'audio', title: 'Jets Take Step Forward, Giants Eke A Win | Boomer & Gio',
  url: 'https://www.audacy.com/podcasts/25b5d2554a72264c79052c27fbb94319/episodes/jets_take_step_forward_giants_-8352937' };
const player = 'https://player.amperwavepodcasting.com?&feed-link=https%3A%2F%2Frss.amperwave.net%2Fv2%2Fepisode%2F8352937_2026-05-01-155737&withPlaylist=false&theme=blurred&playerDisplay-logoType=Audacy';
const episode = { '@type': 'PodcastEpisode', url: audacy.url, associatedMedia: { '@type': 'AudioObject', embedUrl: player } };
const script = (value) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
const snyPage = (value) => `<link href="${sny.url}" rel="canonical">${script(value)}`;

test('SNY selects the exact recording and its declared media rather than other page videos', () => {
  const html = snyPage([{ ...video, name: 'A related video', contentUrl: 'https://cdn.jwplayer.com/videos/aaaaaaaa-bbbbbbbb.mp4' }, video]);
  assert.deepEqual(publisherPlayback(sny, html), { kind: 'video', url: video.contentUrl, type: 'video/mp4' });
  assert.equal(publisherPlayback({ ...sny, title: 'Another recording' }, html), null);
  assert.equal(publisherPlayback(sny, script(video)), null);
  assert.equal(publisherPlayback(sny, snyPage({ ...video, url: 'https://sny.tv/video/a-different-recording' })), null);
});

test('Audacy extracts the actual episode player including its exact nested feed identity', () => {
  assert.deepEqual(publisherPlayback(audacy, script({ '@graph': [episode] })), { kind: 'iframe', url: player });
  assert.equal(publisherPlayback(audacy, script({ ...episode, url: 'https://www.audacy.com/unrelated' })), null);
  assert.equal(publisherPlayback(audacy, script({ ...episode, associatedMedia: { '@type': 'AudioObject', embedUrl: player.replace('8352937', '8682198') } })), null);
});

test('an image enclosure, NewsArticle embedUrl or ordinary page iframe never masquerades as a stream', () => {
  const jets = { kind: 'video', title: 'Keys for the Jets', url: 'https://www.newyorkjets.com/video/keys-for-the-jets' };
  assert.equal(publisherPlayback(jets, script({ '@type': 'NewsArticle', headline: jets.title, embedUrl: jets.url })), null);
  assert.equal(publisherPlayback(jets, '<enclosure type="image/jpeg" url="https://static.clubs.nfl.com/image/upload/jets/example.jpg"/>'), null);
  assert.equal(publisherPlayback(sny, `<iframe src="${sny.url}"></iframe>`), null);
});

test('malformed, oversized or non-metadata HTML cannot supply playback', () => {
  assert.equal(publisherPlayback(sny, '<script type="application/ld+json">invalid</script>'), null);
  assert.equal(publisherPlayback(sny, `<script type="text/javascript">${JSON.stringify(video)}</script>`), null);
  assert.equal(publisherPlayback(sny, `${' '.repeat(3 * 1024 * 1024)}${script(video)}`), null);
  assert.equal(publisherPlayback(sny, null), null);
});

test('metadata cannot cross publisher boundaries or admit executable destinations', () => {
  for (const url of ['javascript:alert(1)', 'https://evil.example/recording.mp4', 'https://cdn.jwplayer.com.evil.example/videos/DVpjLn82-1lACodv2.mp4']) {
    assert.equal(publisherPlayback(sny, snyPage({ ...video, contentUrl: url })), null);
  }
  assert.equal(publisherPlayback({ ...sny, url: 'https://nypost.com/video/example' }, script(video)), null);
  assert.equal(publisherPlayback({ ...audacy, kind: 'video' }, script(episode)), null);
});
