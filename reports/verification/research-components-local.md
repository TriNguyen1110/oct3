# Independent DATA + BROWSER verification

Verdict: **PASS for the bounded local component-tool and research-retry scope below.**
Verified October 3, 2026 in `/Users/tringuyen/Developer/.worktrees/oct3` after the workspace guard passed. No moving frontend surface was inspected. No remote browser, merchant, payment, or model request was made by these tests.

## Checks and evidence

Added `tests/component-tools.test.ts` and `tests/research-reliability.test.ts` (12 focused subtests). Ran:

```sh
PATH=/Users/tringuyen/.nvm/versions/node/v24.20.0/bin:$PATH node --import tsx --test tests/research-reliability.test.ts tests/component-tools.test.ts tests/browser.test.ts tests/data.test.ts
PATH=/Users/tringuyen/.nvm/versions/node/v24.20.0/bin:$PATH npm run typecheck
```

Result: **30 leaf checks passed**, zero failures or skips; Node reports 33 tests including three parent tests, duration 3.74 seconds. Typecheck passed. After allowing an explicit `OCT3_TEST_CHROME_PATH` override, the component file was rerun: all six leaf checks passed again, zero skips, 3.05 seconds. Chrome-path absence produces an explicit skip, never a fabricated DOM pass.

### Browser component tools

The tests invoke the actual AI SDK tools returned by `createComponentTools` on fresh local Chrome pages. Network interception supplies harmless synthetic HTML on every request.

- Exactly four preparation tools exist: inspect, plan, fill, verify; no final-submit tool.
- Default policy and explicit read-only policy block changes. Allowlisting alone does not enable writes.
- Password, payment/card and consent controls are excluded even when their IDs are allowlisted; excluded required controls prevent readiness. Existing input contents do not appear in inspection output.
- Origin matching is exact; a lookalike hostname is rejected. Combined ID/label allowlist rules must both match; label substring matching is rejected.
- Duplicate labels remain ambiguous until a unique control is supplied. An unplanned value cannot be written.
- A select reveals a required conditional field, produces a new snapshot, rejects the old snapshot, and requires replanning. Inspection → plan → fill → verification completes after the new field is supplied. External value modification fails subsequent readback.
- Checkbox writes set the supplied boolean; repeating the same value makes no change, and explicit false clears it.
- Prepared field readiness never reports checkout readiness or purchase confirmation.

**Finding fixed by browser owner:** `permitted()` previously used `policy.readOnly !== true`, allowing writes with an allowlist when `readOnly` was omitted. The new default-readonly regression failed against that version (expected one blocked field; observed zero), then passed after the owner required `policy.readOnly === false`. The verifier changed no feature code.

### Research policy and actual retry route

Tests create real live-mode MissionRecords through `createMission`, persist them only in a temporary isolated local store, mock provider fetches, and mock Eve session creation at `ClientSessions.prototype.create`.

- A first failed attempt has a 429 cooldown; a second attempt is permitted afterward; repeated unchanged technical failure exhausts the two-attempt budget.
- A configuration fingerprint change resets the budget only after cooldown. It cannot bypass uncertain cleanup or an expired claim needing reconciliation.
- Reserved, uncertain, committed, executing, confirmed, and active-claim states block research.
- Repeated `runMissionResearch` calls on needs_human tasks perform zero provider fetches and preserve the attempt ledger.
- `verifyLaneStopped` requires exactly one valid exact-lane stopped profile. Missing, another lane, running, unknown, and duplicate profiles fail closed; the helper only issues GET profile-list requests.
- Actual `POST /api/tasks/[id]/retry-research` rejects missing/running/unknown provider state without dispatch, accepts confirmed stopped state, clears the expired claim, queues the same task at the same mission revision, preserves the other two task objects, and dispatches one message naming that task/revision. A replay while queued returns task_busy without another dispatch.
- Actual `missionView` output and the retry response contain no private research fingerprint, attempt/claim ledger, cooldown metadata, or fake provider secret. There is no `publicMissionView` export in this implementation; the actual public boundary tested is `missionView` plus the route JSON response.

## Frozen file hashes (SHA-256)

| File | SHA-256 |
|---|---|
| src/browser/component-tools.ts | 919245b8b45c9412ce27eb487e5c48bcf1a37fcb50b8be4c1da74f753f1af974 |
| src/browser/components.ts | c4b313b8959ef3600fdcce896725e549dec5f5e69cd5739ae3abf55835724ae9 |
| src/browser/surfsky.ts | d3d44a87a8a41ab2c2818f5ae415b382944f99eaaf0e88f98e10c5f034f3267d |
| src/server/model.ts | 1e66f96dce7684bc755ff38eb2c69eed2865d9af5a9cdb40cdf21a427244fa07 |
| src/server/research-policy.ts | 584858a5fb34810eb2e091d6feff43c61c516fb2922eec840efe2a9935a21536 |
| src/server/research.ts | 0ea75ee27a88c9b9e0c7a5b3d0b23bfc30422ac0e67a71c9c9e4681c188b674a |
| app/api/tasks/[id]/retry-research/route.ts | 40b019468f89b8a9376433d9165ac4e3a7551ae2da85348cfde477da0737451e |

## Limits

This is local DOM and isolated local persistence verification with mocked Surfsky/Eve boundaries. It does not verify cloud deployment, Supabase operation, real Claude tool choices, real Surfsky status accuracy, merchant forms, service payment, Link approval, or any final purchase/hire/booking. Existing browser and DATA invariant tests were included, but broad board items 02/03/05/06/07 remain outside this narrow done verdict. Frontend/SCREEN verification is excluded.
