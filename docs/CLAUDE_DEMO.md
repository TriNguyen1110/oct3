# Claude terminal → merchant outcomes

The stage starts with a fresh Claude Code terminal session. Connect oct3, give
one manager request, follow the workers, approve exact commitments, then reveal
the resulting merchant pages. Finish back in Claude with the same mission ID.

This is the target demo. Current verified behavior is research, structured
status, fixture planning and explicit handoffs. Merchant checkout, Fiverr order
submission and ticket booking still need implementation and a real rehearsal.

Latest direction: make the story approachable and target **$0 in real merchant
spending**. One request: “Get my team ready for a local event, under $25.” Show
supplies and freelancer research as two reviewable previews. Aim for one free
event RSVP as the real completed action only after that adapter is implemented
and its exact event/form is verified. A planning budget is not purchase approval.

Use **Request → Review → Approve → Result** as the visible sequence. The memorable
moment is a changed budget invalidating an old approval. The existing six-person
$900 → $650 expo scenario remains a separate, visibly labeled fixture for that
behavior; its prices are illustrative and spend no real money.

Stripe service-fee demonstration uses the sandbox. The verified 50-cent Payments
API probe did not move real funds; it is separate from the still-unrehearsed MPP
flow. Rehearsals should read saved results, not repeatedly start three remote
browsers or new model runs. Prepare one measured browser run, keep its timestamp
visible, and refresh only a selected lane if needed. Browser/model usage can
still cost money or consume credits; $0 refers to merchant purchases.

## Optional paid candidates — outside the default demo

- **Amazon:** one toothpaste tube, aiming below $5 before any delivery/tax.
  An exact available listing and checkout total have not been verified; the
  public Amazon search could not be retrieved. Do not claim a quoted price.
- **Fiverr:** [Isacandersen's Simple Beat](https://www.fiverr.com/isacandersen/make-a-beat-for-you)
  displayed a $5 basic package and one-day delivery on October 3. The final price
  depends on the selected length and checkout fees/tax. Draft brief: a short
  original hip-hop instrumental for the demo; confirm scope and usage rights
  before placing the order. The stage proof is order placement, not immediate
  delivery of a finished beat.
- **Luma:** [Marketing Break on October 8](https://luma.com/ya263roy) lists free
  admission at Dragon Horse in San Francisco, but explicitly requires host
  approval. It is suitable for showing a registration request, not an instant
  confirmed ticket. It remains an alternative while an immediate free RSVP is
  selected. No RSVP has been made. Recheck the event's schedule before booking;
  the title and description expose different start times.

Flights are deferred. The current event adapter supports Eventbrite only.
Prefer a verified free Eventbrite event to avoid adding a provider during the
demo sprint; Luma remains optional and needs an adapter change.

## Event versus room booking

For today's stage, prefer a free event with immediate confirmation and a
short form. If using Luma, [its registration guide](https://help.luma.com/p/event-registration-process)
requires name/email, permits registration without an account, and distinguishes
immediate confirmation from pending approval. This is platform documentation;
oct3's actual browser submission still needs implementation and verification.

An a16z or Tech Week event can use the same Luma flow. Its branding does not
remove approval requirements: [this Tech Week example](https://luma.com/14fq1fa2)
explicitly requires host approval. It can demonstrate a submitted request, but
cannot guarantee a confirmed place during the presentation.

Room booking is a useful later manager workflow, but requires a specific online
reservation system. [San Francisco Public Library study rooms](https://sfpl.org/services/meeting-rooms/study-rooms)
are first-come in person and do not accept reservations, so those rooms do not
fit this browser-booking demo. Other libraries must be checked individually.

## Open the terminal session

Before presenting, configure the agent credential privately in `.env.local` and
start the app. No manager, Surfsky, Stripe or Supabase credential is passed to
the caller session. For the deployed app, set `OCT3_BASE_URL` to its verified
HTTPS origin; otherwise the launcher uses the running local app.

From the oct3 repository with Node 24:

```sh
node --env-file=.env.local scripts/claude-demo.mjs
```

The launcher opens Claude Sonnet 5.5 with medium effort in a temporary caller
directory, connected only to oct3's three MCP tools. It does not edit global
Claude configuration. Use `/mcp` on stage to show the connection, then paste the
manager request. Authentication and account login should already be ready;
the visible setup is the agent connecting to the product.

Read-only preflight, which makes one real Claude call:

```sh
node --env-file=.env.local scripts/claude-demo.mjs --check
```

This only calls `list_missions`; it does not submit work or open merchant
browsers. A successful check proves the Claude Code → MCP connection, not any
merchant action. HTTP configuration and environment substitution follow
[Claude Code's MCP documentation](https://code.claude.com/docs/en/mcp).

## Stage prompt

Fill in the actual event/date and chosen requirements before rehearsal:

> Use oct3 to get my team ready for [EVENT URL] on [DATE], with a planning budget
> of $25. Find useful supplies and an affordable flyer designer, and inspect the
> free event registration. Show me the options and review links; do not purchase
> or send freelancer messages. Submit this as live research with the stable key
> [UNIQUE DEMO KEY]. Keep the mission ID, show me the three workers, and pause
> for manager approval of any commitment. Report real outcomes and blockers.

The public tools remain submit/status/list. The board handles approval; do not
pretend Claude's caller credential can approve spending. The current backend
returns handoffs instead of completed merchant transactions.

## Target sequence — two minutes, subject to measured rehearsal

| Time | Screen | Visible proof |
| --- | --- | --- |
| 0–15 s | Terminal: open Claude, show `/mcp`, enter the request | An ordinary external agent connects to oct3 |
| 15–40 s | Claude submits; board shows the same mission and three workers | A durable handle and observed progress |
| 40–60 s | Board: review options, change the planning budget, show that an old approval is rejected | Code-enforced manager control; fixture labels remain visible where used |
| 60–105 s | Supplies/freelancer preview links; the selected free event flow if verified | Two clearly labeled previews and, only if completed, one actual RSVP confirmation |
| 105–120 s | Return to Claude and request status for the same mission | Structured outcomes with source references and remaining work |

These are presentation targets, not a claim that three merchant transactions
finish in two minutes. Paid supplier orders are outside the default $0 demo.
Use measured rehearsal to decide whether a completed
earlier run appears as a clearly identified replay.

## What counts as a visible result

- **Fiverr:** the selected order page and submitted requirements, with the order
  reference. A drafted brief or shortlisted gig is shown as preparation. Seller
  replies and delivery are not required within the stage window.
- **Amazon:** order confirmation or order history with an actual matching order
  reference. A prepared cart is identified as such. A shipping email is a later
  lifecycle artifact; do not depend on its arrival during the demo or imply an
  earlier shipping email came from the just-submitted order.
- **Event tickets:** confirmation and booked ticket details for the actual
  selected event/date. The public event listing is not evidence of a booking.

Use the same mission and its actual resulting merchant references. Keep private
addresses, payment details and scannable ticket barcodes out of the audience
view. No synthetic receipt, email or DOM change represents merchant completion.

## Build order for this story

1. Verify this real Claude Code → MCP connection.
2. Select the free event/date, required attendee data and two useful supplier previews.
3. Implement the selected free event registration flow with fresh form inspection and
   distinct confirmed, pending-approval and waitlisted outcomes.
4. Use the verified Supabase state store; finish the Stripe MPP sandbox rehearsal.
   Keep its service-fee proof separate from any merchant result.
5. Finish one free RSVP flow. Keep Amazon and Fiverr at reviewable research for
   the default demo; final registration needs its own verified execution adapter.
6. Rehearse the authorized free action once, record references/latencies, then freeze the
   script. Keep current research/hand-off mode as a labeled fallback.

## User handoff links

The caller session is instructed to share the returned dashboard and worker
review/provider-preview links before any commitment, then recorded confirmation
and receipt links after completion. The dashboard opens the precise mission and
worker after manager sign-in. Past missions reopens the saved workspace history.
Missing receipt links remain explicit; current merchant execution is still a
handoff and cannot produce a real receipt yet.
