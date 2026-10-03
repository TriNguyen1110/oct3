# Cue result-link presenter — independent DATA verification

Date: 2026-10-03T18:56:51.189406+00:00
Root: `/Users/tringuyen/Developer/.worktrees/oct3`
Role: independent verifier. Owned changes: `tests/presentation.test.ts`, this report and append-only `BOARD.tsv` rows. No feature source edits, commits or pushes.

## Verdict

PASS for the synthetic presenter scope below. No live merchant completion is claimed. `bash scripts/check-workspace.sh` passed at the assigned canonical root. All data is constructed inside the test process; even records marked `live` are synthetic. No worker dispatch, merchant network call, real credential, app-state write or additional development server was used.

## Reproduction and results

With `/Users/tringuyen/.nvm/versions/node/v24.20.0/bin` first on PATH:

- `node --import tsx --test tests/presentation.test.ts`: 11 leaf checks, 12 reported passes, zero failures/skips, 265.977417 ms.
- `npm run typecheck`: exit 0. Initial test-only assertion overload errors were corrected before the final passing checks; feature code required no fixes.

Verified behavior:

1. Dashboard and API links encode the exact mission identifier; review links retain task and current mission revision for all three lanes. Revisions produce new links without changing earlier results.
2. Deep-frozen input records remain unchanged. Presenter returns new mission/task objects; inspection confirms it imports only contract types and has no persistence or network operation.
3. Provider pages work before approval; a bound live checkout observation takes precedence. Stale revision and foreign-task checkout observations do not become checkout links.
4. Separate confirmation and receipt links appear for all three lanes only with confirmed task state, live mission/evidence, exact task/proposal/proposal-revision and matching confirmation reference. Existing commitments can retain their original proposal revision after other lanes replan.
5. Missing proposal/reference, stale or incomplete evidence bindings, fixture/test/replay evidence and non-live missions suppress completion links. Every non-confirmed task state suppresses completion links.
6. Paid Stripe service state, successful Link authorization, ordinary observations and Stripe/Link receipt-like URLs cannot substitute for merchant receipt or confirmation evidence.
7. Confirmation without a captured receipt returns `receipt_url: null` and `receipt_state: not_captured`; global mission evidence is insufficient when not attached to the task.
8. JavaScript/HTTP/relative/malformed URLs, nondefault merchant ports, embedded username/password, merchant lookalikes, wrong merchant, token/session/redirect queries and credential-bearing fragments are not emitted in `TaskLinks`.
9. HTTPS origins and local HTTP development origins are supported; credentials, paths, query strings, fragments and remote HTTP origins fail closed. Configured public origin overrides request origin; deployment fallback is verified.

## Route inspection and limits

Read-only inspection confirms the mission create/list/detail/constraint routes and task approve/reject/resume/retry routes all call the presenter on their response views and send `cache-control: no-store`. Existing authorization and persistence calls precede presentation. This report does not independently execute those HTTP routes; the coordinator owns the actual API/CLI/MCP and browser/deep-link journey.

This verifies presentation of trusted structured evidence, not whether an adapter truthfully captured a merchant event. It does not establish real checkout, merchant receipt availability, remote deployment, provider acceptance, or complete sanitization of arbitrary raw evidence fields. URL rejection assertions concern the new navigable `TaskLinks` fields. Origin tests validate syntax and configured precedence, not deployment proxy host policy.

## Stable source evidence

- `src/server/presentation.ts`: `9fb7d83a50ab8248a9de5dd10ae4ee806788df1542278e45ea2c3555b5e6e54d`
- `src/shared/contracts.ts`: `1eb12169e13e0d79f93db14ea231f8f3d2d2ed4f0e1cfb3ffa3cff84bc3d21a7`
- `app/api/missions/route.ts`: `f918454b104425fca9ffa1561e0d156d6e0eefc4d19c21534f9145e79d7226b4`
- `app/api/missions/[id]/route.ts`: `7eae7c8b7ab4371affce9fa2b1776f2e56ecfd817e3151b217d28af61ff59f0c`
- `app/api/missions/[id]/constraints/route.ts`: `357c79b6064b81b8180da399e9c4241b74fdc2402f479765781f602e295e9b3f`
- `app/api/tasks/[id]/approve/route.ts`: `c518e742095eb1a54ad007fee92a6c3ef526a97c6680e1689ec18b98b9356f3a`
- `app/api/tasks/[id]/reject/route.ts`: `a65442948f69d505f841a68a579ecb288f20d56ad520d1f3d3dd808e2de6bb1c`
- `app/api/tasks/[id]/resume/route.ts`: `e617acc31ee48f2401d86f9fc218fb7497af919858784fdcc367b2a59a12795e`
- `app/api/tasks/[id]/retry-research/route.ts`: `44feb7230cbbce799e51b852d8dc7390252915aebf5621588770e46acbe90f86`
- `tests/presentation.test.ts`: `e4a1d82482929923f9c94537a5b2296d45663a51f44067e0045a883b5b62aed3`

## Board verdict

Appended `cue-links-data` doing, review and done rows for this independent synthetic DATA scope only. No broader integration or merchant completion item is marked done.
