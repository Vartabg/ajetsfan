# Matchday reporting

`src/lib/matchday-report.ts` contains manually reviewed, attributed pregame notes. They are distinct from the automated schedule, news headlines, roster membership and statistical analysis. No simulated beat reporting or inferred game-day availability is included.

## Jets at Bears, Week 4 of 2026

- Fixture: `2026_04_NYJ_CHI`, away at Chicago, October 4, 2026, 17:00 UTC (1 p.m. EDT / noon CDT).
- Editorial review: September 30, 2026, 22:34:42 UTC, read from the session's UTC clock.
- Expiry: October 4, 2026, 17:00 UTC. The notes are Wednesday reporting, not a prediction or final game-status report.

### Broadcast and venue

The [official Jets schedule](https://www.newyorkjets.com/schedule/) identifies the Week 4 away game at Chicago, Sunday October 4 at 1 p.m. EDT, FOX, Q104.3 and Soldier Field. Its main schedule heading retained an outdated 2025 label when reviewed; the actual fixture entries, dates and scores match the verified 2026 season snapshot. The specific fixture entry is the evidence used, rather than that heading.

The [official Jets at Bears broadcast article](https://www.newyorkjets.com/news/jets-at-bears-ways-to-watch-stream-week-4-10-04-2026), published September 30, 2026 at 8 a.m. Eastern (12:00 UTC), confirms FOX at 1 p.m. Eastern and the English radio broadcast on Q104.3 in the New York metro area. The article H1 and body identify Jets at Bears. Its page-title metadata incorrectly mentions Jets vs. Detroit Lions, so metadata is not used to identify the fixture. Streaming and audio restrictions depend on geography and service; the UI links to the team's full viewing guide rather than promising universal access.

### Availability reporting

The [official injury update by senior reporter Eric Allen](https://www.newyorkjets.com/news/minkah-fitzpatrick-really-good-chance-to-play-vs-bears-jets-injury-update-09-30-2026) was published September 30, 2026 at 1:48 p.m. Eastern (17:48 UTC).

The first note paraphrases the article's account of Aaron Glenn saying Breece Hall (thigh) and Dylan Parham (knee) would not practice Wednesday and were week-to-week. The second paraphrases the article's report that Glenn expected Minkah Fitzpatrick to be limited Wednesday and was optimistic about a return against Chicago. Neither note asserts final participation, an official Out/Questionable designation, a confirmed starting assignment, or game-day clearance. No direct quotations are reproduced.

When reviewed, the general [official injury-report page](https://www.newyorkjets.com/team/injury-report/) still displayed the prior Jets–Lions fixture. It is suitable as a link to the official resource, but those prior-game rows must not be presented as a Bears injury report.

## Updating and expiring notes

1. Read the complete official source and confirm the season, game, date, opponent and location. Check the publication time and distinguish coach expectations, practice participation, final game statuses and inactives.
2. Record a new UTC clock reading in `reviewedAt`, retain each note's actual `publishedAt`, and update the provenance here. Keep reporting attributed to its publisher; do not synthesize quotations or claim original reporting.
3. Set `expiresAt` no later than the verified kickoff. Recheck any earlier developments and revise or remove superseded notes; expiry alone does not make Wednesday reporting a Friday or Sunday update.
4. Scope selection to the exact scheduled regular-season fixture and kickoff. A changed date, kickoff, opponent, season, location, status or game ID requires a new review. Never copy the prior opponent's broadcasts or availability to the next fixture.
5. At or after expiry, or without a matching report, the UI must use its generic official-source links rather than display these facts as current pregame information. Because pages can be built ahead of time, the UI also checks expiry in the browser.

The automated refresh does not update this manifest. Browser-facing review timestamps and expiry states keep this curated reporting separate from automatically refreshed feeds.
