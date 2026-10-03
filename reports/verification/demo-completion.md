# Sandbox demo completion and Luma research — independent verification

Date: 2026-10-03T19:51:11.517617+00:00
Root: `/Users/tringuyen/Developer/.worktrees/oct3`; workspace guard passed and additive completion contract read.

## Verdict and checks

PASS for the new synthetic sandbox payer, CLI/MCP explicit opt-in, client API metadata and Luma read-only parser/presenter scopes. This does not mean merchant execution or a complete real Claude/payment/browser/RSVP journey has been implemented or verified.

- `npm test` on Node24: **89 reported tests, 88 passes, zero failures, one opt-in connector integration skip**, 10364.067375 ms. That is 80 passing leaf checks plus eight parent groups.
- `npm run typecheck`: exit0.
- No production build repeated by this verifier. Coordinator owns build, rendered UI and actual provider journey evidence.

## Sandbox payer evidence

New `tests/service-test-payment.test.ts` has nine leaf checks using temporary isolated local storage, actual installed MPP client/server challenge/credential parsing, mocked Stripe token HTTP endpoint and mocked Stripe SDK/Eve boundaries. No real token, payment, model call or merchant browser is used.

1. Explicit server enablement is required. Live Stripe keys, mismatched profiles and fixture payment requests fail before token minting.
2. Service-payment route requires authentication, same-workspace mission access and strict body exactly mode:test. Unknown fields, paid assertions and caller-supplied amount are rejected.
3. Token parameters remain pm_card_visa,50USDcents,configured test profile and future expiry. Non-opted-in submit remains402; only exact authorized opt-in invokes the payer.
4. Success passes through the existing MPP verifier, persists bound proof before dispatch, exposes a public service receipt, and clears the private cached credential. Stored-proof replay mints no token and creates no additional charge or session.
5. Provider failure bodies and private SPT/key/binding strings do not appear in public API results.
6. Four concurrent payer requests use the selected token under one Stripe idempotency key and dispatch once. The Stripe mock enforces unchanged token parameters for each idempotency key, unlike permissive mocks that could miss a token mismatch.
7. A simulated Stripe success followed by lost response on the submission entry point recovers through the separate service-payment entry point using the same SPT; exactly one token was minted. The owner privately caches the exact HMAC challenge/credential and selects the concurrent winner by CAS.
8. Submitted credentials past expiry require reconciliation before any new token or charge. At-least22hour attempts remain blocked. Token requests use a10000ms abort signal; injected timeout fails safely.
9. MCP omitted/false pay_test_service_fee preserves402 with a recoverable challenge; true invokes the enabled payer, returns verified service state and receipt, and exposes no SPT/key.

The Stripe idempotency behavior here is simulated and asserted, not a new provider-side test. No claim of an autonomous real wallet, live funds or merchant authorization follows from this sandbox payer.

## Client and frontend boundary evidence

New `tests/payment-client.test.ts` runs the real CLI subprocess against an ephemeral local mock HTTP server. Default submission has no sandbox opt-in; explicit --pay-test works only for live submission; fixtures, duplicate flags and list/status payment flags fail before requests. Reads forward no payment credential.402 saved handles, public challenge and verified service receipt survive output, while input payment credentials do not leak.

Mocked-fetch API tests verify recoverable402/503 mission IDs, same-origin dashboard links, omission of payment/auth/cookie response headers, rejection of foreign/userinfo-bearing link metadata and fallback for a non-string error message. ApiError retains its parsed payload; it is not an arbitrary response-body sanitizer. Source inspection confirms the dashboard never renders raw ApiError.payload and uses the validated mission ID to fetch/reopen the same saved mission. Payment is an explicit action; failed payment preserves the mission and refreshes its status.

Frontend payment code was inspected at the earlier frozen payment slice, components/mission-desk.tsx SHA256 d28fb01aef3f5424c6dd310876815bae8a6f78f96fcc77e77f8a8f6abb8e5c31. The frontend owner began saved-profile edits after this verification; this report does not cover those new edits or independently rendered screenshots. src/client/api.ts is included in hashes below.

The caller environment test's synthetic parent now sets NODE_ENV:test to satisfy Next's ProcessEnv augmentation. The launcher still drops it and no credential allowlist was widened. The environment isolation regression passes in the full suite.

## Luma finding and evidence

Independent negative testing found malformed JSON-LD price whitespace coerced to zero and displayed as free. false/array values had the same coercion risk. Browser owner corrected raw-value validation; only finite nonnegative numbers or nonempty supported decimal strings proceed. The failing case and variants now pass.

Four parser checks verify exact Luma/lu.ma host+event-slug allowlists, discovery/lookalike/credentials rejection, only explicit USDzero qualifying as free, unknown/malformed price suppression, date mismatch rejection, paid quantity arithmetic, host approval distinct from RSVP and waitlist distinct from availability. A separate presenter check confirms observed Luma provider links while keeping confirmation/receipt null and rejecting credential-bearing query links.

These tests use synthetic public-page data. They do not register an attendee, fill a remote form or prove current availability of an actual event. Remote component mutation remains disabled. Live research-to-exact-proposal and merchant execution/RSVP remain separate unfinished work.

## Stable evidence hashes

- `cli/oct3.mjs`: `692fdbda1595a67ffb1d90c7f263deb60677dd681f6ff1135de0d4cf595079fa`
- `app/api/mcp/route.ts`: `ccf8cf28a784ded17c6cb0c620ce86b8d752dabdb2d51ace636da2920e0e883b`
- `src/client/api.ts`: `94720f747aec2e84db9ec0246cbafbaa39789f376668778d1195d2565b547e0b`
- `src/server/service-test-payment.ts`: `369c27da5a87d5c3f3168b0b3ee381bdcd1cd5ff83dbe310c7f0aed3cf85d6b1`
- `src/server/model.ts`: `062f1ee83e4f8d28a88ef0fe78d67eebc4112016a738a2a460fc118945630548`
- `src/server/service-payment-gate.ts`: `798b35b407dc5c8c131bccf4229b63cd0a8345550e2ab0275f94c160105a6d08`
- `app/api/missions/route.ts`: `26df5cea9c853c298105baf917f98767aaac2941c16a42fb60617e7ef708ce1c`
- `app/api/missions/[id]/service-payment/route.ts`: `0f94eae536dd5127a079d20ea81db688884abef9e45a7297a7d6ab93299ff159`
- `src/browser/extract.ts`: `cd475e7ee472c29cc17ba7f27e38d7c3845a3c659a2c9cae2c534e2ca8456fdb`
- `src/server/presentation.ts`: `0b021aa8562782ef2b7876ef821a2dc9cb153c89b5fe32f5ec7061820ef55c1f`
- `tests/payment-client.test.ts`: `aac701ddf562c32c97b4b134eaace97c1d0a675eddfd6db4ab9220a9d6193f69`
- `tests/service-test-payment.test.ts`: `abed0b5a8581b7a5d6065be12ba72043d98eeeda9653a1b956a2b5f58eee4167`
- `tests/luma-research.test.ts`: `87a29c7af982629518544353824e58e365a812119671d095cd080fd44142d874`
- `tests/presentation.test.ts`: `4d593e0038040e4c156bc9878d8fe794e0e49327f2161f51225a91b3894199d2`
- `tests/caller-environment.test.ts`: `50538c1d7e5a0de73c6a1c82df386583d859c0c6295879300f5608ee3db68748`

## Board scope

Appended review/done only for sandbox-payer-synthetic, payment-client-local and luma-research-local. The full UI, actual provider journey and RSVP are not marked done by this report. No commit or push by verifier.
