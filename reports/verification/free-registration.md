# Free registration independent verification

Scope: synthetic browser and backend boundaries only. No real provider browser, model, payment, RSVP or merchant mutation. All provider requests and browser objects are replaced locally; the backend uses an in-memory mocked Supabase REST/CAS implementation. This establishes deterministic application behavior, not successful registration on the actual provider.

## Browser snapshot

`src/browser/luma-registration.ts` SHA256 `c9c55c39862a95d850652a90f424131e49203f5c1857606ba35630cf5accf75e`.

`tests/luma-registration.test.ts` and reusable `tests/helpers/luma-registration.ts` use the exact captured public event fields supplied by the browser owner, with synthetic inventory and attendee values. Final independent Node24 targeted run: 32 reported browser tests (28 leaves and four parent cases), all pass. Combined browser/backend run: 42 reported checks, 42 pass, zero failures, 2.104 seconds. `npm run typecheck`: exit 0, including both new browser and backend test files.

The tests establish blank-form preparation without fill/submit; changed event/date/ticket/approval/guest rejection; invalid execution authorization causes zero provider requests; requests triggered at navigation/dialog opening are blocked before final arming; only one exact final registration POST can continue; malformed bodies, payment, wrong recipient/quantity and nested extra fields are blocked; only matching approved response confirms; pending/waitlist/wrong ticket/malformed/lost response remain uncertain; evidence excludes attendee and private ticket/proxy URLs.

Independent negatives initially exposed four failing leaves: preparation had no network mutation blocker; nested ticket and answer extras passed the request guard; arbitrary provider status leaked into public evidence. The browser owner fixed all four; the independent rerun above verifies the corrected snapshot. No generic merchant mutation safety claim is made.

## Backend corrected snapshot

Final corrected `src/server/free-registration.ts` SHA256 `8d1c5ef02f7a1927c2d364402feb50f2e92e2e3cf2cd0663cedeb48a75cbe2ff`. Independent targeted run: all ten backend cases pass.

Initial handed-off aggregate `bc7d3d982138306468a2fb2461b2371050af42324ae27a30d0ac068f956cf1b6` covers free-registration service, mission/model integration and prepare/review routes.

`tests/free-registration-backend.test.ts`: initial independent run five pass, three fail, 2.20 seconds. The following failures were sent to the backend owner and coordinator:

1. A cached preparation returns the old prepared proposal after an uncertain submission, because the cached return precedes the protected-commitment check.
2. Successful preparation finishing after a task becomes executing replaces its proposal and releases its reserved hold. Its final write checks committed/uncertain reservations but not the claimed execution.
3. Failed preparation finishing after execution claims clears its proposal and releases its hold. Its final write checks only revision.

The test deterministically changes the persisted state during the synthetic page navigation to model an asynchronous interleaving. These are storage-state races, not real provider submissions. The coordinator corrected all three failures by checking protected status/attempts/commitments before cached return and in both final mutation callbacks. Execution now acquires the shared event-browser lease before claiming and holds it until outcome persistence completes. The ten-case independent rerun passes on the final hash above.

Final passing checks: manager-only preparation/approval/review; workspace isolation; exact private action/attendee hash; saved-profile change denial; zero-total reservation without Link; forged free action denial; one claimed concurrent submit; uncertain resume does not replay; clean failure releases hold and invalidates approval; revision changes reject stale preparation; synthetic matching confirmation is bound to task/proposal/revision and duplicate resume does not submit again; unpaid preparation never reaches the provider; an occupied event-browser lease prevents claiming/submission and retains the zero hold. Read-only source inspection confirms that final confirmation also requires original live evidence with the current task ID, matching reference/public source, and any supplied proposal/revision matching the current action.

Frontend free-registration review was inspected read-only: pinned attendee is loaded from manager-only review endpoint; exact proposal/revision/profile/source/expiry is required to enable approval; submission is a separate explicit action; executing/needs-human state hides submission actions. The frontend owner's rendered mocked journey is separate evidence, not an independent rendered check by this verifier.

## Final regression evidence

Commands used from the guarded canonical workspace with Node24:

- `node --import tsx --test tests/free-registration-backend.test.ts tests/luma-registration.test.ts`: 42 reported checks pass, zero failures (2.104 seconds).
- `npm test`: 137 reported checks, 135 pass, zero failures, two opt-in skips (7.753 seconds). The skipped tests are the existing real MCP/CLI connector integration and saved-profile rendered UI test; they were not re-run in this final local regression. Earlier explicitly enabled saved-profile UI evidence remains in `reports/verification/preferences.md`.
- `npm run typecheck`: exit 0.

The full suite includes auth/cookie and exact approval negatives, atomic budget concurrency, service-fee challenge/proof/idempotency and lost-response tests, caller secret environment isolation, local merchant component guards, Luma extraction, CLI/MCP opt-in forwarding, preferences schema/status, result links, research retry/reconciliation, and this free-registration slice. It does not prove every live provider feature works. Actual hosted readiness, read-only provider preparation and any manager-authorized registration require their own evidence; no actual RSVP was attempted here.
