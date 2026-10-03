# Local verification passed

October 3, 2026. Workspace guard, deterministic browser/DATA checks, TypeScript
check and the actual local MCP/CLI journey passed. The two regressions in
`initial.md` have been fixed and independently rerun.

Reviewed file-set hashes (sorted relative paths, NUL, contents, NUL):

- Browser, 6 files: `eb8f17e1c10c3ee7283ae1874679db9634081f0a55dbe3b4f9fda4b8606a7d85`.
- Backend, 31 files excluding MCP route:
  `41eb51b76ec248a3308114b08f2e0ddfb505a4c156bfcf8bc262219704b8514c`.

## Commands and evidence

With Node 24 on PATH:

```sh
npm test
npm run typecheck
OCT3_INTEGRATION_URL=http://127.0.0.1:3003 node --env-file=.env.local --import tsx --test tests/connectors.integration.test.ts
```

`npm test`: 19 reported passes, zero failures, one integration test skipped unless
explicitly configured. There are 18 leaf invariant checks; Node also counts their
DATA parent. `npm run typecheck` passed. The opt-in integration check was then
run separately and passed against the coordinator's existing dev server.

## Actual connector journey

MCP protocol `2025-03-26` initialize/initialized and tools/list succeeded. The
server advertised exactly `submit_mission`, `mission_status`, `list_missions`.
Unauthenticated MCP access returned 401 with a Bearer challenge.

The caller submitted a labeled fixture mission, retrieved all three lanes and
evidence, and listed it. Repeated MCP submission and the standalone CLI submission
using the same idempotency key returned the same mission. CLI status/list also
succeeded. Agent approval was refused with 403. Manager revision from $900 to
$650 produced the $588 fixture plan with six passes; the old approval returned
409. Approval of the current proposal and caller resume returned an explicit
handoff; MCP status reflected revision 2 with no fabricated purchase confirmation.

This complete local test took **7.14 seconds**, including requests and CLI process
startup. It used fixture mission `bd0dc57b-ec6c-4a08-be53-f08c6de21608`, objective
prefixed `[Verifier fixture]`. It is not a measurement of live merchant automation.

## Fixed regressions

- Explicit sold-out/out-of-stock/discontinued event offers remain unavailable for
  any requested quantity. Unknown group inventory remains unknown.
- Exact retries preserve confirmed, executing and uncertain outcomes. Confirmed
  outcomes survive their original proposal expiry; an executing attempt stays in
  flight and blocks constraint revisions. Mismatched proposal identities remain
  rejected. No repeat attempt or reservation is created by the checked retries.

## Remaining boundaries

This verifies local file persistence, the browser adapter with deterministic
provider doubles, and the live local HTTP/CLI/MCP integration. It does not verify
hosted deployment or Supabase CAS/RLS. Supabase project setup is pending. Stripe
MPP service payment and Link purchase approval are absent, and final merchant
checkout is an explicit handoff. A paid receipt, real order, Fiverr hire or ticket
booking has not passed. No new billable browser probe or real commitment was made
by the verifier. UI visual verification is owned by the coordinator.

Items 06 and 07 remain in review for their broader live-integration scope;
their reported deterministic defects are resolved. Connector functionality and
local invariant results are recorded as verified facts on the board.
