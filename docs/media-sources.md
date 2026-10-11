# Jets media collection

## Automatic publisher feeds

`npm run data:media` checks Jets X-Factor and New York Post Jets RSS, verified independent YouTube channels, WFAN, ESPN New York and SNY video uploads, and publisher podcast episode metadata. The dedicated cloud media refresh checks every 30 minutes, alongside the full three-hour and game-day checks. It considers six recent selections per source and keeps at most 60 automatic items, distributed across sources before taking additional entries. The editorial archive is retained separately. Mixed sports shows qualify when the individual episode or upload mentions the Jets in its own title or description. An opening that also discusses the Giants, Yankees or other teams can qualify; a station or show profile mentioning the Jets does not qualify every episode.

Configure the GitHub Actions repository secret `YOUTUBE_API_KEY` for the preferred YouTube Data API path. Each channel uses three list requests to verify its uploads, recording identities, exact publication dates, public visibility and embedding permission. The key is sent only in a Google API request header and is never included in browser code, URLs, snapshots or error messages. Without a configured key, discovery tries the declared Atom feed and bounded public publisher metadata; those public endpoints can be throttled. Source failures preserve the last successful check time instead of claiming a new successful check. Refresh workflows share a concurrency group, validate before committing, and verify the exact published edition. GitHub schedules can be delayed.

The Media collection excludes the Jets’ official outlet, its YouTube uploads and NewYorkJets.com feeds and entries. This follows the fan-focused source preference and avoids offering team videos whose primary player requires visiting the team site. Historical verification notes below are retained as research provenance; sections labeled as removed are absent from the published collection.

### Verified WFAN sources

Verified October 10, 2026 against [WFAN’s own station page](https://www.audacy.com/wfan), its [current podcast directory](https://www.audacy.com/wfan/podcasts), YouTube channel metadata and Apple’s publisher lookup responses:

| Source | Publisher identity |
| --- | --- |
| [WFAN video](https://www.youtube.com/@WFANNewYork) | `UCSZ8QL2xzTHzW4ucCy1cjog` |
| [Boomer & Gio](https://podcasts.apple.com/us/podcast/boomer-gio/id386001601) | Apple show `386001601` |
| [Evan & Tiki](https://podcasts.apple.com/us/podcast/evan-tiki/id386002649) | Apple show `386002649` |
| [The Carton Show with Craig Carton & Chris McMonigle](https://podcasts.apple.com/us/podcast/the-carton-show-with-craig-carton-chris-mcmonigle/id942553546) | Apple show `942553546` |
| [WFAN Daily](https://podcasts.apple.com/us/podcast/wfan-daily/id386002669) | Apple show `386002669` |

WFAN links its actual YouTube channel from Audacy. `@WFAN` is a different channel and is not used. The Carton show’s Audacy and RSS URLs retain old Brandon Tierney/Sal Licata slugs; the current title and publisher identity are verified, so the old program is not presented as current. Apple’s episode descriptions include Jets discussion even for some mixed-sports titles that do not mention the team. The official Apple episode player supports listening in place; exact Audacy episode pages can also declare an official AmperWave embed.

### Verified ESPN New York and SNY sources

Verified October 10, 2026 against official YouTube channel metadata, exact-recording oEmbed attribution and Apple publisher lookup responses:

| Source | Publisher identity |
| --- | --- |
| [ESPN New York video](https://www.youtube.com/@ESPNNewYork) | `UCZDpKRXDSFSc6IXPMQ3GHpA` |
| [DiPietro & Rothenberg](https://podcasts.apple.com/us/podcast/dipietro-rothenberg/id928624712) | Apple show `928624712` |
| [Don, Hahn & Rosenberg](https://podcasts.apple.com/us/podcast/don-hahn-rosenberg/id1788585041) | Apple show `1788585041` |
| [SNY video](https://www.youtube.com/@SNYtv) | `UCL_OEjsHTwsHK6WKWs7s7Uw` |

The two current ESPN New York shows supply individual episode descriptions, including Jets discussion within mixed-sports hours. Their declared RSS feeds are `https://feeds.megaphone.fm/ESP4886579461` and `https://feeds.megaphone.fm/ESP2444858295`; Apple metadata provides exact episode identities for the supported inline player. SNY uploads can include Connor Hughes reporting and Bart Scott’s Jets Game Plan alongside other New York sports. Only recordings with individual Jets relevance qualify; SNY’s generic channel description saying it covers the Jets does not qualify unrelated Mets, Yankees or Giants videos. No public SNY Jets video RSS was found in the reviewed publisher pages, so the verified YouTube channel supplies automatic discovery.

### Verified independent video sources

The existing Jake Asman and BT Unleashed sources are joined by these verified publisher channels. Each new source applies the same individual-upload Jets relevance check.

| Source | Publisher channel |
| --- | --- |
| [Jets Central](https://www.youtube.com/@JetsCentral) | `UCPrLo3MozRhkbV-XCPsQxDg` |
| [Matt O’Leary](https://www.youtube.com/@MattOLearyNY) | `UCLS0BYK5W7eT_SxW6pQA19w` |
| [GreenBean Jetsfan](https://www.youtube.com/@GreenBeanJetsfan) | `UC3gaW1ds7Q0fy51vA0J5y2g` |
| [Jets Media](https://www.youtube.com/@NYJets_Media) | `UCNfqKk4bSwaBNPnPSo6eZ4w` |
| [Jets Talk 24/7](https://www.youtube.com/@JetsTalk247) | `UCJ_CFZh_SqFLp6-71wdakVw` |
| [Talkin Jets](https://www.youtube.com/@TalkinJets) | `UCT6QwygPvX84-Y_fQryCtvA` |

Mike Francesa, Joe Benigno’s Oh the Pain, Let’s Talk Jets Radio and Jets Collective remain podcast sources. Jets Media is the publisher’s `@NYJets_Media` channel, linked by [Richie Mollura](https://linktr.ee/richiemollura); the unrelated `@JetsMedia` technology channel is excluded.

Mike Francesa’s video source is also automatic: [Mike Francesa Podcast](https://www.youtube.com/@MikeFrancesaPodcast), channel `UCiL06Dv6Eygpj27Yx6MM8TA`. Its [BetRivers Network publisher page](https://www.betriversnetwork.com/shows/mike-francesa) links that exact channel, and current channel metadata verifies its identity and declared Atom feed. This accompanies the existing Apple show `1615588712`; individual uploads still require Jets relevance, so unrelated Yankees or betting segments are not admitted through the channel’s general sports profile.

`public/data/media.json` records independent source status, attemptedAt, checkedAt and item counts. Each failed source keeps its last valid selections; invalid URLs, identities and future publication dates never reach readers. Only headline, attributed author, publication time and source link are imported. Descriptions are checked for Jets relevance but remain with the publisher; no article bodies or synthetic reporting are produced. Dates do not imply football seasons, game IDs or current injury availability. YouTube discovery verifies the declared channel’s Atom entries or its public upload listing when Atom is unavailable. Public watch metadata checks the recording’s publisher, publication time and embedding permission. Discovery alone does not establish playback eligibility. Sources without measured pictures show text.

The landing page and Media Room lead with fresh dated coverage. The archive’s original review date is retained separately as curatedCheckedAt. Existing social posts and public PFF excerpts remain dated historical selections.

Checked 2026-10-03T03:05:00.000Z. This is a curated source collection, not a live X feed. Publication dates and football seasons remain separate. Five actual posts were checked through X's official oEmbed and syndication metadata. YouTube title/channel/upload metadata were checked through official oEmbed and watch pages; playback availability is evaluated separately. Supported clips use official embeds or public playback locations declared by their exact publisher page. Articles expand only their recorded summary in place; full reporting is an optional, clearly labeled source link. No article bodies, copied post text, engagement numbers or imitated voices are published.

Preview pictures refresh automatically with each media edition. The updater checks RSS/media enclosures, page `og:image` and podcast artwork, measures JPEG/PNG/WebP bytes, and verifies that each URL belongs to its source. YouTube probes maxresdefault, sddefault, then hqdefault, rejecting placeholder responses; an explicit null suppresses old thumbnail assumptions. Before the fan-source expansion, the October 10 check produced 87 measured pictures for 88 items: all 20 YouTube recordings had 1280×720 previews, all 24 automatic RSS previews were at least 1200 pixels wide, and 21 Apple episode covers were 600×600. Current counts belong to the refreshed edition rather than this historical check. Cards require 600×300 pictures; large video/article features require 960 pixels wide. Small pictures are not enlarged. Unusable images fall back to factual 1600-pixel local title cards; no invented event imagery is generated.

`/api/media/image/{id}/{version}` serves only an exact recorded image from the validated edition, with bounded bytes, type checks, timeouts and no redirects. Asset versions include measured content fingerprints, so same-URL publisher replacements receive a fresh cache key. Generated title-card versions include headline, publisher and date; edits update the associated artwork too. A changed/missing version returns 404 and the UI recovers to its local fallback. The optimizer uses local paths instead of accumulating one remote pattern per episode.

Players mount at the clicked card, and switching stories stops the previous player. YouTube uses its official API, site origin/referrer and inline mobile controls; missing identification and owner-disabled embedding are handled separately. Apple and X use official embeds. SNY VideoObject.contentUrl and Audacy PodcastEpisode.associatedMedia.embedUrl are accepted only with matching source/recording validation. The October 10 check verified three SNY/Audacy players. Jets pages reviewed did not expose a supported external player; the team’s entries have since been removed from the Media collection. No authenticated NFL player credentials or guessed recording mirrors are used.

Historical content appears as archive coverage. January 2011 playoff reporting is tagged to football season 2010; the 2016 replay upload is not a 2016 game. The Namath retrospective published in 2010 belongs to the 1968 championship season. Older injury reports remain dated reporting, not current availability predictions.

### Verified rant research

These original publisher uploads were checked October 10, 2026. The indexed first-party YouTube pages supply titles, upload dates and descriptions. YouTube’s public embedded-player response, supplied the actual local preview’s origin and referrer, reports `previewPlayabilityStatus.status: OK` and `playableInEmbed: true` for each recording. The player’s channel identity matches the verified publisher. Missing-referrer Error 153 is an embed identification error; owner-disabled embedding is not bypassed.

| Recording | Publisher upload date | Verified publisher |
| --- | --- | --- |
| [Joe Benigno TORCHES Jets in Epic Rant!](https://www.youtube.com/watch?v=zH4cQbd9jZU) | 2023-11-27 | WFAN; `UCSZ8QL2xzTHzW4ucCy1cjog` |
| [BT & Sal RIP the Jets After Another Embarrassing Loss: “This Team Is Unwatchable!”](https://www.youtube.com/watch?v=uzxj6Uz-xWE) | 2025-10-20 | WFAN; `UCSZ8QL2xzTHzW4ucCy1cjog` |
| [Mike-i-Mation: Francesa Destroys Idzik, Jets (2014)](https://www.youtube.com/watch?v=Em0Pyr853mM) | 2018-09-13 | WFAN; `UCSZ8QL2xzTHzW4ucCy1cjog` |
| [Jets Flame Out Against Patriots, Lose 25-22 - Mike Francesa Reaction](https://www.youtube.com/watch?v=Qy3X3DdE1J8) | 2024-10-27 | Mike Francesa Podcast; `UCiL06Dv6Eygpj27Yx6MM8TA` |

The Mike-i-Mation title explicitly identifies its underlying 2014 recording, while the WFAN upload occurred in 2018; it is labeled as an animated treatment. Francesa’s Patriots reaction is a 21-minute original episode. The older FOX Sports Idzik clip `q-rAu4TtTmM` returned an unavailable player and was rejected. The table records verified research candidates; published selections are defined by the catalog.

## Removed team-source research: jets-titans-highlights-2026-09-13

[New York Jets — official highlights](https://www.youtube.com/watch?v=fTq9p0tPljw) · published 2026-09-13T21:13:42Z · football season 2026 · game 2026_01_NYJ_TEN

Official YouTube oEmbed verifies the New York Jets channel (@nyjets) and the exact title; the watch page supplies publishDate 2026-09-13T14:13:42-07:00 and playability status OK. Attached to the Week 1 game case. Two unofficial re-uploads of the same highlights were found and rejected: the publisher is not the rights holder.

## Removed team-source research: jets-packers-highlights-2026-09-20

[New York Jets — Full Game Highlights](https://www.newyorkjets.com/video/jets-vs-packers-game-highlights-week-2-09-20-2026) · published 2026-09-20 · football season 2026 · game 2026_02_GB_NYJ

First-party publisher page verifies the headline, the September 20 dateline and the description’s overtime result. No official YouTube upload of this package was found; a Sky Sport DE upload was unplayable and a third-party re-upload was rejected. No supported public player verified; its summary stays in place with an optional source link.

## Removed team-source research: jets-lions-highlights-2026-09-27

[New York Jets — Full Game Highlights](https://www.newyorkjets.com/video/jets-vs-lions-game-highlights-week-3-09-27-2026) · published 2026-09-27 · football season 2026 · game 2026_03_NYJ_DET

First-party publisher page verifies the headline, the September 27 dateline and the 31–24 description. No supported public player verified; its summary stays in place with an optional source link.

## lions-jets-highlights-2026-09-27

[Detroit Lions — official highlights](https://www.youtube.com/watch?v=Iy8saaW8rBY) · published 2026-09-27T20:11:13Z · football season 2026 · game 2026_03_NYJ_DET

Official YouTube oEmbed verifies the Detroit Lions channel (@detroitlionsnfl) and the exact title; the watch page supplies publishDate 2026-09-27T13:11:13-07:00 and playability status OK. An opponent’s official package, labelled as such. Outlet record added for the Lions’ official channel.

## costello-bears-injuries-2026-10-02

[New York Post — Brian Costello](https://x.com/BrianCoz/status/2106032567530987540) · published 2026-10-02T14:44:26.000Z · football season 2026

Author, body, status ID and created_at verified through official publish.twitter.com/oembed and cdn.syndication.twimg.com/tweet-result. The canonical X page is blocked to the text fetcher; official native embed metadata is available.

## rosenblatt-wednesday-practice-2026-09-30

[The Athletic — Zack Rosenblatt](https://x.com/ZackBlatt/status/2105329027401777638) · published 2026-09-30T16:08:49.000Z · football season 2026

Author, body, status ID and timestamp verified through official X oEmbed and syndication JSON. Retain the Wednesday date; this practice report is superseded by later game-status decisions.

## cimini-week-two-injuries-2026-09-14

[ESPN — Rich Cimini](https://x.com/RichCimini/status/2099498924402942304) · published 2026-09-14T14:02:05.000Z · football season 2026

Author, body, status ID and timestamp verified through official X oEmbed and syndication JSON. A dated Week 2 report, not a statement of current injury status.

## rosenblatt-quarterback-workouts-2026-09-03

[The Athletic — Zack Rosenblatt](https://x.com/ZackBlatt/status/2095550117507891452) · published 2026-09-03T16:30:56.000Z · football season 2026

Author, body, status ID and timestamp verified through official X oEmbed and syndication JSON; the same actual post is embedded by Sports Illustrated. Classify as preparation before Week 1.

## hughes-klubnik-camp-tape-2026-08-19

[SNY — Connor Hughes](https://x.com/Connor_J_Hughes/status/2090075043292180941) · published 2026-08-19T13:54:56.000Z · football season 2026

Author, body, status ID and timestamp verified through official X oEmbed and syndication JSON. Original post includes a camp video. Hughes’s SNY role is confirmed by the publisher’s talent page.

## sny-jets-game-plan-2026-09-11

[SNY — Bart Scott and Chelsea Sherrod](https://www.youtube.com/watch?v=s657QMErTG4) · published 2026-09-11T15:45:37Z · football season 2026

Official YouTube oEmbed verifies the SNY channel and title; the watch page supplies publishDate and playability status OK. Opening-season analysis, explicitly dated.

## espnny-schedule-debate-2026-05-15

[ESPN New York — Bart Scott and Chris Carlin](https://www.youtube.com/watch?v=6uVZ4sOzkpQ) · published 2026-05-15T18:14:15Z · football season 2026

Official YouTube oEmbed verifies the ESPN New York channel and title; the watch page supplies publishDate and playability status OK. A dated schedule-release discussion, not fresh breaking news.

## Removed team-source research: jets-geno-origins-2026-09-08

[New York Jets — 1JD Films / Geno Smith](https://www.youtube.com/watch?v=u9Rh_ulKRPU) · published 2026-09-08T22:00:00Z · football season 2026

Official YouTube oEmbed verifies the New York Jets channel and title; watch-page publishDate and status OK verified. Publisher page also confirms September 8 publication. Season key is the release’s 2026 context; biography also spans earlier years.

## wfan-jets-future-2026-08-14

[WFAN — Boomer Esiason and Gregg Giannotti](https://www.youtube.com/watch?v=_vHQnprws8w) · published 2026-08-14T12:00:06Z · football season 2026

Official YouTube oEmbed verifies WFAN and the title; watch-page publishDate and status OK verified. Opinion and preseason speculation must remain labeled as such.

## nfl-2010-divisional-full-game

[NFL — NFL Archive](https://www.youtube.com/watch?v=fsJpQCFPK1g) · published 2016-12-23T22:00:03Z · football season 2010

Official NFL YouTube oEmbed verifies channel/title; watch-page publishDate and playability status OK verified. The game took place January 16, 2011 but belongs to football season 2010, confirmed by NFL’s 2010 divisional schedule. The upload date is 2016.

## Removed team-source research: jets-enunwa-bears-film-2026-10-02

[New York Jets — Quincy Enunwa](https://www.newyorkjets.com/video/jets-vs-bears-film-breakdown-preview-quincy-enunwa-10-02-2026) · published 2026-10-02 · football season 2026

First-party publisher page verifies title, analyst and visible October 2 dateline. No separate YouTube ID or supported public player verified; its summary stays in place with an optional source link.

## Removed team-source research: jets-baldinger-bears-matchups-2026-10-01

[New York Jets — Brian Baldinger](https://www.newyorkjets.com/video/brian-baldinger-key-matchups-jets-at-bears-week-3-10-01-2026) · published 2026-10-01 · football season 2026

First-party page verifies October 1 dateline, analyst and visible Week 4 headline. URL retains a week-3 slug; use the verified headline. No external iframe or YouTube ID inferred.

## Removed team-source research: jets-rogers-sadiq-breakout-2026-09-30

[New York Jets — Connor Rogers](https://www.newyorkjets.com/video/kenyon-sadiq-film-breakdown-jets-vs-lions-10-01-2026) · published 2026-09-30 · football season 2026

First-party page and video index verify the analyst, title and September 30 visible publication date. Slug says 10-01; the displayed publisher date takes precedence. No supported public player verified; its summary stays in place with an optional source link.

## sny-running-game-without-hall-2026-10-01

[SNY — Bart Scott and Chelsea Sherrod](https://sny.tv/video/bart-scott-on-the-outlook-of-jets-running-game-without-breece-hall-jets-game-plan) · published 2026-10-01 · football season 2026

First-party SNY page returned 200; title, show, participants and October 1 date verified in page content/metadata. Timestamp representations disagree, so only the calendar date is retained. The refreshed page explicitly declares its public MP4 in matching VideoObject metadata; the card plays that exact source inline.

## wfan-detroit-reaction-2026-09-28

[WFAN — Boomer Esiason and Gregg Giannotti](https://www.audacy.com/podcasts/25b5d2554a72264c79052c27fbb94319/episodes/jets_take_step_forward_giants_-8352937) · published 2026-09-28T10:00:00Z · football season 2026

Audacy’s episode page verifies title/content; official AmperWave RSS episode 8352937 confirms Mon, 28 Sep 2026 10:00:00 +0000. The publisher supplies an iframe; the feed URL’s older date-like suffix does not override pubDate.

## ltjr-antwan-staley-preview-2026-09-09

[Let’s Talk Jets Radio — Antwan Staley / Let’s Talk Jets Radio](https://podcasts.apple.com/ca/podcast/previewing-the-ny-jets-2026-season-with-daily-news/id863176413?i=1000788748520) · published 2026-09-09T21:11:00Z · football season 2026

Publisher-uploaded Apple Podcasts episode page verifies exact title, 30-minute duration, guest role and September 9 publication at 21:11 UTC. No host name, MP3 source or embed URL guessed.

## jetsxfactor-personnel-2026-10-01

[Jets X-Factor — Connor Long](https://jetsxfactor.com/2026/10/01/ny-jets-offense-adjustment-next-level/) · published 2026-10-01T17:40:00Z · football season 2026

Primary article verifies author, October 1 1:40 PM EDT dateline and reported personnel figures. Statistics below are publisher-reported, from a three-game sample; they do not establish causal effects.

## pft-bears-injuries-2026-10-02

[NBC Sports / Pro Football Talk — Myles Simmons](https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/breece-hall-adonai-mitchell-among-jets-ruled-out-for-week-4-vs-bears) · published 2026-10-02T15:09:21.081Z · football season 2026

First-party NBC page returned 200. Canonical headline, author and datePublished verified in page metadata; the headline is paraphrased here. Keep the October 2 date visible.

## espn-2010-divisional-rapid-reaction

[ESPN — Rich Cimini](https://www.espn.com/blog/new-york/jets/post/_/id/4192/rapid-reaction-jets-28-patriots-21) · published 2011-01-17T00:50:00Z · football season 2010

Primary ESPN article verifies author and Jan 16, 2011 7:50 PM ET dateline. Football season assignment is independently supported by NFL’s 2010 divisional schedule; do not confuse publication year and season.

## Removed team-source research: jets-namath-super-season-1968

[New York Jets — Joe Namath / Jets Television Network](https://www.newyorkjets.com/video/jtn-that-super-season-with-joe-namath-2423526) · published 2010-03-10 · football season 1968

Primary Jets page verifies title, March 10, 2010 publication and historical subject. Season filter is 1968; Super Bowl III occurred January 1969. No supported public player verified; its summary stays in place with an optional source link.

## Embed verification

On October 2, 2026, all five YouTube watch pages explicitly returned playability status OK and `playableInEmbed: true`. The SNY, ESPN New York and WFAN players are enabled; the Jets documentary and NFL full-game selection retain original-source links pending destination playback checks. In the local production preview, the real SNY player reached readyState 4 and advanced past 115 seconds after an explicit play click. Costello's original October 2 post also rendered through X's native widget, showing the verified author, status identity, date and original text. These are observed checks, not a guarantee of future provider availability. Browser tests mock providers to verify loading, failure, timeout and cancellation deterministically.


## PFF public reporting additions

Reviewed October 2, 2026. PFF's [AFC East free-agency preview](https://www.pff.com/news/nfl-2026-nfl-free-agency-preview-afc-east), by Mason Cameron, is dated March 5, 2026 at 6:30 AM EST and reviews 2025 Jets grades; it is tagged to 2025 regular-season context. [The 2026 Jets preview](https://www.pff.com/news/nfl-new-york-jets-2026-preview), by Gordon McGuinness, is dated July 31, 2026 at 11:20 AM EDT and is tagged as a 2026 offseason selection. Both are public primary pages, with brief original synopses. These additions bring the collection to 22 selections from 12 outlets. They do not supply a continuous PFF grades feed.

## Jets Rants selections

The 2018 La Greca caller clip concerns the Jets: [contemporaneous coverage](https://elitesportsny.com/2018/11/03/don-la-greca-loses-his-mind-casual-fan-guesses-matt-forte-video/) embeds the exact YES recording `lK7ah7u2L7s` and describes the caller selecting Matt Forte for the Jets’ first touchdown against Miami. The original player’s caller/Matt Forte lower-third corroborates that context. Forte’s retirement predates the clip, confirmed by his [February 2018 retirement announcement](https://www.newyorkjets.com/news/rb-matt-forte-announces-his-nfl-retirement-20396755).

`/media/rants` keeps an editorial shelf of original broadcaster uploads alongside recent feed items whose titles explicitly frame them as rants, meltdowns or outbursts. Selection is subjective; this is not a vote or measured all-time ranking. Upload dates are preserved without inventing an air time, game identity or football season. New qualifying releases acquire the Rants topic automatically.

| Original recording | Publisher | Upload date |
| --- | --- | --- |
| [Don LaGreca lets loose epic rant on TMKS caller](https://www.youtube.com/watch?v=lK7ah7u2L7s) | YES Network | 2018-11-02 |
| [Joe Benigno TORCHES Jets in Epic Rant!](https://www.youtube.com/watch?v=zH4cQbd9jZU) | WFAN | 2023-11-27 |
| [Unwatchable: The Jets Are Beyond Saving I Sal Licata](https://www.youtube.com/watch?v=hryq49USLpc) | WFAN | 2024-10-27 |
| [‘The Jets Blew It Again!’ BT Loses It Over Belichick Bombshell](https://www.youtube.com/watch?v=JR2jWdb4oW8) | WFAN | 2024-12-14 |
| [Don La Greca rants about Mike Greenberg’s excitement for Jets trade of Davante Adams](https://www.youtube.com/watch?v=vKQeRfn_qJA) | YES Network | 2024-10-15 |
| [Jets Nation Rises: Believing Beyond Rodgers](https://www.youtube.com/watch?v=CLajeGDkp8E) | WFAN | 2023-09-12 |

Official YouTube oEmbed supplied matching titles and channel attribution. Official embedded-player previews returned OK with the normal publisher referrer during the October 10 check; the runtime player still handles future restrictions. The Belichick date also matches the [WFAN publisher VideoObject](https://www.audacy.com/wfan/sports/jets/bt-and-c-mac-cant-believe-the-bill-belichick-jets-report); the other date-only values are indexed primary watch datelines. [ESPN confirms YES Network is the Michael Kay Show’s original simulcast broadcaster](https://espnpressroom.com/press-release/espn-new-york-98-7fm-signs-don-la-greca-to-multiyear-extension/). The Rodgers injury reaction is an emotional franchise moment rather than a label inferred from an ordinary loss.

Migrated WFAN article carousel IDs `x97z2iq` and `x9866za` were rejected: current provider metadata identifies unrelated recordings. Their article labels are not sufficient recording identity proof.

Additional original WFAN picks: [Mike-i-Mation: Francesa Destroys Idzik, Jets (2014)](https://www.youtube.com/watch?v=Em0Pyr853mM), uploaded 2018-09-13, is explicitly an animated treatment of the 2014 rant; its football season is 2014 rather than its upload year. [BT & Sal RIP the Jets After Another Embarrassing Loss](https://www.youtube.com/watch?v=uzxj6Uz-xWE), uploaded 2025-10-20, preserves the original WFAN clip. Both returned matching WFAN channel attribution and an OK official embedded-player preview during the same check.
