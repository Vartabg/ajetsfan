<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Delivering changes to ajetsfan.com

The agent handling a requested site change owns it through release. For finished work, run the project checks and secret scans, open a ready pull request against `master`, and apply the repository's existing `automerge` label when the change is authorized to ship. Honor an explicit request for a draft, preview, or hold and record the reason. A worker that cannot merge hands the PR and its verification to the agent responsible for landing it.

Follow the checks on the current commit. If the normal merge workflow has already run, recheck the current head, reviews and all check results, then complete the authorized merge through GitHub with the expected head SHA. Verify the production deployment and the changed behavior on `https://ajetsfan.com` before reporting it shipped. For repository-only changes, verify the policy or file on `master` and the resulting production deployment. The task-lifecycle state `COMPLETE` verifies the branch push. Release work continues through production.

Use the local Merge Monitor project `ajetsfan` for release handoffs and unattended PRs. Include the PR, the current blocker or explicit hold, and what will verify completion. A green check or a board message alone does not authorize another agent's draft.

Every agent working on ongoing site maintenance uses the [shared site maintenance plan](docs/site-maintenance.md) and the same `ajetsfan` Merge Monitor assignment. Record the owner and evidence there so another connected client can continue the same work.
