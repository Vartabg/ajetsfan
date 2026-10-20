# Jets legends — implementation plan

Goal: make the people behind Jets history easy to meet and explore, alongside the existing numbers and game evidence.

Approach: verify the 21 Ring of Honor members and 20 Jets-associated Canton enshrinees, merge their eight overlapping identities, and include Dennis Byrd's separate retired-number honor. Build a complete 34-person directory and reusable portrait-led profile with original concise context, precise honor/tenure labels, related people and direct primary sources. Preserve the Focus layout and new Lexend typography. Do not call brief Jets stints whole Jets careers or imply honorary awards are Canton enshrinement.

- [x] Verify names, roles, Jets years, honors, distinctive story facts and actual portrait identities; record source corrections and cutoff dates.
- [x] Add typed catalog/filter helpers and original biographies in `src/lib/legends.ts` and `src/lib/legends-data.json`; keep full catalog text out of the initial home payload.
- [x] Build `src/app/legends/page.tsx`, `src/app/legends/[slug]/page.tsx`, `src/components/Legends.module.css` and a credited, failure-safe portrait component. Use native search/honor/era controls, server-rendered links and complete text membership.
- [x] Add a visible human feature on the home page, navigation from Team/History/all sections and sitemap entries. Preserve existing game/film/media paths.
- [ ] Verify inventory/source safety, search and empty states, profile navigation, image identity/loading/failure, keyboard access, AA automation, reflow/enlargement and performance. Independently review final content and code.
- [ ] Complete task lifecycle, PR/CI, production deployment and real public reader-path verification. Do not draft or publish the LinkedIn post in this task.

Research evidence lives outside Git in the current chat's `outputs/back-page-legends-*` artifacts. Final copy must be checked against those exact primary pages, with uncertainty retained where official tables disagree.
