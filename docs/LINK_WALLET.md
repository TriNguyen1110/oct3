# Link wallet in Cue

Stripe service billing and merchant spending are separate. The existing $0.50 MPP receipt pays Cue's test service fee. It cannot pay for an Amazon, Fiverr or food order.

The wallet integration uses Stripe's official `@stripe/link-sdk` 0.11.0 and `@stripe/link-cli` 0.25.1. Eve's native Link registry extension currently requires Eve >=0.54.4; this project runs 0.47.3, so the SDK avoids a framework upgrade during the hackathon.

## Connection

Use an isolated, ignored credential file:

```sh
LINK_AUTH_FILE="$PWD/.data/link-wallet-auth.json" npx --no-install link-cli auth login --client-name Cue --scope 'userinfo:read payment_methods.agentic'
```

Approve the displayed connection in Link, then use the CLI's printed auth-status polling command. Link requires standard profile/address scopes as well as agent-payment scope to list wallet methods. Cue's status response exposes only method IDs/types and a count, never identity details, addresses, tokens, card numbers or CVCs. The local credential reader requires a regular owner-only file, current process ownership, the payment scope and an unexpired token.

Local development uses `LINK_AUTH_FILE`; Vercel uses server-only encrypted `LINK_ACCESS_TOKEN`. Never put either token in a `NEXT_PUBLIC_` variable. The current hosted connection uses a short-lived token; it does not implement a production refresh-token vault. Renew with the official CLI and update the deployment environment before expiry. Expired tokens fail closed. Refresh credentials remain local.

`OCT3_LINK_MODE=test` is the default. Set `live` only for an actual reviewed payment flow. The existing request retains its original test/live mode on retries.

## Deterministic request boundary

The existing task resume endpoint can create or reconcile a wallet request only when:

- The task is live, the separate Cue service fee is paid, and the proposal is current and unexpired for a new spend request.
- Its stored exact-action hash matches the manager's passkey-approved proposal, with one held reservation for that amount.
- A live checkout-preview observation matches the task's proposal, revision and source URL. Research prices cannot fund a request.
- The merchant matches a supported HTTPS host, the source is a public URL without query credentials, and the total is USD $0.01–$500.

The server derives the merchant, item, quantity, taxes, shipping, fees, total and provider idempotency key from that stored action. It never accepts those fields from a resume caller. A durable claim excludes concurrent requests; a timed-out claim recovers using the same provider key. Responses must echo the exact purchase bindings. Only then does Cue request Link approval. A pending or approved wallet request prevents revision/rejection until reconciled or canceled. Failed or ambiguous calls retain the reservation.

No wallet response becomes a merchant receipt. This slice does **not** retrieve card credentials, inject them into a browser or submit a merchant checkout. Even verified Link approval ends with an explicit execution handoff. Actual card delivery needs a separately verified adapter with exact checkout/network guards and private credential handling.

## Endpoints and evidence

- Manager-only `GET /api/wallet`: actual connection check, test mode and redacted payment-method availability.
- Existing `POST /api/tasks/:id/resume`: exact-bound request creation/status reconciliation; approved caller agents can resume only the manager-approved action.
- Manager-only, same-origin `POST /api/tasks/:id/wallet/cancel`: cancel the stored provider request. The provider must confirm cancellation before the mission can be revised.

The real Link connection listed one saved method. A separate SDK-only diagnostic created a 50-cent **test** spend request, verified the echoed request, retrieved it and canceled it. `request_approval:false`; no payment credentials requested, no merchant actions and no real payment. This proves provider connectivity, not the product's full passkey-to-paid-checkout journey. See `reports/performance/link-wallet-provider-smoke.json`.

Official references: [Link SDK](https://github.com/stripe/link-cli/tree/main/packages/sdk), [Link CLI](https://github.com/stripe/link-cli), [Eve Link registry](https://eve.dev/r/extension/link.json).
