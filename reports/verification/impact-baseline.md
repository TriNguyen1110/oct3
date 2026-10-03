# Cue impact baseline

This baseline supports one defensible claim: Cue can coordinate several bounded research lanes quickly while preserving payment, approval, budget, and browser-exclusion controls. It does **not** yet prove time saved against a human or paid-purchase throughput. One $0 Luma RSVP is now provider-confirmed.

## What was measured

| Evidence | Observed result | What it establishes |
|---|---:|---|
| Local fixture mission | 78 ms to three lane results | Application overhead is small in a fixture; browser, model, payment, and review time are excluded. |
| Local live read-only mission | 21.036 s wall time; 2/3 lanes returned grounded options | A single three-lane research run can return useful evidence quickly. All three lanes still required a human handoff; confirmed commitments were 0. |
| Local paid research | 27.428 s end to end; 5.390 s through submit and sandbox payment | The CLI → Stripe sandbox MPP → Eve/Claude → Surfsky → Supabase path ran as one flow. Only 1/3 lanes returned options and no merchant action occurred. |
| Hosted external caller | 2 tool calls; reported cost $0.11198925 | Claude Code submitted and read a sandbox-paid mission. The cost covers that recorded caller run; it is not total unit economics. |
| Fresh concurrent lane rehearsal | 53.711 s observed three-lane window versus 81.426 s summed lane runtimes | Fiverr, Luma and food began within milliseconds of one another. Their overlap reduced wall time by 27.715 s, or 34.0%, versus the arithmetic serial sum of those same runs. This measures browser-wait compression, not human labor saved or purchase throughput. All three cleaned up; commitments were 0. Amazon was a separate 12.188 s Browserless run. |
| Fresh hosted four-lane caller | Claude submitted 1 mission and read status in 2 tool calls; reported caller cost $0.12576175 | The actual mission fanned out all four lanes after a $0.50 Stripe sandbox fee. Amazon and Luma returned options; Fiverr and food stopped with explicit handoffs after bounded retries. This is routing and failure-containment evidence, not four-lane completion. |
| Synthetic component form preparation | 20.654 s; source says 9 steps, lists 10 tool calls | On local synthetic HTML with the real Claude API, the agent retained supplied values and found a conditional field without final submit. The source count discrepancy is preserved. |
| Free event, historical attempts | 22.580 s preparation; later 48.852 s resume ended `needs_human` | These remain labeled failed/preparatory runs and are not overwritten by the later success. |
| Free event, confirmed run | 17.330 s prepare/review/approval-guard verification cycle; 27.428 s from native-passkey approval timestamp to provider confirmation | The 17.330 s covers POST preparation, GET review, and verifying missing-passkey rejection HTTP403; it is not isolated proposal or adapter latency. Separately, the real manager enrolled a native passkey, approved the exact action, and Cue recorded matching Luma confirmation. A later scoped Inbox lookup found the matching Luma registration email received at 21:23:08Z, with one query, one metadata read and one eligible body read; it made zero external actions. The 27.428 s includes manager delay before **Register now**; it is neither isolated execution latency nor human-active time. |
| Hosted voice draft, latest release | 2.968 s round trip | Actual hosted authenticated browser/Gemini route with 4.842 s synthetic microphone audio. Explicit Apply changed the form only, with zero mission submissions or forbidden mutations. Provider time is included, not isolated. |
| Hosted voice draft, historical | 3.042 s round trip | Earlier separate hosted synthetic-microphone run; preserved as historical evidence, not pooled into a benchmark. No mission or merchant action. |
| Food selected-state, latest actual run | 52.971 s; one $6.60 item estimate | The guarded adapter verified Boba Guys Potrero and read back four selected recipe controls: 16oz iced Classic Black, Boba, Organic Half + Half (Clover), and 50% sweetness. It observed but did not activate Add to order; no cart, checkout, payment or order occurred. |
| Food selected-state, historical failed smoke | 25.665 s; 0 options; `merchant_changed` | The earlier guarded adapter run failed closed because Potrero was absent. It remains labeled as a historical failed run and is not pooled with the later success. |
| Supabase guards | 4 concurrent submissions → 1 mission; 2 budget-conflicting concurrent approvals → 1 accepted | Idempotency, atomic budget reservation, database overspend rejection, and lane-lease exclusion passed with synthetic data in actual Supabase. This is not a capacity benchmark. |
| Passkey approval | Synthetic replay/concurrency guards passed; the real manager also enrolled a native passkey and approved the exact $0 Luma action | The native approval led to matching provider confirmation. Public-key verification data is stored; biometric data is not. |

**No sustained throughput or scale has been measured.** The 34.0% result is a direct comparison between the concurrent wall window and the summed runtimes of the same three fresh observations; it is not a lanes-per-hour forecast. A separate run produced one provider-confirmed free RSVP for $0, while the food run produced a verified selected recipe and item estimate without a cart. These are functional observations, not paid-merchant throughput or statistical completion rates. Numeric “lanes per hour” extrapolations remain unsupported. Do not add the latest 2.968 s voice round trip, historical 3.042 s voice round trip, 52.971 s food run, 17.330 s prepare/review/approval-guard cycle, or 27.428 s approval-to-confirmation interval: these are separate runs and scopes, and the last includes manager delay.

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

The pitch supported today is: **Cue overlapped three fresh browser workers in a 53.711-second window versus 81.426 seconds of summed lane runtime, a measured 34.0% reduction in waiting versus serial execution for those same observations. It separately produced an editable voice draft through the hosted route in 2.968 seconds, verified one exact $6.60 boba recipe without adding it to a cart, and used a native passkey to authorize and confirm one exact $0 Luma RSVP with matching provider and Inbox evidence. Paid checkout and labor savings remain unproven and require matched trials.**

## Source and independent verification

Primary measured inputs: [fixture](../performance/local-fixture.json), [live research](../performance/local-live.json), [paid research](../performance/local-paid-research.json), [hosted caller](../performance/hosted-baseline.json), [fresh Fiverr](../performance/fiverr-readonly-rehearsal.json), [fresh Luma](../performance/luma-opentogether-readonly-rehearsal.json), [fresh food](../performance/food-boba-readonly-rehearsal.json), [Browserless Amazon](../performance/browserless-amazon-proof.json), [hosted four-lane rehearsal](../performance/hosted-four-lane-browserless-rehearsal.json), [synthetic components](../performance/local-components.json), [event preparation](../performance/free-registration-prepare.json), [historical event resume](../performance/luma-registration-live.json), [hosted event preparation/review/approval-guard cycle](../performance/hosted-luma-passkey-review.json), [native-passkey confirmed event](../performance/native-passkey-live-event.json), [Luma Inbox reconciliation](luma-email-reconciliation.json), [latest hosted voice](../performance/hosted-voice-demo-retest.json), [historical hosted voice](../performance/hosted-voice-proof.json), [latest food selected-state run](../performance/food-demo-retest.json), [Supabase guards](../performance/supabase-guards.json), and [synthetic passkey cloud proof](../performance/passkey-cloud-proof.json).

Independent verifier checked the stated measurements and derived arithmetic against these artifacts. No manual baseline, active-time saving, sustained scale, multi-person collaboration, or paid merchant purchase is measured. One free RSVP is provider-confirmed; it does not establish a rate. No new provider call or product change was made for this report.
