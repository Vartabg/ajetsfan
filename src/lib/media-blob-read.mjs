const MAX_MEDIA_BLOB_BYTES = 2_000_000;
const strongETag = (value) => typeof value === 'string' && /^"[\x21\x23-\x7e\x80-\xff]*"$/.test(value);

/** Read the body and its CAS token together; compressed delivery can weaken an ETag. */
export async function readMediaBlobRecord(pathname, sdkGet) {
  const result = await sdkGet(pathname, { access: 'private', useCache: false,
    headers: { 'Accept-Encoding': 'identity' }, abortSignal: AbortSignal.timeout(8_000) });
  if (!result) return null;
  if (result.statusCode !== 200 || !result.blob || result.blob.size > MAX_MEDIA_BLOB_BYTES
    || !strongETag(result.blob.etag)) throw new Error('Invalid media storage response');
  const text = await new Response(result.stream).text();
  if (Buffer.byteLength(text, 'utf8') > MAX_MEDIA_BLOB_BYTES) throw new Error('Invalid media storage response');
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error('Invalid media storage response'); }
  return { value, etag: result.blob.etag };
}
