# Snap pilot design review

The fresh-context native reviewer read revision 1 at `75b5fbad882e`, the design direction, publication and play identity rules, ESPN source reducer and route, DuckDB extractor, root layout and Next configuration. The external review attempt timed out without a response. The independent native review completed and identified six concrete corrections.

- Bind upcoming and historical ESPN events independently of the final-only publication filter and the single-game live endpoint. Check old links after the featured game changes.
- Protect the full rendered response and share image from the current score, latest play and streak. Use a play-specific score and identify when each provider measures probability.
- Publish durable season files with the daily recovery deployment, trace them in production and check current fixture evidence before reading retained files.
- Extract the play list before applying model eligibility. Preserve null values, use a period clock and test strict thresholds at the same precision as the published curves.
- Prove a unique, compatible link across providers. Keep source identities separate on conflicting duplicate records, combined scoring events or incomplete evidence.
- Resolve the starting position to a permanent play ID before sharing. An earlier insertion must preserve an existing shared selection.

The independent reviewer rechecked revision 2 and cleared it for implementation. The current-week home marker depends on the displayed game and play. Fan sessions, their completion time and their site preference require actual participants.
