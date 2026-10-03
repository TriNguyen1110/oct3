# Cue impact baseline

This baseline supports one defensible claim: Cue can coordinate several bounded research lanes quickly while preserving payment, approval, budget, and browser-exclusion controls. It does **not** yet prove time saved against a human or paid-purchase throughput. One $0 Luma RSVP is now provider-confirmed.

## What was measured

| Evidence | Observed result | What it establishes |
|---|---:|---|
| Local fixture mission | 78 ms to three lane results | Application overhead is small in a fixture; browser, model, payment, and review time are excluded. |
| Local live read-only mission | 21.036 s wall time; 2/3 lanes returned grounded options | A single three-lane research run can return useful evidence quickly. All three lanes still required a human handoff; confirmed commitments were 0. |
| Local paid research | 27.428 s end to end; 5.390 s through submit and sandbox payment | The CLI → Stripe sandbox MPP → Eve/Claude → Surfsky → Supabase path ran as one flow. Only 1/3 lanes returned options and no merchant action occurred. |
| Hosted external caller | 2 tool calls; reported cost $0.11198925 | Claude Code submitted and read a sandbox-paid mission. The cost covers that recorded caller run; it is not total unit economics. |
| Synthetic component form preparation | 20.654 s; source says 9 steps, lists 10 tool calls | On local synthetic HTML with the real Claude API, the agent retained supplied values and found a conditional field without final submit. The source count discrepancy is preserved. |
| Free event, historical attempts | 22.580 s preparation; later 48.852 s resume ended `needs_human` | These remain labeled failed/preparatory runs and are not overwritten by the later success. |
| Free event, confirmed run | 17.330 s to fresh $0 proposal; 27.428 s from native-passkey approval timestamp to provider confirmation | The real manager enrolled a native passkey, approved the exact action, and Cue recorded matching Luma confirmation. The 27.428 s includes manager delay before **Register now**; it is neither isolated execution latency nor human-active time. |
| Hosted voice draft | 3.042 s round trip | An actual hosted browser and Gemini provider converted a 4.842 s synthetic microphone fixture into an editable draft. It submitted no mission and performed no merchant action. |
| Food selected-state release smoke | 25.665 s; 0 options; `merchant_changed` | The guarded adapter failed closed because Potrero was absent. It made no cart, checkout, order, or payment action; this remains a handoff. |
| Supabase guards | 4 concurrent submissions → 1 mission; 2 budget-conflicting concurrent approvals → 1 accepted | Idempotency, atomic budget reservation, database overspend rejection, and lane-lease exclusion passed with synthetic data in actual Supabase. This is not a capacity benchmark. |
| Passkey approval | Synthetic replay/concurrency guards passed; the real manager also enrolled a native passkey and approved the exact $0 Luma action | The native approval led to matching provider confirmation. Public-key verification data is stored; biometric data is not. |

**No sustained throughput or scale has been measured.** The research examples establish one observed latency and option yield each. A separate, later run produced one provider-confirmed free RSVP for $0. That single event is functional evidence, not paid-merchant throughput or a statistical completion rate. The JSON preserves historical research ratios only as arithmetic, not capacity estimates. Do not add the 3.042 s voice, 17.330 s proposal, and 27.428 s approval-to-confirmation measurements: they come from separate scopes, and the last includes manager delay.

The latest sanitized account preflight found both the Amazon and Fiverr persistent profiles signed out. Amazon loaded the exact toothpaste product page, while Fiverr loaded the exact gig and a Continue control. Neither checkout total was verified. Each needs private login followed by a review-page run that stops before purchase. Browser cleanup was confirmed.

## Cost boundary

The configured service fee is $0.50, verified only in Stripe sandbox. It is a test receipt and proposed price, not production revenue. Stripe processing fees are unmeasured. Surfsky, coordinator-model, hosted infrastructure, refunds, support labor, and production payment-failure costs are also unmeasured.

The only recorded dollar cost is the hosted Claude caller run at $0.11198925. Dividing it across three attempted lanes gives $0.03732975 per lane attempt for that caller component alone. A linear 100-run illustration is $11.198925 for that same component; it excludes every unknown cost and does not forecast future pricing. One hundred successful $0.50 sandbox-fee equivalents would be $50, but that is not revenue evidence.

Use this unit-cost equation once metering is available:

`run operating cost = caller model + coordinator model + browser minutes × browser rate + infrastructure allocation + Stripe processing fee`

`contribution before labor = successful service receipts − operating costs − refunds`

## Matched manual-versus-Cue timing protocol

Run at least ten matched trials for each task class. Use the same brief, provider, account state, location, quantity, budget, and time window. Randomize whether the human or Cue goes first so inventory and site-state changes do not consistently favor one side.

Choose the same success target for both arms before each trial: grounded result, checkout-ready, or confirmed commitment, using the quality definitions below. Start each clock when the same brief is delivered to the human or Cue and stop only when the same target is met and independently checked. Count Cue setup and submission work in its elapsed and active time. Record blockers, retries and unresolved handoffs as failures or incomplete outcomes at the agreed deadline, not successful completion times. Never compare Cue's time to a blocker with the human's time to a successful result.

Measure human active time with a separate stopwatch that runs only while a person reads, types, clicks, resolves login/challenges, reviews evidence, or approves. Browser/model waiting counts toward wall time and not human active time. Cue setup, correction, approval, and handoff resolution count as active time.

Score three success levels separately:

1. **Grounded result:** requested item/service/event has source evidence.
2. **Checkout-ready:** exact quantity, recipient, taxes, fees, and final total are verified.
3. **Confirmed commitment:** merchant confirmation or receipt matches the approved action.

Report median and p90 wall time, median and p90 human active time, failure rate, handoff rate, and evidence-error rate. Compute:

- `success-adjusted throughput = matched-quality successful outcomes / all trial wall hours, including failed attempts`
- `active minutes saved per matched success = manual active minutes − Cue active minutes`
- `monthly human hours saved = monthly comparable successful tasks × median paired active-minute difference / 60`

Keep the signed paired difference: a negative value means Cue added human labor. Report failure and handoff rates alongside savings so unmatched failures cannot disappear from the comparison. Monthly extrapolation is an illustration only after representative matched trials; it is not measured scale.

Do not convert the current 21.036-second research run into labor savings. No matched manual timing or human active-time measurement exists.

## Multi-person boundary

Cue currently supports one workspace, one manager, and one caller identity with scoped access. It also supports exact-action passkeys, idempotent submissions, atomic budget reservations, stale-approval rejection, and exclusive browser leases.

It does not implement team RBAC, organization membership, multiple manager roles, approval quorums, per-person permissions, cross-workspace reporting, or measured multi-user throughput. Position the controls as a strong single-manager foundation, not as a completed enterprise collaboration system.

## Inputs still needed for a business case

- Matched human and Cue timing trials with separate active and wall time.
- Production completion and handoff-resolution rates.
- Login-ready Amazon and Fiverr checkout review evidence.
- Actual Surfsky, Claude/coordinator, Vercel, and Supabase metering.
- Production Stripe processing fees, failures, and refunds.
- Quality review for source accuracy and material checkout changes.
- Team throughput measurements after team RBAC exists.

The pitch supported today is: **Cue turned one request into parallel, governed research in about 21 seconds in one observed run, then used a native passkey to authorize and confirm one exact $0 Luma RSVP with matching provider evidence. Amazon and Fiverr checkout remain handoffs, and labor savings still require a matched trial.**

## Source and independent verification

Primary measured inputs: [fixture](../performance/local-fixture.json), [live research](../performance/local-live.json), [paid research](../performance/local-paid-research.json), [hosted caller](../performance/hosted-baseline.json), [synthetic components](../performance/local-components.json), [event preparation](../performance/free-registration-prepare.json), [historical event resume](../performance/luma-registration-live.json), [fresh hosted event proposal](../performance/hosted-luma-passkey-review.json), [native-passkey confirmed event](../performance/native-passkey-live-event.json), [hosted voice](../performance/hosted-voice-proof.json), [Supabase guards](../performance/supabase-guards.json), and [synthetic passkey cloud proof](../performance/passkey-cloud-proof.json). The latest signed-out merchant preflight is the browser worker's bounded session report; it has no complete new checkout artifact and supports no completion or timing claim.

Independent verifier checked the stated measurements and derived arithmetic against these artifacts. No manual baseline, active-time saving, sustained scale, multi-person collaboration, or paid merchant purchase is measured. One free RSVP is provider-confirmed; it does not establish a rate. No new provider call or product change was made for this report.
