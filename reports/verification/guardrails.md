# Deterministic guardrail verification

Date: 2026-10-03T19:21:43.220006+00:00
Canonical root: `/Users/tringuyen/Developer/.worktrees/oct3` — workspace guard passed.

## Verdict

PASS for independently tested local authorization, approval, budget, browser-policy and synthetic service-payment boundaries. All eight failures discovered during this audit were corrected by feature owners and independently retested. No feature files were edited by the verifier.

Final `npm test` on Node24: **68 reported tests, 67 passes, zero failures, one opt-in connector integration skip**, 7210.028208 ms. This includes 61 passing leaf checks plus six parent groups. `npm run typecheck` passed before the final receipt-extraction owner fix; coordinator owns final build/typecheck integration.

Changes owned by verifier: `tests/guardrails.test.ts`, `tests/service-payment-gate.test.ts`, loopback/captured-policy updates in `tests/component-tools.test.ts`, exact synthetic paid proof setup in `tests/research-reliability.test.ts`, this report and board appends. Existing presenter tests also pass in the full suite.

## Findings corrected and independently verified

1. **Cookie-origin bypass:** valid manager cookie plus invalid Authorization header previously skipped Origin validation. Invalid explicit bearer headers now deny authentication instead of falling back to the cookie. Malformed bearer syntax, invalid signed-cookie expiry and extra cookie-token segments also fail closed.
2. **Constraint-role boundary:** `reviseMission` previously accepted a same-workspace agent principal when called directly. It now enforces manager role itself. The HTTP route had already enforced manager access, so the finding was an internal service-boundary gap, not a demonstrated public endpoint bypass.
3. **Malformed proposal expiry:** invalid stored dates previously compared as NaN and approved. They now fail closed; normal expired approvals still fail.
4. **Invalid money:** negative stored proposal totals previously created negative reservations. They now fail before approval; itemized amounts and total consistency are validated.
5. **Approval binding:** a stored approved state with another proposal ID previously passed resume. Exact proposal/revision binding is now required.
6. **Reservation binding:** released reservations previously passed resume. An exact active hold is now required. Existing local racing-budget checks, safe-hold release, uncertain-spend retention and protected committed/in-flight resume checks still pass.
7. **Remote preparatory side effects:** a text fill under explicit write policy triggered merchant `oninput` JavaScript calling form.requestSubmit, producing one POST intercepted entirely inside local Chrome. The active research path was already read-only. Owner now blocks every non-loopback component write regardless of explicit policy, while loopback fixture preparation remains supported. Negative fixture now returns blocked plan, field_not_allowed fill and zero POSTs. Later mutation of supplied field/origin arrays cannot widen captured policy. This is not a claim that arbitrary merchant mutation is safe.
8. **MPP paid-flow receipt loss:** actual installed MPP parsing plus mocked Stripe success returned HTTP500 because the implementation keyed a WeakMap by callback Request identity. mppx0.13.1 snapshots callback inputs into a new Request, so the original request lookup failed. Owner replaced this with validation of the server-generated receipt attached by MPP. Concurrent paid requests, durable proof and replay now pass.

## Exact approval evidence

Fifteen same-ID/revision proposal mutations are rejected during both repeat approval and resume: merchant, source URL, title, option, quantity, recipient, deadline, expiry, task binding, currency and all five money fields. Proposal property insertion order alone does not invalidate the canonical hash; repeat approval preserves a single reservation. No live executor is enabled by these checks: resume still returns a merchant handoff, with no fabricated confirmation.

## Payment evidence

`tests/service-payment-gate.test.ts` uses real MPP challenge and credential serialization/parsing with a mocked Stripe SDK PaymentIntent.create and mocked Eve session creation. Global fetch is forbidden. It verifies:

- Bound mission row and first credential-attempt timestamp exist before Stripe create; Stripe receives exactly 50 USD cents, confirm:true, no removed payment_method_types parameter, and a durable mission-bound idempotency key.
- Unpaid direct calls to research and dispatch fail before external services.
- Concurrent changed-body reuse yields one durable row and 402/409, with no Stripe call.
- Four duplicate paid requests share one Stripe idempotency key and create one Eve session; a valid exact paid proof is stored before session creation. Provider-level idempotency is mocked here; this does not independently prove Stripe's production behavior.
- Replay from stored proof returns a receipt without any new Stripe call or second dispatch.
- Signed credential replay across missions, changed-body reuse and challenge amount tampering fail before Stripe.
- Paid status alone, absent/mismatched proof amount/currency/mode/external binding/scope/reference, wrong workspace/request hash/idempotency key and malformed verification timestamp fail closed.
- Malformed, future, exactly-at-least-22-hour and older first-attempt timestamps require reconciliation without charge.
- Saved verified proof remains usable after the old attempt-age cutoff; it is not recharged.
- Ambiguous Eve session creation remains held after constraint revision, preserving the original uncertainty and avoiding duplicate session creation.

Post-payment research-retry tests now seed only an exact synthetic server-bound paid proof inside temporary isolated records. The production gate remains enforced. All six retry checks pass.

## Exposed capability and limitations

Read-only inspection found three enabled Eve mission tools: get_mission, research_mission and research_task. They derive workspace from authenticated session attributes. Built-in bash, agent delegation, file read/write, web fetch and web search tools are disabled. Live research explicitly supplies readOnly:true. Model ranking may select observed options; it does not create application approvals, set component policy or authorize spending.

Browser allowlist, stale execution authorization, no fabricated merchant completion, cleanup and duplicate-profile guards pass with mocked providers. Actual Chrome DOM tests use intercepted synthetic pages. Local atomic storage is tested; hosted Supabase CAS behavior and real Stripe/MPP credentials, payment provider acceptance, live merchant checkout and hosted/browser/CLI/MCP journey are outside this verifier run. The opt-in connector integration test was skipped; coordinator separately owns actual journey evidence. No live merchant transaction, Stripe charge, real credential or additional dev server was used here.

## Frozen evidence hashes

- `src/server/auth.ts`: `f824d1ffab9f2b28e6777a670c512a2f98a0ae73daa2303339c859acc0714ce6`
- `src/server/missions.ts`: `c2cf35cfc069fb4ef274dad966a78ccf39efddc0821ccff00213f85b27d5efca`
- `src/server/model.ts`: `fd56a9bf529b3169a8c008e9f626504b1fadcb42b95ea6d5097457c166d6ccf8`
- `src/server/store.ts`: `77afcb42b822c7313e6c88d38a063f8c54d95468629d1161c37e3aecf9f4ef09`
- `src/server/dispatch.ts`: `4f20f18e725416bc9e112fb4813c0dd8f7dc7b3297380ec193532fd35e95e7fc`
- `src/server/research.ts`: `cda6ea738a9b75df94c1bb0316712365a782c57f10a1a1cbf199b2abdf55acf4`
- `src/server/service-payments.ts`: `57338a43a0a100f65ad6b7e26f2bb0c3d8154242c1c4c0f1ea829c80f7e9505f`
- `src/server/service-payment-gate.ts`: `b27c7aa4d7f4107f255966943c858c946eea3dc4fab68f2364ec077930b89c0d`
- `src/browser/components.ts`: `b59dd2e6ec895e06c7bfaff7d6a29b7dedd3592eb354b4cd80bdc5727ec06f3c`
- `src/browser/component-tools.ts`: `919245b8b45c9412ce27eb487e5c48bcf1a37fcb50b8be4c1da74f753f1af974`
- `src/browser/index.ts`: `1633957f7e43a77dda5f8fe6dc71cfcacbfe845c3a741a38cd456f8d7280e1e1`
- `src/browser/extract.ts`: `264882d8f47fc508192fdc411f9ef4762ccf9639ce9021fdc42c9575a0c8e2df`
- `app/api/missions/route.ts`: `bd462921200de00315fecffeeff1fc72dba76258a99f52c63d3c7fd79b9c94b4`
- `tests/guardrails.test.ts`: `7d67d3333de885a8056c72352896eb7f4f5ed9b9cd8ce2cfb359f30e81a42683`
- `tests/component-tools.test.ts`: `2c55dce00ab31c113ffecac0975ea2f63bdb9bf620e39f413284d28e35499007`
- `tests/research-reliability.test.ts`: `abc90b92b89763644db167d49495db41040b25a570db9a589e7e3fbb60479afc`
- `tests/service-payment-gate.test.ts`: `54687c904a2cb2be4deee231fabe15c2a2c15812e617ee6b13b1cf6d764e3fd7`

## Board rows

Appended independent done verdicts for guardrails-local and service-fee-synthetic only. No real payment, remote database or merchant completion integration is marked done by this report.
