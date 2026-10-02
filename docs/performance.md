# Performance pass — October 2, 2026

Baseline: production source at `5539544ec26db6d26c17da30768c76d3e094559b`.
Both versions were built with Next 16.3.7 and served by `next start` on the same
machine. Lighthouse 13.5.0 / Chrome 154 used its default simulated mobile profile.
The table reports medians of three fresh-browser runs per page per build. Image
optimization caches warm across runs. These are lab measurements, not field Core
Web Vitals or promises about every connection.

| Measurement | Before | After |
| --- | ---: | ---: |
| Homepage total transferred, including speculative requests | 673,172 B | 419,072 B (−37.7%) |
| Homepage request count | 48 | 27 |
| Film Room total transferred, including speculative requests | 577,978 B | 420,993 B (−27.2%) |
| Film Room request count | 46 | 31 |
| Homepage Lighthouse performance | 92 | 92 |
| Homepage largest contentful paint | 3.31 s | 3.24 s |
| Film Room Lighthouse performance | 95 | 96 |
| Film Room largest contentful paint | 2.86 s | 2.73 s |
| Homepage layout shift | 0 | 0 |

Transfer savings are the strongest evidence. Timing variation was larger than
the small median timing improvements; don't describe this as 38% faster loading.
A separate pre-change public-origin homepage run scored 91 with LCP 3.19 s.

## Changes

- Navigation, homepage links and the season directory warm destinations on
  hover, focus or touch. Entering the viewport no longer downloads whole sections.
  Same-page anchors don't prefetch the page again. Native Next navigation remains.
- Game studies load on their first selection, then stay mounted to retain the
  notebook. Playbook edits survive workspace switches. Direct film links wait for
  the notebook before scrolling. Default board SSR and native disclosures remain.
- Play animation reuses design validation, formation analysis, player groups,
  static field markings and the unchanged assignment ledger between frames.
- Season pages receive scores and eligible tape IDs; guides receive definitions
  and coverage metadata without unused player totals. For 2010, archive JSON
  props fall from 23,272 to 5,510 B and ranking guide props from 75,241 to 17,789 B.
- AVIF is negotiated with WebP fallback. At the audited mobile size, the same
  lead photograph falls from 43,246 B WebP to 22,974 B AVIF. AVIF has a higher
  first-encode cost; cached delivery benefits subsequent visits. Thumbnail sizes
  now match the actual two-column layout.

## Recheck

After `npm run build`, run `npm run test:performance` for gzip HTML and initial
JavaScript budgets. Both code CI and data publication enforce these limits.
These asset checks exclude images, dynamic imports and prefetch traffic; use
Lighthouse/network traces to measure total transfers.

For timing comparisons, run at least three serial Lighthouse audits of both
builds with identical settings, without browser tests or builds competing for CPU:

```sh
npx lighthouse http://127.0.0.1:3174/ --only-categories=performance \
  --output=json --output-path=/tmp/jets-home.json \
  --chrome-flags='--headless --no-first-run'
```

Existing Speed Insights remains enabled for real-user measurements. Revisit
budgets deliberately as content grows; don't silently raise a failed limit.
