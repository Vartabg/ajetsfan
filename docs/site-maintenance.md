# Jets site maintenance

The site steward keeps ajetsfan.com current and makes unfinished releases visible. This is the shared plan for every agent or person working on site maintenance. The project room is `ajetsfan` in Merge Monitor. Read the current goal, open assignments and most recent evidence before beginning. A contributor who disagrees records the alternative, its evidence and what would change the decision on the existing assignment. The reviewer can settle a factual question against the published checks. Changes to the agreed goal or publishing authority go to the maintainer. Record the decision in the project room and update this file when the plan changes. Each decision should make sense to someone who cannot open the original chat.

## What runs without a model

Vercel publishes football, news, roster, analysis and media on the [documented timers](football-automation.md). GitHub's **Check Jets production site** opens the public homepage, Team News and Media Room and checks the individual feeds and schedulers six times daily. After the trade feed goes 36 hours without a successful check, the scheduled steward can request the existing archive publisher once for that outage. It checks for an active or recently finished publisher and records the attempt before dispatch. After 28 days overdue it continues reporting the incident for diagnosis. A manual health check is read-only. The publisher validates its data and verifies the edition on the public site. GitHub's existing **Auto-merge** workflow lands eligible ready PRs with the maintainer's `automerge` label after checks pass.

## When a person or agent is needed

Read the **Production and open pull requests** section in Project checks. A stuck PR, a deployment discrepancy or a failed or overdue hosted site check can produce one shared diagnostic assignment. The assignment includes its source and acceptance checks. Use the same project and assignment IDs across clients.

1. Check in under a unique name and read the project goal and inbox. Use `team_inbox` or the local Merge Monitor `scripts/team-work.mjs inbox --project ajetsfan --agent YOUR_NAME`.
2. Claim the available read-only diagnosis before starting it. Record the actual adapter when starting, renew the lease while working and stop if renewal fails. If a client disconnects, another eligible client can claim the expired observation and read the same assignment. The previous attempt cannot overwrite the new result.
3. Compare the public pages, individual feed timestamps, latest workflow run and deployed commit. Record what failed, its evidence and the check that would confirm recovery. Use the same assignment to hand off the result. The result and its evidence appear in the project room. A person or independent reviewer can inspect the handoff and assign a repair if needed.
4. For a code repair, identify its authorized scope and name a single owner and a different reviewer on the board. A timed-out writer must be confirmed stopped before anyone takes over its changes. Follow the [site release instructions](../AGENTS.md) through the production smoke check.

A quiet publisher may have no new story or recording. Its successful check time, and the edition visible to readers, are the evidence for freshness. GitHub runs are visible in [site checks](https://github.com/Vartabg/ajetsfan/actions/workflows/site-health.yml) and [archive publication](https://github.com/Vartabg/ajetsfan/actions/workflows/refresh-data.yml). Public source status is available at [ajetsfan.com/api/health](https://ajetsfan.com/api/health).
