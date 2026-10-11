import { jetsRelevant } from './youtube-channel.mjs';

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,64}$/;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_CANDIDATES = 25;

function exactDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10)) {
    throw new Error('Invalid YouTube Data API publication date');
  }
  return new Date(value).toISOString();
}

function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error(`Invalid YouTube Data API ${label}`);
  }
  return value.trim();
}

function listResponse(body, kind, maxItems) {
  if (typeof body !== 'string' || new TextEncoder().encode(body).byteLength > MAX_BYTES) {
    throw new Error('Oversized or invalid YouTube Data API response');
  }
  let data;
  try { data = JSON.parse(body); } catch { throw new Error('Invalid YouTube Data API JSON'); }
  // Do not repeat upstream error messages: provider diagnostics can contain request credentials.
  if (data?.error) throw new Error('YouTube Data API request failed');
  if (data?.kind !== kind || !Array.isArray(data.items) || data.items.length > maxItems) {
    throw new Error('Invalid YouTube Data API list identity');
  }
  return data.items;
}

export function youTubeApiRecord(video, channelId, now = new Date()) {
  if (!CHANNEL_ID.test(channelId ?? '') || !VIDEO_ID.test(video?.id ?? '')
    || video.snippet?.channelId !== channelId) throw new Error('YouTube Data API recording owner identity mismatch');
  const status = video.status;
  if (!status || !['public', 'private', 'unlisted'].includes(status.privacyStatus)
    || typeof status.embeddable !== 'boolean') throw new Error('Missing YouTube Data API public playback status');
  if (status.privacyStatus !== 'public' || status.embeddable === false
    || video.contentDetails?.contentRating?.ytRating === 'ytAgeRestricted'
    || video.snippet.liveBroadcastContent === 'upcoming') return null;
  const title = text(video.snippet.title, 250, 'headline');
  const author = text(video.snippet.channelTitle, 120, 'author');
  const description = video.snippet.description ?? '';
  if (typeof description !== 'string' || description.length > 50_000) throw new Error('Invalid YouTube Data API description');
  if (!jetsRelevant(title, description)) return null;
  const publishedAt = exactDate(video.snippet.publishedAt);
  if (Date.parse(publishedAt) > now.getTime()) return null;
  return {
    title, publishedAt, author, description, youtubeId: video.id, embedAllowed: true,
    url: `https://www.youtube.com/watch?v=${video.id}`,
  };
}

/** Three one-unit list calls per channel; uploads include public video and livestream recordings. */
export async function discoverYouTubeApi(source, { apiKey, fetchText, now = new Date(), limit = 6, candidateLimit = MAX_CANDIDATES } = {}) {
  if (!CHANNEL_ID.test(source?.channelId ?? '')) throw new Error('Invalid YouTube Data API channel identity');
  if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 256 || /[\s\u0000-\u001f\u007f]/.test(apiKey)) {
    throw new Error('YouTube Data API key is not configured');
  }
  if (typeof fetchText !== 'function') throw new Error('YouTube Data API discovery requires a bounded fetcher');
  const count = Math.max(1, Math.min(6, Number.isSafeInteger(limit) ? limit : 6));
  const candidatesCount = Math.max(1, Math.min(MAX_CANDIDATES, Number.isSafeInteger(candidateLimit) ? candidateLimit : MAX_CANDIDATES));
  const headers = { 'X-Goog-Api-Key': apiKey };
  async function request(method, parameters, kind, maxItems) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${method}`);
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
    let body;
    try { body = await fetchText(url.href, headers); }
    catch { throw new Error('YouTube Data API metadata unavailable'); }
    return listResponse(body, kind, maxItems);
  }

  const channels = await request('channels', { part: 'contentDetails', id: source.channelId, maxResults: 1 }, 'youtube#channelListResponse', 1);
  if (channels.length !== 1 || channels[0].id !== source.channelId) throw new Error('YouTube Data API channel identity mismatch');
  const uploads = channels[0].contentDetails?.relatedPlaylists?.uploads;
  if (!PLAYLIST_ID.test(uploads ?? '')) throw new Error('Invalid YouTube Data API uploads playlist');
  const playlist = await request('playlistItems', { part: 'snippet,contentDetails', playlistId: uploads, maxResults: candidatesCount }, 'youtube#playlistItemListResponse', candidatesCount);
  const ids = new Set();
  for (const entry of playlist) {
    const snippet = entry?.snippet;
    const id = snippet?.resourceId?.videoId;
    if (snippet?.channelId !== source.channelId || snippet?.playlistId !== uploads
      || snippet?.resourceId?.kind !== 'youtube#video' || !VIDEO_ID.test(id ?? '')
      || entry.contentDetails?.videoId !== id
      || (snippet.videoOwnerChannelId !== undefined && snippet.videoOwnerChannelId !== source.channelId)) {
      throw new Error('YouTube Data API uploads owner identity mismatch');
    }
    ids.add(id);
  }
  if (!ids.size) return { records: [], excludedVideoIds: [] };
  const videos = await request('videos', { part: 'snippet,status,contentDetails', id: [...ids].join(',') }, 'youtube#videoListResponse', 50);
  const records = [];
  const excludedVideoIds = [];
  const seen = new Set();
  for (const video of videos) {
    if (!ids.has(video?.id) || seen.has(video.id)) throw new Error('YouTube Data API candidate recording identity mismatch');
    seen.add(video.id);
    const item = youTubeApiRecord(video, source.channelId, now);
    if (item) records.push(item);
    else excludedVideoIds.push(video.id);
  }
  // Omitted/absent resources have no verified rejected identity and are retained by the caller.
  records.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.youtubeId.localeCompare(b.youtubeId));
  return { records: records.slice(0, count), excludedVideoIds };
}
