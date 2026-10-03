# Surfsky marketplace workers

`researchTask` uses separate persistent `oct3-amazon`, `oct3-fiverr` and
`oct3-event_tickets` profiles, connects Playwright over remote CDP and stops the
exact session in `finally`. It never launches local Chromium. Credentials and
browser access URLs remain server-side. Pages cannot issue agent instructions.

`SURFSKY_API_KEY` (or `SURFSKY_API_TOKEN`) and the account-assigned
`SURFSKY_API_BASE_URL` are required. `SURFSKY_PROXY_COUNTRY=us` selects the shared
US pool for this demo; no upgrade or premium pool is enabled. Profile lookup
refuses existing running or duplicate oct3 profiles. The backend must hold a
cross-instance lane lease; the in-process lock alone is not a distributed lock.

Amazon reads search-result cards; Fiverr reads visible gig-card starting prices;
Eventbrite and Luma read the selected event's JSON-LD offers. Luma accepts exact
`luma.com/<event-slug>` and `lu.ma/<event-slug>` pages; discovery calendars such
as `/sf` are rejected, and all event URL query parameters are removed. Options have source links,
observed timestamps and raw observation summaries. At most three survive.
Claude Sonnet 5.5 ranks existing candidates for relevance; only observed indices
can be selected, so model text cannot fabricate a price or URL. Model failure
falls back to the lowest observed prices, with a different reason label.

All displayed prices are estimates until checkout. Event quantity is requested
quantity, not verified group inventory. AggregateOffer prices are identified as
listed minima. A Luma event is free only when its offer explicitly states a zero
USD price; a missing price is not treated as free. Approval-required, direct
registration and waitlist text are recorded as observed page state. Research
evidence is marked `readOnly=true` in its detail and as an observation; it never
claims that a registration request or RSVP was submitted or confirmed. Fiverr
sourcing is not a hire. No hidden fees are assumed zero.

## Public Luma shortlist on October 3, 2026

Public, read-only browsing of `https://luma.com/sf` and the exact event pages
found these candidates. No account was used and no form was submitted.

| Event | Date | Observed qualification | Direct source |
|---|---|---|---|
| Marketing Break: A 3PM Networking Event for Marketers #SFTechWeek | Oct 8, 2026, 2:30–4:30 PM PDT | JSON-LD offer is USD 0 and InStock; page says Approval Required / Request to Join, so acceptance is not immediate | https://luma.com/ya263roy |
| AI & The Future of Marketing — SF Tech Week Meetup | Oct 9, 2026, 7:00–9:00 PM PDT | Page explicitly says Admission: Free and Approval Required / Request to Join | https://luma.com/vv59zi0w |
| Open Together: AI Builders Unite | Oct 16, 2026, 6:00 PM PDT | Page says free for everyone and currently shows Register without an approval label; availability can change and no RSVP was attempted | https://luma.com/OpenTogether |

`executeApprovedTask` requires the expected unexpired approval and reservation,
then revisits the selected merchant. It currently returns `needs_human` with a
checkout handoff. No supported final merchant checkout is verified, no payment
credentials are consumed and no commitment is submitted. Backend must not turn
that response or Link approval into a confirmed order.

## Live checks on October 3, 2026

Read-only probes used oct3-owned profiles. No marketplace account was logged in,
no messages were sent, and no carts/orders/bookings were submitted.

| Probe | Result | Wall time including cleanup |
|---|---|---:|
| Default pool, Amazon expo supplies search | HTTP 503 | 11.9 s |
| Default pool, Fiverr flyer search | Connection closed | 27.8 s |
| Default pool, Eventbrite SF business page | HTTP 200 and event listings | 18.1 s |
| Shared US, Amazon brochure holders | HTTP 503 | 7.2 s |
| Shared US, Fiverr flyer search | Three grounded starting-price options: $5, $10, $10 | 15.4 s |
| Shared US, Eventbrite Oct 7 mixer example | Event/date and listed minimum price observed; group inventory unverified | 13.6 s |

The three probes were concurrent. All owned sessions stopped, with zero active
sessions after each batch. The account reported 15 available concurrency slots.
The Eventbrite example was a connectivity/extraction probe, not the user's
selected event: `https://www.eventbrite.com/e/professional-business-networking-mixer-at-intercontinental-sf-oct-7-2026-tickets-1999055294198`.

A bounded Amazon follow-up at 18:20 UTC used the same US shared pool and
`booth supplies` query. The diagnostic returned HTTP 200 but displayed Amazon's
"Sorry! Something went wrong!" page: empty body, zero search cards and no prices
(14.5 seconds). This is a merchant error page, not an extraction-layout failure.
The adapter now classifies that exact error title as `provider_error`. One live
verification returned HTTP 503 in 5.6 seconds; cleanup was confirmed and active
sessions returned to zero. No further retries were attempted. Nine browser tests
and two focused error-page classification assertions passed. The SoldOut fix is
preserved. No product prices were invented to fill the Amazon lane.

A separate Claude rank check took 1.3 seconds, selected two general flyer gigs
from the observed candidates, and excluded an irrelevant food-menu gig. Seven
narrow assertions covered missing event, URL boundaries and invalid approval
expiry. Independent verification is still required.

## Runtime form components and internal agent tools

`createComponentTools(page, policy)` exposes four AI SDK tools on the **same live
page**: `inspect_task_page`, `plan_task_fields`, `fill_task_component`, and
`verify_prepared_task`. Public MCP remains separate; these are worker internals.
There is no submit, purchase, message-send or arbitrary-click tool.

Discovery reads the current native text, select, radio and checkbox controls.
Snapshots contain IDs, labels, kinds, required flags, observed option labels and
`hasValue`, never current values. Password, payment, hidden, file and submit
controls are excluded; consent is excluded unless trusted server policy allows
it. Custom comboboxes, frames and arbitrary widgets remain unsupported.

Preparation requires explicit `readOnly: false`, a trusted origin and an exact
field allowlist; omitted policy remains read-only. The agent plans
explicit values against observed IDs or exact labels. Missing, ambiguous and
policy-blocked fields are separate outcomes. Filling rechecks the snapshot,
label, native type, visibility and enabled state. It sets the desired state and
reads it back; a repeated correct checkbox value does not toggle it. Text that
exceeds the native limit is rejected rather than silently truncated.

After mutation, discovery runs again. A changed layout invalidates the plan and
requires a new snapshot; at most three layouts and 32 mutations are allowed per
worker closure. Each operation is bounded to eight seconds or less within the
existing 90-second worker budget. A timeout may get one preparatory retry only
after unchanged-layout readback proves the desired value was not retained.
A response loss after successful mutation is recovered by readback without a
second action. A hard operation timeout closes the page to stop late actions.

Research now performs read-only component inspection and returns optional
`inspection` diagnostics with evidence counts. Successful searches do not add a
model turn. Filling is verified on local synthetic fixtures, not live merchant
forms; `checkout_ready` and `purchase_confirmed` remain false.

Local Chrome fixture checks covered dynamic required fields, replanning, stale
snapshots, duplicate labels, sensitive-field exclusion, text/select/radio/checkbox
readback, idempotence, one safe retry, response-loss recovery and timeout closure.
No merchant was contacted by those fixtures and no form was submitted.

`verifyLaneStopped(lane)` separately reconciles the exact existing saved oct3
profile with read-only provider requests. Absence, duplicates, running/unknown
state or lookup failure cannot release an uncertain lane. It returns no private
profile identifiers or connection URLs.

The decomposition adapts architecture from the user's existing `job_search`:
`form-components.mjs:53` (discovery), `:106` (verified component action), `:181`
(explicit answer planning), `:273` (bounded rediscovery); `form-dropdown.mjs:31`
(owned-control scoping); and `application-attempt.mjs:2` (preserve uncertain
commitment state). No candidate data, ATS aliases, account rules or receipts were
copied. These component tools are an authored oct3 adaptation, not a universal
form engine or a claim of completed marketplace checkout.

## Official references

- https://docs.surfsky.io/quickstart
- https://docs.surfsky.io/sessions
- https://docs.surfsky.io/api-reference
- https://docs.surfsky.io/quickstart/playwright
- https://docs.surfsky.io/proxies
- https://docs.surfsky.io/screencast
- https://docs.surfsky.io/debugging
- https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text
