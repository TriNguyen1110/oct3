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
| POST /api/tasks/:id/retry-research | Manager retries read-only research for this existing task and current revision; acquire its lane lease, preserve mission identity and existing commitments; do not submit another paid mission |

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

## Agent interfaces — simplified kickoff slice

The CLI and authenticated HTTP MCP endpoint wrap the same mission API.
Only three operations: submit a mission with an idempotency key, read its status
and results, and list missions in the caller workspace. They share persistence,
budget accounting and authorization; they do not implement a second scheduler.
Manager approval stays in the dashboard. No public signup/OAuth onboarding or
additional workflow builder is included. Browser Assist is deferred by the user.

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

## Additive result links — user-requested after kickoff

API, CLI, MCP and Eve results include absolute `dashboard_url` and `result_url`.
Each task has `links.review_url` (mission/task/current revision), `preview_url`,
`preview_kind`, `confirmation_url`, `receipt_url`, and `receipt_state`.
Review links open the exact persisted mission after manager sign-in. A stale
revision link shows the current revision with a visible notice; it never approves
anything. Links contain no caller/manager credential. Reads remain authenticated.

`provider_page` is a research/source page, not a prepared checkout. An observed
`checkout_preview` must bind to the exact task, proposal and revision. Merchant
confirmation/receipt links additionally require confirmed task status, a matching
provider confirmation reference, live mission/evidence, and a supported provider
URL. Browser-session links and unknown query credentials are excluded. Evidence
kinds are authored by the provider adapter, never accepted from caller input.

A receipt is not generated from a proposal or a Stripe service payment. Unavailable
URLs are null. `receipt_state` is `not_ready`, `available`, `not_captured`, or
`example`; fixtures, tests and replays cannot produce real merchant receipt links.
Current merchant execution remains a handoff, so no live receipt capture is claimed.

The dashboard can reopen the latest 20 workspace-owned missions from existing
storage. Supabase provides the same history once configured and migrated. External
merchant-history imports and saved preferences are separate stretch work.

## Demo completion slice — October 3, 12:45 PDT

Preserve production MPP challenge behavior. Add an explicitly enabled sandbox
payer for rehearsals only: `OCT3_TEST_PAYMENT_ENABLED=true`, `sk_test_` key and
`profile_test_` profile are all required. It uses Stripe's test payment method,
passes the generated credential through the existing real MPP verifier, persists
the bound proof, then dispatches the existing mission exactly once. Never set
paid state from a caller's assertion. No test credential appears in model output.

- `POST /api/missions/:id/service-payment`, authenticated and workspace-scoped,
  accepts exactly `{ "mode": "test" }`. Returns the presented MissionView with
  verified service receipt after payment and dispatch. Replays reuse stored proof.
- Mission submission may explicitly request this behavior with
  `X-Cue-Test-Payment: authorized`; absent that header the normal 402 remains.
  MCP's existing `submit_mission` gains optional `pay_test_service_fee: boolean`
  and the CLI gains `--pay-test`. Both set that header only on explicit opt-in.
- A 402/503 creation response must retain the saved mission and its dashboard
  link in the UI. The board offers “Pay $0.50 in test mode & start” for an unpaid
  live mission. It must label this as a developer-supplied sandbox payment, not
  an autonomous real wallet or merchant checkout.

The next merchant slice is one exact free event registration, pending the user's
event/attendee selection. General remote component mutation stays disabled.
Do not convert research estimates into exact checkout proposals or claim real
registration from fixture data. Amazon/Fiverr commitments still require chosen
destinations, verified checkout totals and separate authorization.

User-authorized saved profile: authenticated `GET /api/preferences` returns the
current workspace's `{profile_ref: "manager", preferences, updated_at, storage}`.
Manager-only `PUT /api/preferences` stores exactly name, email, company and role
in Supabase `oct3_preferences`; agents may read but cannot change it. A profile
supplies form defaults and is never a standing approval to spend or register.
The attendee reference `manager` resolves to this profile only when preparing
the user-selected event action. Personal values belong in the private database,
not committed fixtures or public evidence reports.

## One free registration — frozen narrow execution contract

Only `https://luma.com/OpenTogether`, one free ticket, and the saved `manager`
profile are eligible in this slice. This does not enable generic browser writes.
Browser interface types are in `src/shared/registration.ts`; browser owns
`src/browser/luma-registration.ts` exports `prepareFreeRegistration` and
`executeFreeRegistration`. Preparation is read-only, including opening the
blank registration dialog. Execution receives only a server-validated immutable
snapshot/attendee/approval/reservation/attempt and rechecks the exact free event.

- Manager-only `POST /api/tasks/:id/prepare-registration` accepts exactly
  `{expected_revision}` and returns the presented MissionView. It requires a
  paid live event task, quantity one, current saved profile and the exact source.
  Creates an expiring zero-total proposal with `action_type: free_registration`
  and an `action_hash` binding the entire private snapshot and attendee. Private
  prepared data stays out of MissionView; the review shows the event and saved
  profile before approval. Profile changes invalidate execution.
- Existing approval/resume endpoints remain the only execution path. An exact
  zero-total free-registration approval requires no Link payment. All existing
  manager, hash, revision, reservation, expiry and protected-commitment guards
  still apply. Claim once before external work; never retry an uncertain submit.
- Browser execution allows at most one validated POST to the observed Luma
  registration endpoint, bound to event, ticket, count one, approved name/email,
  zero amount/tax and no payment method. Block other remote mutations. Confirm
  only an actual approved provider response with matching ticket reference.
  Waitlist/pending/response loss stays unconfirmed and protected from replay.
- Luma ticket/proxy query keys are private access credentials. Do not emit them
  as public links. An actual confirmation may retain its provider reference and
  public event source; receipt URL remains null if no safe receipt was observed.

Implementation/tests do not authorize an actual RSVP. The user requested a
review link before commitment; prepare that concrete result before asking them
to approve the final registration.
