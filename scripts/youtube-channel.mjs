const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const JETS = /\bjets\b|\bnyj\b|#nyjets\b|#newyorkjets\b/i;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_CANDIDATES = 24;

/** Match the episode's subject, ignoring reusable channel promotion and outbound URLs. */
export function jetsRelevant(title, description = '') {
  if (typeof title === 'string' && JETS.test(title)) return true;
  if (typeof description !== 'string') return false;
  const lines = description.replace(/<[^>]+>/g, '\n').split(/\r?\n/);
  const episode = [];
  for (const line of lines) {
    const text = line.trim();
    // These recurring sections follow the actual summary/chapters on WFAN and fan channels.
    if (/^(?:[\p{Extended_Pictographic}\s]*)(?:subscribe\b|watch more\b|about (?:SNY|WFAN|the channel)\s*:|follow (?:us|me|the|on)\b|listen to (?:the|our|my)\b|for (?:business|serious|media) inquiries\b|social(?: media)?(?: here)?\s*:|support (?:the|our|my|this)\b|all videos now available\b|(?:download|check out) (?:the|our|my) (?:.*?podcast|merch|store)\b|(?:the )?ultimate jets fan experience\b)/iu.test(text)) break;
    // Channel descriptions and hashtag banks are not evidence that this recording includes Jets talk.
    if (/\b(?:your go-to destination for|covers? the New York Jets with news|this channel (?:will|is going to)|welcome to (?:Jets|the channel))\b/i.test(text)) continue;
    if (/^(?:#[\w]+[\s,]*)+$/.test(text)) continue;
    episode.push(text.replace(/https?:\/\/\S+/g, ''));
  }
  return JETS.test(episode.join('\n'));
}

function boundedHtml(value) {
  if (typeof value !== 'string' || new TextEncoder().encode(value).byteLength > MAX_HTML_BYTES) {
    throw new Error('Invalid or oversized public YouTube metadata');
  }
  return value;
}

/** Read a JSON assignment without evaluating any publisher JavaScript. */
function scriptObject(html, name) {
  boundedHtml(html);
  const assignment = new RegExp(`(?:var\\s+${name}|window\\["${name}"\\]|${name})\\s*=\\s*`).exec(html);
  if (!assignment) throw new Error(`Missing public YouTube ${name}`);
  const start = assignment.index + assignment[0].length;
  if (html[start] !== '{') throw new Error('Invalid public YouTube metadata object');
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < html.length; index++) {
    const character = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{') depth++;
    else if (character === '}' && --depth === 0) return JSON.parse(html.slice(start, index + 1));
  }
  throw new Error('Incomplete public YouTube metadata object');
}

function channelIdentity(channelId) {
  if (!CHANNEL_ID.test(channelId ?? '')) throw new Error('Invalid public YouTube channel identity');
}

function pageCanonical(html) {
  const tag = [...html.matchAll(/<link\b[^>]*>/gi)].find(([value]) => /\brel\s*=\s*["']canonical["']/i.test(value))?.[0];
  const href = tag?.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!href) throw new Error('Missing public YouTube canonical identity');
  return new URL(href);
}

/** Only the selected channel tab contributes candidates; recommendations are ignored. */
export function publicYouTubeCandidates(html, channelId, candidateLimit = MAX_CANDIDATES) {
  channelIdentity(channelId);
  const data = scriptObject(html, 'ytInitialData');
  const canonical = pageCanonical(html);
  if (data.metadata?.channelMetadataRenderer?.externalId !== channelId
    || canonical.origin !== 'https://www.youtube.com' || canonical.pathname !== `/channel/${channelId}`
    || canonical.search || canonical.hash) throw new Error('Public YouTube channel identity mismatch');
  const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs;
  const selected = Array.isArray(tabs) ? tabs.find((entry) => entry.tabRenderer?.selected)?.tabRenderer : null;
  if (!selected?.content || selected.endpoint?.browseEndpoint?.browseId !== channelId) {
    throw new Error('Missing verified public YouTube channel tab');
  }
  const limit = Math.max(1, Math.min(MAX_CANDIDATES, Number.isSafeInteger(candidateLimit) ? candidateLimit : MAX_CANDIDATES));
  const ids = new Set();
  function visit(value) {
    if (!value || typeof value !== 'object' || ids.size >= limit) return;
    const video = value.videoRenderer;
    const lockup = value.lockupViewModel;
    const id = video?.videoId ?? (lockup?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' ? lockup.contentId : undefined);
    if (id !== undefined) {
      if (VIDEO_ID.test(id)) ids.add(id);
      return;
    }
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  }
  visit(selected.content);
  if (!ids.size) throw new Error('No public YouTube video metadata found');
  return [...ids];
}

/** Exact publisher dates and owner identity are required; relative channel dates are never used. */
export function publicYouTubeVideo(html, channelId, videoId, now = new Date()) {
  channelIdentity(channelId);
  if (!VIDEO_ID.test(videoId ?? '')) throw new Error('Invalid public YouTube video identity');
  const data = scriptObject(html, 'ytInitialPlayerResponse');
  const detail = data.videoDetails;
  const micro = data.microformat?.playerMicroformatRenderer;
  const identities = [detail?.videoId, micro?.externalVideoId].filter((value) => value !== undefined);
  if (micro?.canonicalUrl) {
    const url = new URL(micro.canonicalUrl);
    if (url.origin !== 'https://www.youtube.com' || url.pathname !== '/watch' || url.hash
      || [...url.searchParams.keys()].some((key) => key !== 'v')) throw new Error('Public YouTube recording destination mismatch');
    identities.push(url.searchParams.get('v'));
  }
  if (!identities.length || identities.some((id) => id !== videoId)) throw new Error('Public YouTube recording identity unavailable or mismatched');
  if ((detail?.channelId !== undefined && detail.channelId !== channelId)
    || (micro?.externalChannelId !== undefined && micro.externalChannelId !== channelId)) throw new Error('Public YouTube recording owner identity mismatch');
  // Only an explicit, known restriction qualifies as a rejected recording. Incomplete
  // or new provider responses are transient errors so the caller retains old media.
  const playability = data.playabilityStatus;
  if (['UNPLAYABLE', 'LOGIN_REQUIRED', 'AGE_CHECK_REQUIRED', 'CONTENT_CHECK_REQUIRED'].includes(playability?.status)) return null;
  if (playability?.status !== 'OK') throw new Error('Public YouTube playback status unavailable');
  if (playability.playableInEmbed !== undefined && typeof playability.playableInEmbed !== 'boolean') throw new Error('Public YouTube embed permission unavailable');
  if (playability.playableInEmbed === false) return null;
  if (!detail || !micro || detail.videoId !== videoId || detail.channelId !== channelId
    || micro.externalChannelId !== channelId || (micro.externalVideoId && micro.externalVideoId !== videoId)) {
    throw new Error('Public YouTube recording owner identity mismatch');
  }
  const canonical = new URL(micro.canonicalUrl ?? `https://www.youtube.com/watch?v=${videoId}`);
  if (canonical.origin !== 'https://www.youtube.com' || canonical.pathname !== '/watch'
    || canonical.search !== `?v=${videoId}` || canonical.hash) throw new Error('Public YouTube recording destination mismatch');
  if ([detail.isPrivate, detail.isCrawlable, micro.isUnlisted, micro.isFamilySafe].some((value) => typeof value !== 'boolean')
    || (micro.hasYpcMetadata !== undefined && typeof micro.hasYpcMetadata !== 'boolean')) throw new Error('Public YouTube visibility metadata unavailable');
  if (detail.isPrivate || !detail.isCrawlable || micro.isUnlisted
    || !micro.isFamilySafe || micro.hasYpcMetadata === true) return null;
  const title = detail.title;
  const description = detail.shortDescription ?? micro.description?.simpleText ?? '';
  const author = detail.author ?? micro.ownerChannelName;
  if (typeof title !== 'string' || !title.trim() || title.length > 250
    || typeof author !== 'string' || !author.trim() || author.length > 120
    || typeof description !== 'string') throw new Error('Invalid public YouTube recording text');
  if (!jetsRelevant(title, description)) return null;
  const rawDate = micro.publishDate ?? micro.uploadDate;
  // A date-only publisher value remains date-only rather than inventing a time.
  if (typeof rawDate !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(rawDate)
    || !Number.isFinite(Date.parse(rawDate))) throw new Error('Missing exact public YouTube publication date');
  if (new Date(`${rawDate.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== rawDate.slice(0, 10)) {
    throw new Error('Invalid public YouTube publication date');
  }
  if (Date.parse(rawDate) > now.getTime()) return null;
  return {
    title, publishedAt: rawDate.includes('T') ? new Date(rawDate).toISOString() : rawDate,
    url: canonical.href, author, youtubeId: videoId,
    ...(data.playabilityStatus.playableInEmbed === true ? { embedAllowed: true } : {}),
    // Used to qualify mixed sports shows; the refresh pipeline need not copy the description.
    description,
  };
}

/** RSS is preferred by the caller. This fallback reads bounded, first-party public metadata only. */
export async function discoverYouTubeChannel(source, { fetchText, now = new Date(), limit = 6, candidateLimit = MAX_CANDIDATES } = {}) {
  channelIdentity(source?.channelId);
  if (typeof fetchText !== 'function') throw new Error('Public YouTube discovery requires a bounded fetcher');
  const tab = source.youtubeTab ?? 'videos';
  if (!['videos', 'streams'].includes(tab)) throw new Error('Invalid public YouTube channel tab');
  const channelUrl = `https://www.youtube.com/channel/${source.channelId}/${tab}`;
  const candidates = publicYouTubeCandidates(await fetchText(channelUrl), source.channelId, candidateLimit);
  const count = Math.max(1, Math.min(6, Number.isSafeInteger(limit) ? limit : 6));
  const records = [];
  const excludedVideoIds = [];
  const errors = [];
  let checked = 0;
  // Four watch pages per batch; the provided fetcher also applies the updater's global request limit.
  for (let index = 0; index < candidates.length && records.length < count; index += 4) {
    const batchIds = candidates.slice(index, index + 4);
    const batch = await Promise.allSettled(batchIds.map(async (id) => {
      const html = await fetchText(`https://www.youtube.com/watch?v=${id}`);
      return publicYouTubeVideo(html, source.channelId, id, now);
    }));
    for (const [offset, result] of batch.entries()) {
      if (result.status === 'fulfilled') {
        checked++;
        if (result.value) records.push(result.value);
        else excludedVideoIds.push(batchIds[offset]);
      } else errors.push(result.reason);
    }
  }
  if (!checked && errors.length) throw new Error('Public YouTube recording metadata unavailable');
  // Unfetched and failed IDs are absent from both lists so the caller can retain previous recordings.
  return { records: records.slice(0, count), excludedVideoIds };
}
