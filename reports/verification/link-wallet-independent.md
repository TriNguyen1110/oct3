# Link wallet independent verification

Verified 2026-10-03 against the frozen wallet backend. This verification used an isolated local mission store and a mocked Link HTTP boundary. It made **zero real provider or account calls**.

## Result

- `node --import tsx --test tests/link-wallet.test.ts`: **12/12 passed** in 2.020 seconds.
- `npx tsc --noEmit`: passed.
- `git diff --check -- tests/link-wallet.test.ts`: passed.

The suite verifies:

- exact amount, currency, merchant URL, item, quantity, totals, and test-mode metadata echoes;
- no provider access without the exact passkey approval hash, held reservation, and matching checkout preview;
- one create under concurrent resumes and retrieval of the same provider request on replay;
- stale `creating` recovery with the original request ID or idempotency key, while a fresh claim stays busy;
- malformed `checked_at` fails closed and requires reconciliation;
- provider create errors retain the budget hold and mark the wallet state uncertain;
- returned synthetic card fields and access-token-shaped fields are absent from persisted and returned mission state;
- a live wallet request blocks proposal revision until provider-confirmed cancellation;
- provider cancellation failure exposes a fixed error and retains both request state and reservation;
- wallet and cancellation routes reject non-manager callers before provider access.

The mocked create payload also proves private recipient and attendee strings are not forwarded. This suite does not validate merchant checkout execution and does not obtain a payment credential. Link authorization and cancellation do not constitute a merchant purchase.

## Frozen inputs

| File | SHA-256 |
| --- | --- |
| `src/server/link-wallet.ts` | `9b0e70e85943645eec016d936c48170d9a9900cf60e8b2de4ee6d1d64250e113` |
| `src/server/missions.ts` | `7fccd052437cc576096dc91af5cd8cba17505885185a1bcb9969181005fe5515` |
| `src/server/model.ts` | `5094d99c55dc5863803571d3ffc82497272cfba34c9ee6c49c244276c38ef2cf` |
| `app/api/wallet/route.ts` | `028549a3845f6e8b106ba903d1611aa0e361f931038c924849f1e11c2f182771` |
| `app/api/tasks/[id]/wallet/cancel/route.ts` | `567a09765bede1f62ce39130a624a5444947bd78769eb5bbc676326545886b84` |
| `tests/link-wallet.test.ts` | `e335906b4e194b3698a2ef9d524368409c7741289b6549d345bd1c6db1e46b47` |

