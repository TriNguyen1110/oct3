# Shared contract — frozen v1

Frozen for parallel implementation at kickoff. Shared TypeScript shapes are in
`src/shared/contracts.ts`. Package versions are pinned in `package.json`.
The ticket URL remains a mission input; live runs require an allowlisted provider
and an actual event URL. Stripe setup and Supabase credentials are pending.

## Boundaries

One authenticated workspace, one manager, one caller agent, USD, three lanes:
`amazon`, `fiverr`, `event_tickets`. Amounts are integer minor units. Deadlines
include timezone. Private connection/profile references replace raw credentials
in task inputs and output.

Backend: `agent/**`, `src/server/**`, `app/api/**`, `supabase/**`.
Browser: `src/browser/**`. Frontend: UI, excluding `app/api/**`.

## HTTP surface

Authenticate every route and scope access to the owning workspace. Caller
service credential and manager approval identity are distinct.

| Route | Meaning |
|---|---|
| POST /api/missions | Validated mission plus Idempotency-Key; MPP challenge if service fee unpaid; verified payment returns durable mission ID and result URL without waiting for browsers |
| GET /api/missions/:id | Mission, tasks, budget, proposals, approvals, evidence, blockers and results |
| PATCH /api/missions/:id/constraints | Manager supplies expected revision and new constraints; conflicts rejected; all unexecuted approvals invalidated and their safe reservations released atomically |
| POST /api/tasks/:id/approve | Manager submits exact proposal ID/revision; ownership, budget and immutable action checked; return Link approval URL/state if required |
| POST /api/tasks/:id/reject | Reject proposal; release only reservations with no ambiguous or confirmed commitment |
| POST /api/tasks/:id/resume | Backend verifies current application and Link approval with the provider, claims the attempt once, and resumes execution; client-supplied payment status is never trusted |

Use MPP library's documented format, not a custom payment challenge. Payment
redemption and mission creation are idempotent: same authenticated key returns
same handle, including after response loss. Result reads and resume incur no
new fee. A payment-setup blocker is explicit; fallback can hand off service
payment to the manager and resume the same job after verification.

Input: objective, currency=USD, purchase_budget_minor, deadline, headcount,
and lane requirements. Amazon: category and private delivery-profile reference.
Fiverr: category, brief, due date. Tickets: provider/event URL, date, quantity,
private attendee-profile reference. No arbitrary websites in this first version.

## Records

| Record | Required concepts |
|---|---|
| Mission | ID, workspace, objective, constraints, revision, state, timestamps, service-payment reference |
| Task | ID, mission, lane, state, active proposal, attempt key, private browser reference, blocker |
| Proposal | Immutable ID/revision, exact action, merchant/source, selected item/gig/event, quantity, private recipient reference, deadline, item/tax/shipping/fees/total, currency, expiry and evidence |
| Approval | Manager identity, proposal/revision, decision/time, Link spend-request reference/state |
| Reservation | Mission/task/proposal, amount, state: reserved/committed/released/uncertain, idempotency reference |
| Evidence | Workspace/task, source URL, observed time, private artifact reference, observation or confirmation, mode: live/test/fixture/replay |
| Service payment | Stripe reference, amount/currency, test/live mode and state; never merchant confirmation |

Mission states: queued, running, awaiting_approval, completed, needs_attention,
failed. Task states: queued, researching, options_ready, prepared,
awaiting_approval, executing, confirmed, needs_human, failed.

Options/prepared checkouts are useful results but are not purchases. Mission
completed means all requested commitments confirmed; otherwise needs_attention
for remaining handoffs even if research is finished. A placed Fiverr order
does not claim seller delivery or completion of the commissioned work.

Response fields: mission_id, revision, status, budget, service_payment, tasks,
evidence, blockers, next_actions. Each task includes lane, precise state,
options/proposal, costs, evidence and observed provider confirmation if any.
Use private/signed artifact access, never public browser credentials.

Budget reports limit_minor, proposed_minor, reserved_minor, committed_minor,
uncertain_minor, available_minor. Uncertain spend consumes budget. Service fee
is separate and disclosed. Proposed amounts do not reserve funds.

## Browser adapter

Expose `researchTask(input)` and `executeApprovedTask(input)` under
`src/browser/`. Each receives a lane, scoped requirements, authorized connection
reference, attempt key, timeout/cancellation and progress callback. Return
structured observations/events for backend persistence.

Research returns at most three grounded options or a typed blocker. It does not
contact freelancers, place orders, buy tickets or consume payment credentials.
Execution receives a server-validated immutable approval/reservation and rechecks
merchant details/total before commitment. Inject credentials through a scoped
server-side path, not model text.

One persistent Surfsky profile per lane/account; bounded retries and runtime.
Ambiguous checkout returns needs_human plus uncertain evidence; reconcile before
retrying. Stop idle compute while preserving authorized persistent sessions.
Progress is action/observation data, not hidden chain-of-thought.

## Invariants

- Atomic database reservation ensures reserved + committed + uncertain <= limit.
  Parallel workers cannot independently spend the same remaining budget.
- Approval binds merchant, item/service/event, quantity, recipient, currency,
  total including fees/shipping, deadline and mission/proposal revision.
  Material changes require fresh review and any required Link approval.
- Constraint revision conflicts with in-flight execution or needs explicit
  resolution. Never silently lower limit below already allocated/uncertain spend.
- Every mission revision invalidates all unexecuted approvals and releases their
  non-uncertain reservations atomically. In-flight, committed and uncertain spend
  remains protected. Backend owns provider-status verification and resume.
- Replan changes only uncommitted work. No automatic refunds/cancellations.
- Submission, approval, payment callback and worker retry are idempotent.
- After uncertain merchant response, retain reservation and reconcile first.
- Service fee, Link authorization, merchant payment, order confirmation and
  delivery are distinct. Evidence determines what can be claimed.

## Acceptance checks

1. External agent submits and retrieves all three lane results; unauthorized
   callers cannot read or approve another workspace.
2. Prices, dates, availability and claims match their own source evidence.
3. Reload preserves state; duplicate submission returns same job.
4. Racing reservations do not overspend; uncertain spend stays held.
5. Stale/modified approvals fail at execution, including direct endpoint calls.
6. Retrying an ambiguous checkout does not submit a duplicate order.
7. Budget revision updates uncommitted choices; infeasibility is explicit;
   confirmed purchases remain visible.
8. Stripe service receipt or Link authorization alone cannot confirm a merchant task.
9. Confirmed tasks have provider evidence/reference; fixture/test/replay/handoff
   states are visibly distinct.
10. Hosted UI renders all lanes, spending and approvals without secret exposure
    or console/request errors on the demonstrated journey.

Measure actual run/replan duration. Use targeted invariant tests and one
complete journey. Record untested merchant paths instead of claiming reliability.
