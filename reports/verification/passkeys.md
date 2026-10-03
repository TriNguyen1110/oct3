# Independent passkey security and rendered interaction verification

Scope: actual WebAuthn cryptographic verification using a fresh local Chrome CDP software authenticator, synthetic principals, and isolated mocked Supabase storage/CAS. No credential was enrolled in the real `oct3-demo` workspace, no user hardware was used, and no actual mission was approved or executed. The separate HTTP route test uses an in-memory mock row for the fixed demo auth workspace but enrolls no demo-manager credential. The coordinator owns any actual synthetic-workspace cloud proof.

## Frozen sources

| Path | SHA256 |
| --- | --- |
| `src/server/passkeys.ts` | `800795df3a02f80a312cac7206ba70b8442a76b4af0a026f9d79e986235c8538` |
| `src/server/missions.ts` | `cf063b6686b41f6a3dd1474113a5d21dbfb2ddbc13bf203e0158493f9d5c028c` |
| `src/shared/passkeys.ts` | `0c52e038fd14734865ea6ce18e82f1a1cd37a3f230e828d742ec5113fcc9f738` |
| `app/api/tasks/[id]/approve/route.ts` | `5d5ed74ba3c72e8d7d0adddf4194b8c7bf82821d518dd2acedd7955aae9c6a94` |
| `app/api/tasks/[id]/approval-options/route.ts` | `daf4c3831fdf9fbbfb1b70e7ddd2bc7c91557bf725dea27786f2c8d8ccadb877` |
| `app/api/passkeys/route.ts` | `38c98d388783dac9ed925972741d15f596040e28d9d60511a2661caaa4de676d` |
| `app/api/passkeys/register/options/route.ts` | `a0f953a168b8600b29e34fe2a0e62dde69153a70f2ec4f0e68647a16ccbc243b` |
| `app/api/passkeys/register/verify/route.ts` | `45253c1c06a713131b0f13e5c244ce8a48f5589e0c3f91cc17528e1b60935dd4` |
| `supabase/migrations/202610030003_passkeys.sql` | `98c4f20dca31eb9f04c1262f9ecfd901d1e86b337620832a9917719a687cb813` |
| `components/passkey-control.tsx` | `1f34aee6ea683d8b197fd91bb8e5940af518e6b112ca1b56e3e4b05ea4c5f514` |
| `components/mission-desk.tsx` | `a60ae30921f794765cd3433238cd2b3897f2a2479e7f1a5ca81ccdedb3da162a` |
| `components/free-registration-review.tsx` | `ed48d1d8e0b1850476d55455fbaf9ce7b9b6f05aad6e25f5d58d827367cbfbfd` |

Mission files also contain the coordinator's food-lane integration. This review addresses their passkey approval boundaries, not unrelated food research behavior.

## Findings and checks

`tests/passkeys-security.test.ts` uses real `@simplewebauthn/server` verification, actual browser-created credentials/assertions and `tests/helpers/virtual-passkey.ts`. The helper serves only a blank intercepted localhost document and has no app/database/provider interaction itself. Credential private material stays in memory and is not printed or persisted. For targeted negative assertions, the test re-signs modified authenticator/client data with its own synthetic key, establishing that a valid signature alone does not bypass the expected RP, origin, challenge or user-verification flag.

Passing checks include:

- Manager-only enrollment and exact workspace/principal challenge scope; platform attachment requirement; trusted request origins; duplicate enrollment denied.
- Invalid signature, validly signed wrong RP hash, wrong origin, wrong challenge and missing UV rejected before challenge consumption.
- Expired, foreign and replayed challenges rejected; concurrent verification of one challenge yields only one success.
- Exact task/proposal/revision/action binding; a changed proposal invalidates the ceremony.
- Counter CAS interference rejects the stale assertion and consumes its challenge, with no budget reservation or usable approval.
- Direct new live approval requires the verified current action hash. The public approval route rejects an injected `verifiedActionHash` field and returns `passkey_required` without proof. A mutation after signature verification still fails the approval CAS gate.
- Repeating an already approved exact decision returns its existing single reservation without creating another approval or commitment.

An independent negative exposed an enabled local-fallback race: two distinct first-enrollment ceremonies could both return success and overwrite the credential. The owner corrected the final local save with a synchronous existing-credential check immediately before insertion. The production Supabase unique constraint already protected that path. The same real-crypto concurrent regression now passes. The owner also made loaded challenge expiry fail closed for non-finite dates; production timestamps are database typed.

Read-only SQL review confirms RLS enabled, access revoked from public/anon/authenticated, service-role-only access, one credential per workspace/principal plus globally unique credential ID, nonnegative counters, scoped challenge schema, and atomic unconsumed/unexpired challenge consumption. This is source review plus mocked-CAS verification, not a claim that this verifier tested actual cloud SQL execution.

`tests/passkeys-ui.test.ts` independently exercises the actual rendered passkey component at 1440 and 390 widths on localhost with reduced motion and every API intercepted. A native virtual registration enables live approval but sends zero approvals. Simulated native cancellation sends zero approval requests; retry obtains a fresh prompt and sends exactly one signed assertion with the exact proposal ID/revision. No page errors or horizontal overflow occurred. No real biometric/hardware ceremony or merchant action was performed. Final palette screenshot review is a separate visual slice because CSS/SVG work continued during these DOM-flow checks.

## Evidence

Final narrow command with Node24:

`OCT3_PASSKEY_UI_URL=http://localhost:3003 node --import tsx --test tests/passkeys-security.test.ts tests/passkeys-ui.test.ts tests/passkeys.test.ts tests/free-registration-backend.test.ts`

Result: **22 reported tests, 22 pass, zero failures/skips**, 5.412 seconds. Existing free-RSVP approval, protected commitment and exact execution gates remain covered. `npm run typecheck`: exit 0. The initial temporary typecheck failure came from the concurrently added food lane's presentation-test map; the coordinator corrected it before the final successful run. No broad suite was repeated for this bounded verification.
