import "server-only";
import { BlobError, BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { readMediaBlobRecord } from "./media-blob-read.mjs";

/** A private, project-scoped store using Vercel's automatically rotated OIDC identity. */
export async function readMediaBlob(pathname: string): Promise<{ value: unknown; etag: string } | null> {
  return readMediaBlobRecord(pathname, get);
}

export async function writeMediaBlob(pathname: string, value: unknown, options: { ifMatch?: string; createOnly?: boolean } = {}) {
  const result = await put(pathname, JSON.stringify(value), { access: "private", addRandomSuffix: false,
    allowOverwrite: !options.createOnly, contentType: "application/json", cacheControlMaxAge: 60,
    ...(options.ifMatch ? { ifMatch: options.ifMatch } : {}), abortSignal: AbortSignal.timeout(8_000) });
  return { etag: result.etag };
}

export function isMediaBlobConflict(error: unknown) {
  return error instanceof BlobPreconditionFailedError || error instanceof BlobError && error.message.includes("already exists");
}
