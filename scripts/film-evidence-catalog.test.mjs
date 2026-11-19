import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const catalog = JSON.parse(await readFile(new URL('../data/film-evidence/analyst-sources.json', import.meta.url), 'utf8'));
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const gamePattern = /^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const validTime = (value) => text(value) && Number.isFinite(Date.parse(value));

/** Content quality gate: discovery must not silently become reviewed film or an exact snap. */
function validate(value) {
  assert.equal(value.schemaVersion, 1);
  assert.match(value.edition, datePattern);
  assert.ok(validTime(value.reviewedAt));
  assert.ok(text(value.scope));
  assert.ok(Array.isArray(value.limitations) && value.limitations.length);
  assert.ok(Array.isArray(value.sources) && value.sources.length);
  const ids = new Set();
  const urls = new Set();
  const claims = new Set();
  for (const source of value.sources) {
    assert.match(source.id, idPattern);
    assert.ok(!ids.has(source.id), `Duplicate source ID ${source.id}`);
    ids.add(source.id);
    const url = new URL(source.url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.search, '', `Use canonical URLs: ${source.id}`);
    assert.equal(url.hash, '', `Use claim locators instead of URL fragments: ${source.id}`);
    assert.ok(!urls.has(source.url), `Duplicate canonical source ${source.url}`);
    urls.add(source.url);
    assert.ok(text(source.publisher));
    assert.ok(Array.isArray(source.analysts) && source.analysts.every(text) && source.analysts.length);
    assert.equal(new Set(source.analysts).size, source.analysts.length);
    assert.equal(source.originalLanguage, 'en');
    assert.ok(Array.isArray(source.concepts) && source.concepts.every((tag) => idPattern.test(tag)));
    assert.equal(new Set(source.concepts).size, source.concepts.length);
    const evidence = source.evidence;
    assert.ok(['text-reviewed', 'metadata-reviewed', 'video-reviewed', 'inaccessible'].includes(evidence.mode));
    assert.ok(validTime(evidence.reviewedAt));
    assert.ok(text(evidence.method) && text(evidence.availableEvidence));
    assert.ok(Array.isArray(evidence.limitations) && evidence.limitations.length);
    assert.ok(Array.isArray(evidence.verifiedVideoTimestamps));
    assert.ok(Array.isArray(source.claims));
    if (evidence.mode !== 'video-reviewed') {
      assert.equal(evidence.videoReviewed, false, `No implied video review: ${source.id}`);
      assert.deepEqual(evidence.verifiedVideoTimestamps, [], `No invented offsets: ${source.id}`);
    }
    if (['metadata-reviewed', 'inaccessible'].includes(evidence.mode)) {
      assert.deepEqual(source.claims, [], `Discovery cannot assert action claims: ${source.id}`);
    }
    if (evidence.mode === 'inaccessible') {
      assert.equal(source.publishedAt, null, `Do not infer publication dates from inaccessible media: ${source.id}`);
      assert.equal(source.title, null, `Do not invent inaccessible media titles: ${source.id}`);
    } else {
      assert.ok(text(source.title));
      assert.match(source.publishedAt, datePattern);
      assert.ok(text(source.publishedDateEvidence));
    }
    const retrieval = source.retrieval;
    assert.ok(validTime(retrieval.fetchedAt));
    if (retrieval.status === 200) {
      assert.match(retrieval.sha256, /^[a-f0-9]{64}$/);
      assert.ok(Number.isSafeInteger(retrieval.bytes) && retrieval.bytes > 0);
      assert.ok(text(retrieval.checksumScope));
    } else {
      assert.ok(text(retrieval.error));
    }
    assert.ok(Array.isArray(source.matches));
    const matches = new Map();
    for (const match of source.matches) {
      assert.match(match.id, idPattern);
      assert.ok(!matches.has(match.id));
      matches.set(match.id, match);
      assert.ok(['exact-game', 'unresolved'].includes(match.status));
      assert.ok(text(match.basis));
      if (match.status === 'exact-game') {
        assert.match(match.gameId, gamePattern);
        assert.ok(text(match.resolution?.method), `Exact game needs recorded resolution: ${source.id}`);
      } else {
        assert.equal(match.gameId, undefined, `Unresolved must not expose a canonical game ID: ${source.id}`);
        if (match.candidateGameId !== null && match.candidateGameId !== undefined) assert.match(match.candidateGameId, gamePattern);
      }
      assert.ok(Array.isArray(match.playCandidates));
      const candidateIds = new Set();
      for (const candidate of match.playCandidates) {
        assert.match(candidate.id, idPattern);
        assert.ok(!candidateIds.has(candidate.id));
        candidateIds.add(candidate.id);
        assert.ok(text(candidate.basis));
        assert.ok(candidate.selector && Object.keys(candidate.selector).length > 0);
        assert.ok(['unresolved', 'exact-play'].includes(candidate.status));
        if (candidate.status === 'exact-play') {
          assert.equal(match.status, 'exact-game');
          assert.ok(text(candidate.canonicalPlayId));
          assert.ok(candidate.canonicalPlayId.startsWith(`${match.gameId}:`));
          assert.equal(candidate.resolution?.matchedRows, 1, 'Ambiguous records cannot become exact-play links');
          assert.ok(text(candidate.resolution?.method));
          assert.ok(text(candidate.resolution?.corpusEdition));
          assert.ok(text(candidate.resolution?.sourceDescription));
        } else {
          assert.equal(candidate.canonicalPlayId, null, `Unresolved candidate must not claim a canonical snap: ${source.id}`);
        }
      }
    }
    for (const claim of source.claims) {
      assert.match(claim.id, idPattern);
      assert.ok(!claims.has(claim.id), `Duplicate claim ID ${claim.id}`);
      claims.add(claim.id);
      assert.ok(text(claim.attribution) && text(claim.summary));
      assert.equal(claim.originalLanguage, source.originalLanguage);
      assert.ok(['reported', 'participant-account', 'analyst-interpretation'].includes(claim.evidenceKind));
      assert.equal(claim.reviewStatus, 'text-verified');
      assert.ok(text(claim.locator?.type) && text(claim.locator?.text));
      const match = matches.get(claim.matchId);
      assert.ok(match, `Claim match must resolve within its source: ${claim.id}`);
      if (claim.playCandidateId) assert.ok(match.playCandidates.some((p) => p.id === claim.playCandidateId));
      assert.ok(Array.isArray(claim.limitations));
    }
  }
}

test('analyst catalog preserves attribution, source provenance and unresolved matches', () => validate(catalog));

test('metadata and inaccessible media cannot smuggle in reviewed action claims', () => {
  for (const mode of ['metadata-reviewed', 'inaccessible']) {
    const bad = structuredClone(catalog);
    const discovery = bad.sources.find((source) => source.evidence.mode === mode);
    assert.ok(discovery, `Catalog demonstrates ${mode}`);
    discovery.claims = [structuredClone(catalog.sources.flatMap((source) => source.claims)[0])];
    assert.throws(() => validate(bad), /Discovery cannot assert action claims/);
  }
});

test('an exact-play link requires a unique persisted match and retained source description', () => {
  const bad = structuredClone(catalog);
  const source = bad.sources.find((s) => s.matches.some((m) => m.playCandidates.length));
  const match = source.matches.find((m) => m.playCandidates.length);
  match.status = 'exact-game';
  match.gameId = match.gameId ?? match.candidateGameId;
  match.resolution = { method: 'persisted-pbp-game-match' };
  const candidate = match.playCandidates[0];
  candidate.status = 'exact-play';
  candidate.canonicalPlayId = `${match.gameId}:1`;
  candidate.resolution = { method: 'persisted-pbp-unique-match', corpusEdition: 'test', sourceDescription: 'example', matchedRows: 2 };
  assert.throws(() => validate(bad), /Ambiguous records cannot become exact-play links/);
  candidate.resolution.matchedRows = 1;
  candidate.resolution.sourceDescription = '';
  assert.throws(() => validate(bad));
});

test('duplicate publisher URLs and dangling claim locators are rejected', () => {
  const duplicate = structuredClone(catalog);
  duplicate.sources[1].url = duplicate.sources[0].url;
  assert.throws(() => validate(duplicate), /Duplicate canonical source/);
  const dangling = structuredClone(catalog);
  dangling.sources.find((s) => s.claims.length).claims[0].matchId = 'missing-game';
  assert.throws(() => validate(dangling), /Claim match must resolve within its source/);
});
