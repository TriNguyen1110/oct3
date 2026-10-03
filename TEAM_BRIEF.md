# Team brief — Make Something Agents Want

Every coordinator, builder and verifier reads this before taking work.
**11:00–17:00 PDT: six hours. Feature freeze: 16:00.**
See `HACKATHON.md` for schedule, gates and fallback rules.

## Theme and product

Product: **Cue — Your agent’s extra hands.** Repository and technical identifiers
remain `oct3`. Use Cue in the site, pitch and audience-facing materials.

**Make Something Agents Want** is the user-confirmed hackathon theme.

Lead with capabilities: **Hiring, Logistics, Food & supplies, and Travel**.
Use provider names as secondary labels and in concrete evidence. Today’s three
worker lanes remain Fiverr services, Amazon supplies, and event tickets.
Food & supplies is explicitly **coming next**; DoorDash is not implemented.
Travel currently means event/ticket research, not flight booking. The broader
vision must not imply extra integrations or completed merchant transactions.

We build browser workers other agents hire for these jobs. A caller agent submits a mission and receives structured
outcomes. Managers control spending and commitments. Surfsky runs concurrent
browsers, Claude/Eve coordinates them, Supabase stores shared state, Vercel hosts
the app, and Stripe handles service fees and purchase flows separately.

The demo starts with an external agent calling us and ends with that agent
receiving usable results and evidence. A manager dashboard alone is insufficient.

## Four judging criteria

No weights have been supplied.

| Criterion | Evidence we must show |
|---|---|
| Innovation / originality | Three workers coordinate budget/deadline; a revision updates uncommitted plans; another agent can pay for our service |
| Design | Legible mission board, meaningful progress, exact approval cards, spending totals and understandable handoffs |
| Functionality | Actual browser paths, persisted results, authenticated approvals, verified payment evidence, no duplicates or false success |
| Impact | A recurring office-manager task and measured reduction in active coordination; no invented savings |

## Prizes and voting categories

The organizer advertises **100K+ in shared participant credits** from Supabase,
Claude, Stripe and Vercel, plus a **separate 31K credits winner pool**. These are
credits, not cash; no per-team amount is established. The top six teams demo live.
[Organizer listing](https://luma.com/select-2026-hackathon)

Categories from the user's event excerpt:

- **Best Use of Vercel:** actual hosted Eve application and execution.
- **Best Use of Claude:** planning, comparison, coordination and exception handling.
- **Functionality and Completeness:** a complete caller-to-result journey.
- **Innovation and Creativity:** coordinated, agent-consumable browser work.
- **User Experience and Design:** a manager understands and approves the plan.
- **Impact and Usefulness:** recognizable buyer and demonstrated coordination benefit.
- **Best Use of Stripe:** verified service payment and approved purchase flow;
  keep their receipts and states separate.
- **Best Use of Codex:** document actual implementation and independent verification.
- **Best Use of Multimodal AI for Gemini:** stretch only after the core works;
  do not claim implementation or eligibility just for mentioning Gemini.

Use Supabase meaningfully for missions, budget, approvals, evidence, results and
access boundaries. Its use is required in the
[published rules](https://hackathon.supabase.com/hackathon-rules).
Category-specific payouts and eligibility rules are not yet established.

## Stage story

Latest user direction: approachable, inexpensive, easy to demo. Open Claude Code
in the terminal and connect oct3 live. Target **$0 real merchant spending**:
supplies and freelancer previews, one verified free event RSVP if implemented,
and Stripe sandbox payment. Use one coherent “get my team ready for a local
event under $25” planning request. Review, change budget, invalidate old approval,
then return evidence. Rehearsals reuse saved research to reduce browser/model
usage. See [the stage runbook](docs/CLAUDE_DEMO.md). Free RSVP completion remains
an implementation target; Eventbrite is the existing adapter. Flights deferred.

The earlier expo scenario remains the labeled budget-revision fixture:

“Prepare six people for an expo: Amazon supplies, a Fiverr flyer designer and six
event passes. Purchase budget $900.” Three workers propose a plan. Before
commitments, lower the budget to $650 and keep six passes. Show revised
tradeoffs, exact approvals, a verified payment flow and the caller's results.

If no plan fits, say so. A Fiverr shortlist is not a hire; a cart is not an order;
authorization is not a booking. Capture provider evidence before claiming
completion. Label fixtures, replays and test transactions. Preserve the last hour
for verification, rehearsal and submission.

## Latest product commitments

Give the caller a dashboard link and each worker’s review/provider-preview link
before ordering. Return observed confirmation and merchant receipt links after
completion; missing evidence stays explicit. Local receipt presentation is wired,
but live merchant execution/receipt capture is still unfinished.

The site now exposes saved mission history through the existing authenticated
workspace store. Once Supabase credentials and schema are ready, the same view
reads cloud history. Stretch only: manager-editable saved preferences (usual
budgets, preferred vendors, private delivery reference), then explicit import of
past merchant data. Do not infer standing purchase approval from preferences.
