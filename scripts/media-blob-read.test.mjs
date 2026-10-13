import test from 'node:test';
import assert from 'node:assert/strict';
import { brotliCompressSync } from 'node:zlib';
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { readMediaBlobRecord } from '../src/lib/media-blob-read.mjs';

// Explicit fake OIDC options avoid reading credentials. No test may reach a real service.
const auth = { oidcToken: 'test-only-identity', storeId: 'testfixture' };
const origin = 'https://testfixture.private.blob.vercel-storage.com';
const pathname = 'media/edition.json';
const readPath = `/${pathname}?cache=0`;
const etag = '"verified-object-version-1"';
const value = { items: Array.from({ length: 100 }, (_, i) => ({ id: `record-${i}`, title: 'Verified publisher content' })) };
const body = JSON.stringify(value);
const sdkGet = (path, options) => get(path, { ...options, ...auth });

function isolatedNetwork(t) {
  const previous = getGlobalDispatcher();
  const previousRetries = process.env.VERCEL_BLOB_RETRIES;
  const agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  // An unexpected mock miss must fail here, rather than enter SDK network backoff.
  process.env.VERCEL_BLOB_RETRIES = '0';
  t.after(async () => {
    setGlobalDispatcher(previous);
    if (previousRetries === undefined) delete process.env.VERCEL_BLOB_RETRIES;
    else process.env.VERCEL_BLOB_RETRIES = previousRetries;
    await agent.close();
  });
  return agent;
}

function conditionalUpload(agent, expectedETag) {
  agent.get('https://vercel.com').intercept({ path: `/api/blob/?pathname=${encodeURIComponent(pathname)}`, method: 'PUT' })
    .reply((request) => {
      const pairs = Array.isArray(request.headers) && typeof request.headers[0] === 'string'
        ? Array.from({ length: request.headers.length / 2 }, (_, i) => request.headers.slice(i * 2, i * 2 + 2)) : request.headers;
      const actual = new Headers(pairs).get('x-if-match');
      if (actual !== expectedETag) return { statusCode: 412, data: JSON.stringify({ error: { code: 'precondition_failed' } }),
        responseOptions: { headers: { 'content-type': 'application/json' } } };
      return { statusCode: 200, data: JSON.stringify({ pathname, url: `${origin}/${pathname}`, downloadUrl: `${origin}/${pathname}?download=1`,
        contentType: 'application/json', contentDisposition: '', etag: '"verified-object-version-2"' }),
      responseOptions: { headers: { 'content-type': 'application/json' } } };
    });
}

const upload = (ifMatch) => put(pathname, body, { ...auth, access: 'private', addRandomSuffix: false,
  allowOverwrite: true, contentType: 'application/json', ifMatch, abortSignal: AbortSignal.timeout(1_000) });

test('the actual SDK exposes a weak compressed ETag that cannot overwrite the object despite an identical body', async (t) => {
  const agent = isolatedNetwork(t);
  agent.get(origin).intercept({ path: readPath, method: 'GET' })
    .reply(200, brotliCompressSync(Buffer.from(body)), { headers: { 'content-type': 'application/json', 'content-encoding': 'br', etag: `W/${etag}` } });
  conditionalUpload(agent, etag);
  const compressed = await sdkGet(pathname, { access: 'private', useCache: false, abortSignal: AbortSignal.timeout(1_000) });
  assert.equal(compressed.blob.etag, `W/${etag}`);
  assert.equal(compressed.headers.get('content-encoding'), 'br');
  assert.equal(await new Response(compressed.stream).text(), body);
  await assert.rejects(upload(compressed.blob.etag), BlobPreconditionFailedError);
  agent.assertNoPendingInterceptors();
});

test('the production read boundary obtains the unchanged JSON and strong ETag through identity delivery, enabling real SDK CAS', async (t) => {
  const agent = isolatedNetwork(t);
  agent.get(origin).intercept({ path: readPath, method: 'GET', headers: { 'accept-encoding': 'identity' } })
    .reply(200, body, { headers: { 'content-type': 'application/json', etag } });
  conditionalUpload(agent, etag);
  const record = await readMediaBlobRecord(pathname, sdkGet);
  assert.deepEqual(record, { value, etag });
  assert.equal((await upload(record.etag)).etag, '"verified-object-version-2"');
  agent.assertNoPendingInterceptors();
});

test('identity delivery does not bypass a concurrent writer: a stale strong token is rejected', async (t) => {
  const agent = isolatedNetwork(t);
  agent.get(origin).intercept({ path: readPath, method: 'GET', headers: { 'accept-encoding': 'identity' } })
    .reply(200, body, { headers: { 'content-type': 'application/json', etag } });
  conditionalUpload(agent, '"concurrently-written-version"');
  const record = await readMediaBlobRecord(pathname, sdkGet);
  await assert.rejects(upload(record.etag), BlobPreconditionFailedError);
  agent.assertNoPendingInterceptors();
});

test('weak or missing identity response tags fail closed before their bodies can be used for publication', async (t) => {
  const agent = isolatedNetwork(t);
  for (const tag of [undefined, `W/${etag}`, 'unquoted-version']) {
    agent.get(origin).intercept({ path: readPath, method: 'GET', headers: { 'accept-encoding': 'identity' } })
      .reply(200, body, { headers: { 'content-type': 'application/json', ...(tag ? { etag: tag } : {}) } });
    await assert.rejects(readMediaBlobRecord(pathname, sdkGet), /Invalid media storage response/);
  }
  agent.assertNoPendingInterceptors();
});

test('missing objects are distinct from invalid JSON, non-200 responses and oversized decoded content', async (t) => {
  const agent = isolatedNetwork(t);
  const pool = agent.get(origin);
  const request = () => pool.intercept({ path: readPath, method: 'GET', headers: { 'accept-encoding': 'identity' } });
  request().reply(404, '');
  assert.equal(await readMediaBlobRecord(pathname, sdkGet), null);
  request().reply(304, '', { headers: { etag } });
  await assert.rejects(readMediaBlobRecord(pathname, sdkGet), /Invalid media storage response/);
  request().reply(200, '{invalid', { headers: { 'content-type': 'application/json', etag } });
  await assert.rejects(readMediaBlobRecord(pathname, sdkGet), /Invalid media storage response/);
  // Byte length, rather than JavaScript character length, protects non-ASCII content too.
  request().reply(200, JSON.stringify({ text: 'é'.repeat(1_000_000) }), { headers: { 'content-type': 'application/json', etag } });
  await assert.rejects(readMediaBlobRecord(pathname, sdkGet), /Invalid media storage response/);
  request().reply(200, '{}', { headers: { 'content-type': 'application/json', etag, 'content-length': '2000001' } });
  await assert.rejects(readMediaBlobRecord(pathname, sdkGet), /Invalid media storage response/);
  agent.assertNoPendingInterceptors();
});
