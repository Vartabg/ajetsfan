import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaAssetVersion, compactMediaItem, mediaImagePath, mediaTitleCardPath } from '../src/lib/media-asset-paths.mjs';
import { recordedMediaImageResponse } from '../src/lib/recorded-media-image.mjs';

const item = { id: 'verified-photo', kind: 'article', title: 'Jets coverage', author: 'Publisher', outletId: 'jets', publishedAt: '2026-10-10', url: 'https://www.newyorkjets.com/news/coverage', image: { url: 'https://static.clubs.nfl.com/image/upload/t_editorial_landscape_12_desktop/jets/coverage.jpg', width: 1280, height: 720, fingerprint: '0123456789abcdef' } };
const photo = () => new Response(Buffer.from([255, 216, 255, 192, 0, 11, 8, 2, 208, 5, 0, 1, 1, 17, 0, 255, 217]), { headers: { 'Content-Type': 'image/jpeg' } });

test('media asset paths change with exact associated data and pass through only their own normalized identity', () => {
  const compact = compactMediaItem(item), local = mediaImagePath(item);
  assert.equal(compact.image.url, local);
  assert.equal(mediaImagePath(compact), local);
  assert.equal(compact.image.width, item.image.width);
  assert.equal(compact.image.fingerprint, item.image.fingerprint);
  for (const image of [{ ...item.image, url: item.image.url + '?w=1' }, { ...item.image, width: 1920 }, { ...item.image, fingerprint: 'fedcba9876543210' }]) assert.notEqual(mediaImagePath({ ...item, image }), local);
  assert.notEqual(mediaTitleCardPath({ ...item, title: 'Publisher corrected the headline' }), mediaTitleCardPath(item));
  assert.equal(mediaTitleCardPath(compact), mediaTitleCardPath(item));
  assert.equal(mediaImagePath({ ...item, image: { ...item.image, url: local.replace(item.id, 'someone-else') } }), null);
  assert.equal(mediaImagePath({ ...item, image: { ...item.image, url: local + '?url=https://evil.example/x.jpg' } }), null);
});

test('a known version requests only its exact recorded publisher URL and emits bounded raster media', async () => {
  const calls = [];
  const response = await recordedMediaImageResponse(item, mediaAssetVersion(item, 'image'), { fetcher: async (url, options) => { calls.push({ url, options }); return photo(); } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, item.image.url);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.cache, 'no-store');
});

test('unknown items, versions, disguised image hosts and different recording pictures perform no fetch', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return photo(); };
  for (const [candidate, hash] of [[null, mediaAssetVersion(item, 'image')], [item, '0000000000000000'], [item, 'https://evil.example/x.jpg']]) assert.equal((await recordedMediaImageResponse(candidate, hash, { fetcher })).status, 404);
  for (const image of [{ ...item.image, url: 'https://static.clubs.nfl.com.evil.example/x.jpg' }, { ...item.image, url: 'http://static.clubs.nfl.com/x.jpg' }, { ...item.image, url: 'https://user:pass@static.clubs.nfl.com/x.jpg' }]) {
    const bad = { ...item, image };
    assert.equal((await recordedMediaImageResponse(bad, mediaAssetVersion(bad, 'image'), { fetcher })).status, 404);
  }
  const badVideo = { ...item, kind: 'video', youtubeId: 'abcdEF12345', image: { ...item.image, url: 'https://i.ytimg.com/vi/foreign1234/maxresdefault.jpg' } };
  assert.equal((await recordedMediaImageResponse(badVideo, mediaAssetVersion(badVideo, 'image'), { fetcher })).status, 404);
  assert.equal(calls, 0);
});

test('redirects, non-images, spoofed raster MIME and oversized declared responses fail locally without redirecting readers', async () => {
  for (const result of [new Response('', { status: 302, headers: { Location: 'https://evil.example/x.jpg' } }), new Response('<html>Not an image</html>', { headers: { 'Content-Type': 'text/html' } }), new Response('<svg/>', { headers: { 'Content-Type': 'image/jpeg' } }), new Response('x', { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '99999999' } })]) {
    const response = await recordedMediaImageResponse(item, mediaAssetVersion(item, 'image'), { fetcher: async () => result });
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('a response cannot bypass the byte cap by omitting Content-Length; transient errors stay local', async () => {
  let cancelled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5 * 1024 * 1024 + 1)); }, cancel() { cancelled = true; } });
  const response = await recordedMediaImageResponse(item, mediaAssetVersion(item, 'image'), { fetcher: async () => new Response(body, { headers: { 'Content-Type': 'image/jpeg' } }) });
  assert.equal(response.status, 502);
  assert.equal(cancelled, true);
  const unavailable = await recordedMediaImageResponse(item, mediaAssetVersion(item, 'image'), { fetcher: async () => { throw new Error('timeout'); } });
  assert.equal(unavailable.status, 502);
});

test('a previously good publisher URL cannot degrade to a tiny placeholder or unbounded decoded raster', async () => {
  for (const width of [120, 5000]) {
    const bytes = Buffer.from([255, 216, 255, 192, 0, 11, 8, 2, 208, 5, 0, 1, 1, 17, 0, 255, 217]);
    bytes.writeUInt16BE(width, 9);
    const response = await recordedMediaImageResponse(item, mediaAssetVersion(item, 'image'), { fetcher: async () => new Response(bytes, { headers: { 'Content-Type': 'image/jpeg' } }) });
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});
