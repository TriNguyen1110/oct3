# Independent verification — October 3, 2026

Root: `/Users/tringuyen/Developer/.worktrees/oct3`; workspace guard passed.
Verifier owns `tests/**` and `reports/verification/**` only. No merchant orders,
messages, payments, new remote browser sessions or production data changes were
performed by these checks.

## Reviewed slices

- Browser: `src/browser/**`, builder SHA256
  `05595db36a5fece15beeccedf3c4b7c1195454c338fbbcebd43f5e9939b9c109`.
- Backend: builder SHA256
  `e119986afedfec2cf3451e9487882c3067b1a38fe819310f13eb0a32b3fcaea8`.
  The builder describes its hash as 31 files under `agent/**`, `src/server/**`,
  `app/api/**` (excluding coordinator-owned MCP routes) and `supabase/**`.

## Initial result

`npm test`: 14 checks passed; two actual cases failed (Node also counts the
containing DATA test as failed). `npm run typecheck` passed.

1. **Sold-out event offered to a group.** Eventbrite `SoldOut` markup with six
   requested passes produces `available: undefined`; `researchTask` filters only
   explicit `false`, so it can retain this sold-out option. Preserve explicit
   unavailability for any quantity; unknown group inventory must not erase a
   known sold-out result. Reproduction: `tests/browser.test.ts`.
2. **Retry downgrades confirmed commitment.** `resumeTask` on an approved,
   confirmed task changes its state to `needs_human`, despite a committed
   reservation and provider evidence. Treat confirmed outcomes as terminal and
   preserve them on retry. Reproduction: `tests/data.test.ts`.

## Passing coverage

- Merchant URL boundaries and removal of private tracking parameters.
- Event USD unit-price multiplication, minimum-price labeling, unknown group
  inventory, foreign currency exclusion and changed event-date refusal.
- Invalid connection and stale approval stop before network access.
- Provider authorization failures do not expose raw messages or credentials.
- Browser failures and CDP failures stop the exact owned session; failed cleanup
  remains explicit; simultaneous access to one in-process lane is rejected.
- Separate caller/manager authentication, signed cookie checks, cross-origin
  mutation refusal and workspace isolation.
- Eight racing identical mission submissions create one mission; changed input
  under the same key is rejected.
- Racing approvals cannot allocate the same remaining budget; repeated approval
  creates one reservation.
- Budget revision releases safe holds, rejects old proposal/revision, preserves
  six passes, and replans the fixture from $788 to $588 under the $650 cap.
- Uncertain spending survives resume/revision; reject and an underfunded revision
  fail. Service-paid and Link-success states do not confirm a merchant task.
- Durable local lane leases exclude competitors and reject another owner's release.
- Hosted use fails closed when Supabase is absent.

## Limits

These are deterministic tests with fake Surfsky responses and an isolated
temporary local state file. Supabase CAS/RLS and hosted durability remain
unverified until the user's new project is connected. Stripe MPP, Link approval
and actual merchant checkout are not implemented/verified. The browser builder's
live probe report documents Amazon HTTP 503, Fiverr observations and Eventbrite
observations, with all tested sessions stopped; the verifier did not repeat those
billable probes. No end-to-end completed purchase has passed. UI and MCP journey
checks are pending stable integration and the coordinator's single dev server.
