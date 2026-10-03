# Claude terminal → merchant outcomes

The stage starts with a fresh Claude Code terminal session. Connect oct3, give
one manager request, follow the workers, approve exact commitments, then reveal
the resulting merchant pages. Finish back in Claude with the same mission ID.

Public dashboard: **https://oct3-five.vercel.app**. A real fresh Claude Code
caller has submitted sandbox-paid research and read the same hosted mission.
Fiverr and Luma returned observed options; Amazon returned an explicit HTTP 503
handoff. Separately, one exact $0 Open Together RSVP and one manager-authorized
$7.73 local-Chrome Amazon toothpaste order are confirmed. The Amazon final click
did not run through the deployed Cue mission runner; no Fiverr order was placed.

## Current rehearsal additions

- The optional fourth worker prepares boba pickup near the venue. Use
  `examples/boba-outing.json` with a new idempotency key; preserve the older
  `examples/team-outing.json` request already used for hosted evidence. The latest food smoke failed closed after 25.665 seconds because Potrero was absent; do not present a prepared cart.
- New live approvals require a native passkey. The real manager enrolled on the HTTPS dashboard and used **Confirm with passkey** for the exact $0 Open Together proposal. The OS chooses available biometrics or device verification; Cue stores public-key verification data, never fingerprints. Local ceremonies require `http://localhost:3003`, not `127.0.0.1`.
- Preserve the first failed Luma attempt as historical evidence. A later fresh proposal took 17.330 seconds, native approval was recorded at 21:22:42.703Z, and matching provider confirmation arrived at 21:23:10.131Z. The 27.428-second interval includes the manager delay before **Register now**. Do not register again during rehearsal.
- Saved profile and **Past missions** use Supabase. History preserves each
  mission's mode, evidence and observed receipts. It does not import external
  Amazon, Fiverr or food orders. Past actions never grant future approval.
- Gemini voice controls and the draft-only API are implemented. Actual Gemini
  inference converted 4.842 seconds of synthetic speech into the correct boba
  brief and $10 budget. The separate hosted browser-to-provider round trip passed in 3.042 seconds. Recording produces an editable draft and never submits a mission.
  Browser Use was cancelled; all current browser workers use Surfsky.

Latest direction: make the story approachable and target **$0 in real merchant
spending**. One request: “Get my team ready for a local event, under $25.” Show
supplies and freelancer research as two reviewable previews. Show the saved, confirmed free RSVP as the one real completed action. Do not resubmit it. A planning budget is not purchase approval.

Use **Request → Review → Approve → Result** as the visible sequence. The memorable
moment is a changed budget invalidating an old approval. The existing six-person
$900 → $650 expo scenario remains a separate, visibly labeled fixture for that
behavior; its prices are illustrative and spend no real money.

Stripe service-fee demonstration uses the sandbox. Both the ordinary Payments
API and MPP payment gate are verified: a 50-cent test receipt was saved in
Supabase and replayed without another charge. The later hosted rehearsal combined a fresh Claude Code caller, the real MPP
verifier, Eve dispatch, Surfsky research and Supabase persistence. See
[hosted evidence](../reports/performance/hosted-claude-paid-research.json).
Rehearsals should read saved results, not repeatedly start three remote
browsers or new model runs. Prepare one measured browser run, keep its timestamp
visible, and refresh only a selected lane if needed. Browser/model usage can
still cost money or consume credits; $0 refers to merchant purchases.

## Merchant candidates and completed proof

- **Amazon:** one Colgate toothpaste tube was observed at $3.99. In the authorized
  signed-in local profile, Amazon showed $2.99 shipping and $0.75 tax for a $7.73
  total. The manager approved that exact total; one submission opened Amazon's
  thank-you page and a matching confirmation email arrived. Present this as
  separate local-browser execution evidence, not as a deployed Cue-worker order
  or a Link-funded purchase.
- **Fiverr:** [Isacandersen's Simple Beat](https://www.fiverr.com/isacandersen/make-a-beat-for-you)
  displayed a $5 basic package and one-day delivery on October 3. The final price
  depends on the selected length and checkout fees/tax. Draft brief: a short
  original hip-hop instrumental for the demo; confirm scope and usage rights
  before placing the order. The stage proof is order placement, not immediate
  delivery of a finished beat.
- **Selected free event:** [Open Together: AI Builders Unite](https://luma.com/OpenTogether),
  October 16, 18:00–midnight PDT. Public inspection found one free Standard ticket
  and a name/email form without a host-approval or waitlist gate. Availability
  must be rechecked immediately before submission. The user selected this event
  and the actual $0 RSVP now has matching provider confirmation. Optional HF username stayed blank. Do not resubmit it. Private attendee details come from Supabase, not this document.

Flights are deferred. Read-only research supports Eventbrite and Luma. The new
free execution adapter is limited to the exact selected OpenTogether event;
other Luma events and general merchant writes remain unsupported.

## Event versus room booking

For today's stage, prefer a free event with immediate confirmation and a
short form. If using Luma, [its registration guide](https://help.luma.com/p/event-registration-process)
requires name/email, permits registration without an account, and distinguishes
immediate confirmation from pending approval. This is platform documentation;
Cue now has one verified exact Open Together submission and confirmation; this does not generalize to other Luma events.

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
OCT3_BASE_URL=https://oct3-five.vercel.app npm run claude:check
```

This only calls `list_missions`; it does not submit work or open merchant
browsers. A successful check proves the Claude Code → MCP connection, not any
merchant action. HTTP configuration and environment substitution follow
[Claude Code's MCP documentation](https://code.claude.com/docs/en/mcp).

The repeatable final stage beat reads exactly one saved mission through Claude
Code and cannot start work:

```sh
OCT3_BASE_URL=https://oct3-five.vercel.app npm run claude:status -- 421d6be5-462d-4848-bd7a-223cf3dd6cd4
```

This calls `mission_status` once and verifies that Claude used the supplied ID.
It reports only whether the exact tool call passed; use the interactive launcher
when the audience should see Claude's formatted answer and links.

One scripted, live research rehearsal (uses model/browser credits and a sandbox
service payment, but never commits a merchant action):

```sh
OCT3_BASE_URL=https://oct3-five.vercel.app node --env-file=.env.local scripts/claude-demo.mjs --rehearse examples/team-outing.json --key cue-stage-outing-001
```

Keep the same input/key when retrying; use status for the returned mission.
The real hosted rehearsal cost $0.11198925 for the caller model. That excludes
worker model and browser usage. Once prepared, reuse saved results on stage.

## Stage prompt

Fill in the actual event/date and chosen requirements before rehearsal:

> Use oct3 to get my team ready for [EVENT URL] on [DATE], with a planning budget
> of $25. Find useful supplies and an affordable flyer designer, and inspect the
> free event registration. Show me the options and review links; do not purchase
> or send freelancer messages. Submit this as live research with the stable key
> [UNIQUE DEMO KEY]. Keep the mission ID, show me the three workers, and pause
> for manager approval of any commitment. Report real outcomes and blockers.

The public tools remain submit/status/list. The board handles approval; do not
pretend Claude's caller credential can approve spending. Deployed Amazon/Fiverr
execution remains a handoff. The narrow free-event flow was reviewed,
passkey-approved and confirmed once; status reads must not resubmit it.

## Target sequence — two minutes, subject to measured rehearsal

Begin on the Cue **cinematic portrait** home screen before moving to the terminal and saved mission.

| Time | Screen | Visible proof |
| --- | --- | --- |
| 0–15 s | Terminal: open Claude, show `/mcp`, enter the request | An ordinary external agent connects to oct3 |
| 15–40 s | Claude submits; board shows the same mission and three workers | A durable handle and observed progress |
| 40–60 s | Board: review options, change the planning budget, show that an old approval is rejected | Code-enforced manager control; fixture labels remain visible where used |
| 60–105 s | Supplies/freelancer preview links and the saved selected-event confirmation | Two clearly labeled previews and one actual $0 RSVP confirmation |
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
3. Show the saved exact Open Together proposal, native passkey approval and matching provider confirmation; do not submit it again.
4. Use the verified Supabase state store and MPP sandbox payment gate; rehearse
   the combined caller-payment-browser sequence.
   Keep its service-fee proof separate from any merchant result.
5. Reuse the confirmed free RSVP and separate Amazon local-browser evidence. Keep
   the deployed Amazon/Fiverr workers at reviewable research for the default demo.
6. Rehearse status reads of the saved confirmed action without resubmitting it. Keep current research/hand-off mode as a labeled fallback.

## User handoff links

The caller session is instructed to share the returned dashboard and worker
review/provider-preview links before any commitment, then recorded confirmation
and receipt links after completion. The dashboard opens the precise mission and
worker after manager sign-in. Past missions reopens the saved workspace history.
The confirmed free event has matching provider evidence but no captured receipt
URL. The deployed Amazon and Fiverr workers remain handoffs; the separate Amazon
local-browser order has matching provider confirmation.
