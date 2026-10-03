# Sponsor use and evidence

Snapshot: October 3, 2026, hosted baseline `21377a8`. Public demo:
**https://oct3-five.vercel.app**. An installed package or configured key is not
integration proof; the free-registration changes have separate verification.
Theme: **Make Something Agents Want**. Agents submit work through the CLI or MCP,
then retrieve structured results; a manager controls commitments.

| Tool | What it enables in oct3 | Current evidence and status | Judge demonstration / remaining step |
|---|---|---|---|
| **Supabase** | Shared missions, options, approvals, reservations, evidence and browser leases; Past missions reads the same workspace store. Version checks update missions atomically; SQL rejects allocated spending above budget. | **Cloud persistence and concurrency verified.** Migration applied; API save/reload plus independent database read passed. Four simultaneous submissions produced one row; two competing approvals produced one hold and one budget rejection; the SQL constraint rejected overspend and the browser lease was exclusive. [Persistence evidence](../reports/performance/supabase-connection.json), [cloud guard evidence](../reports/performance/supabase-guards.json). All test data was labeled fixture; no merchant action occurred. | Reopen the saved mission and explain shared-budget enforcement. The saved manager profile also round-tripped through Supabase and an independent database read. It supplies attendee defaults, never standing approval. These tests validate cloud state handling, not completed merchant purchases. |
| **Vercel / Eve** | Next.js UI/API and a durable Claude session that dispatches three browser workers. CLI and MCP share the same mission API. | **Hosted paid research verified.** [Hosted dashboard, authenticated API and Eve health checks](../reports/performance/hosted-baseline.json); [fresh caller and worker outcomes](../reports/performance/hosted-claude-paid-research.json). [Next integration](../next.config.ts), [Eve dispatch](../src/server/dispatch.ts), [Eve agent](../agent/agent.ts), [MCP endpoint](../app/api/mcp/route.ts). The deployed caller-to-research journey ran successfully; completed merchant checkout is not claimed. | Show the deployed URL, the same mission in Claude and the board, and persisted worker results. Hosted restart/recovery after infrastructure failure has not been tested. |
| **Claude** | Coordinates the mission and ranks observed merchant candidates for relevance. Ranking selects existing observation indices; it cannot create a new price or URL. | **Fresh hosted caller and worker coordination verified.** Claude Code Sonnet 5.5 called `submit_mission` once with sandbox payment and `mission_status` once; exact input was preserved. The caller cost $0.11198925. [Caller evidence](../reports/performance/hosted-baseline.json). **Live model call and ranking also verified.** `claude-sonnet-5-5` responded through the Anthropic AI SDK. A separate rank check took **1.3 s**, selected two relevant flyer gigs and excluded a food-menu gig. [Ranking implementation](../src/browser/rank.ts), [probe notes](../src/browser/README.md). A full local Claude/Eve mission returned its handle in **575 ms** and all three lane outcomes in **21.036 s**; see [live benchmark](../reports/performance/local-live.json). The latest Claude component-tool run on a **local synthetic Chrome form** took **20.654 s**: four supplied values were retained, a conditional field was discovered, ten tool calls were made, and submission count was zero; see [recorded sequence](../reports/performance/local-components.json). This is form preparation evidence, not merchant filling or checkout. The merchant probes use remote Surfsky browsers; “no local Chromium” applies to those probes, not this local fixture. | Show relevant options alongside their observed prices/source evidence. If ranking falls back, its reason label must say so. The deterministic fixture budget planner is not a Claude result. |
| **Stripe** | A $0.50 service fee through MPP; separate Link Agent Wallet approval for merchant spending. | **MPP sandbox payment gate verified against Stripe and Supabase.** Willder's test key and Business Profile match. The real MPP client obtained a sandbox SPT, answered Cue's 402 challenge, and produced a succeeded 50-cent PaymentIntent with a verified receipt persisted in Supabase. Replaying the saved proof made zero additional payment calls. [MPP evidence](../reports/performance/stripe-mpp-sandbox.json), [ordinary Payments API probe](../reports/performance/stripe-willder-sandbox.json). No real funds, browser workers, model calls or merchant actions were used in this gate test. | The later [hosted rehearsal](../reports/performance/hosted-claude-paid-research.json) combined actual sandbox payment with Eve/Claude and Surfsky workers. Show its verified receipt, explicitly labeled test mode. Link merchant spending is not connected; a service fee never proves a merchant order. |
| **Codex** | Built the new repository, split implementation by ownership, and supplied an independent verifier. | **Used during development.** [Team contract](../AGENTS.md), [model routing and settings](../MODEL_ROUTING.md), [append-only board](../BOARD.tsv), [browser tests](../tests/browser.test.ts), [source history](https://github.com/TriNguyen1110/oct3/commits/main/). Independent retry-policy and component-tool verification passed **30 leaf checks (33 including 3 parent checks) in 3.74 s**; see [verifier report](../reports/verification/research-components-local.md). | Show concrete source changes and the verifier's final report. Keep implementation and independent verification contributions separate; do not claim tests or audits that have not passed. |
| **Surfsky** | Three persistent remote browser profiles with concurrent runs, browser observations and bounded cleanup. Playwright connects over CDP; no local Chromium is used. | **Hosted live read-only research verified.** Latest paid mission returned Fiverr 3 options and the selected Luma OpenTogether event; Amazon returned HTTP 503. [Hosted results](../reports/performance/hosted-claude-paid-research.json). Earlier probes: Fiverr produced three observed starting-price options; Eventbrite exposed a specific example event/date/minimum price; Amazon initially returned HTTP 503; the integrated run reached the page but found no supported priced cards, which remained an explicit handoff. All sessions from those probe batches stopped. [Adapter](../src/browser/surfsky.ts), [worker entry point](../src/browser/index.ts), [measurements](../src/browser/README.md). | Show the three independent outcomes, including Amazon's blocker. Verify the user's selected event and exact checkout before claiming bookability. There is no proven final merchant checkout. |

Supabase currently uses server-only service-role access. The migration enables
RLS and revokes anonymous/authenticated direct table grants; the application
scopes each operation to its single authenticated demo workspace. It does **not**
implement Supabase Auth, Realtime, Storage or Vector. Hosted operation refuses the
local JSON fallback. These boundaries are visible in the [auth](../src/server/auth.ts)
and [store](../src/server/store.ts) implementations.

Supabase also offers [Queues](https://supabase.com/docs/guides/queues), durable
Postgres messages built on pgmq, and [Cron](https://supabase.com/docs/guides/cron),
scheduled jobs built on pg_cron. Planned extensions are queued browser work and
scheduled checks for stalled runs. Neither extension is enabled or used by this
demo. Queue delivery alone would not make merchant purchases exactly once;
approval, reservation, idempotency and reconciliation checks remain necessary.

[Browser Use](https://browser-use.com/) is listed in
[Stripe's Link Agent Wallet integrations](https://github.com/stripe/link-cli#where-to-use-link-agent-wallet).
It is a potential browser execution integration; Cue currently uses Surfsky.
Changing that provider must preserve the same server-enforced approval and budget
checks. Browser Use is not part of our current implementation evidence.

The [CLI](../cli/oct3.mjs) exposes **submit / status / list**. The MCP endpoint
exposes **submit_mission / mission_status / list_missions**. Neither exposes
manager approval or checkout as an agent tool. Both reuse the same authenticated
API and stable submission key.

## Evidence labels and judging

| Criterion | Concrete evidence to show | Current limitation |
|---|---|---|
| Innovation / originality | Another agent requests coordinated work and receives reusable structured results; the shared budget constrains all three lanes. | The real merchant commitment path is unfinished. |
| Design | Three clear worker states, source evidence, budget totals and understandable handoffs. | A browser screenshot alone does not prove execution. |
| Functionality | Idempotent submit, cloud persistence and atomic budget, exact approval checks, provider-verified MPP sandbox receipt, independent test results and observed merchant outcomes. | Hosted caller-payment-research is verified. Actual final merchant execution remains unverified. |
| Impact | A recognizable manager task spanning supplies, freelance services and event tickets. | User demand, time saved and willingness to pay have not been measured. |

Voting categories: Best Use of Vercel; Best Use of Claude; Functionality and
Completeness; Innovation and Creativity; User Experience and Design; Impact and
Usefulness; Best Use of Stripe; Best Use of Codex; Best Use of Multimodal AI for
Gemini. **Gemini is unused** and is not part of the current submission claims.
The organizer advertises **100K+ shared participant credits** and a separate
**31K winner credits pool**, not cash or guaranteed per-team awards. See the
[team brief](../TEAM_BRIEF.md) and [organizer listing](https://luma.com/select-2026-hackathon).

## Primary references

- Supabase: [RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security).
- Vercel: [Eve](https://vercel.com/eve); the installed `eve` package's Next.js,
  authentication and deployment guides were read before implementation.
- Claude integration: [AI SDK generateText](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text).
- Stripe: [MPP](https://docs.stripe.com/payments/machine/mpp) and
  [Link purchases](https://docs.stripe.com/agentic-commerce/agents/link-agent-wallet/use-link-wallet-pay-online).
- Surfsky: [sessions](https://docs.surfsky.io/sessions),
  [Playwright](https://docs.surfsky.io/quickstart/playwright),
  [proxies](https://docs.surfsky.io/proxies).

For each newly verified integration, record the source commit, timestamp, mode,
mission ID, result/receipt reference and measured duration. Keep credentials,
browser access URLs and personal payment information out of this document.
