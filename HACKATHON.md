# Agent browser workers — six-hour hackathon scope

Updated October 3, 2026. Kickoff authorized at 11:00 PDT; coding is active.
Repository: `oct3`, an independent Git repository at
`/Users/tringuyen/Developer/.worktrees/oct3`. All product code belongs here.
The original hacker-kit remains a reusable preparation template.

## Team: read this first

**Theme: Make Something Agents Want**, as confirmed by the user.
**Criteria: Innovation/originality, Design, Functionality, Impact.**
No scoring weights have been supplied.

Every builder and verifier reads `TEAM_BRIEF.md` (in this kit:
`profiles/agent-workers/TEAM_BRIEF.md`). It contains the theme, criteria, prizes,
and all voting categories.

Pitch: **Browser workers your agent can hire to buy supplies, source freelance
services, and book event tickets—with approvals and verifiable results.**

Agents submit structured work, pay for a run, and retrieve results. Managers set
constraints, choose freelancers, and approve commitments. Our hypothesis is that
operators will pay for dependable execution; demand and savings are unvalidated.

## One mission, three lanes

“Prepare our six-person team for next week's expo. Find booth supplies on Amazon,
find a Fiverr designer for our flyer, and get six event passes. Purchase budget:
$900.”

Select the actual event/date at kickoff. This is a demo scenario, not a purchasing
instruction. USD only; disclose the service fee separately from merchant spend.

| Lane | Fixed first scope | Honest outcomes |
|---|---|---|
| Amazon | One supplies category, one delivery location, existing account, at most three options | Options, prepared cart, or confirmed order |
| Fiverr | One flyer-design category, at most three gigs, concrete brief and delivery deadline | Options, drafted brief, prepared order, or placed service order; sourcing is not hiring or delivery |
| Event tickets | One provider, one event/date, one ticket type, six attendees | Options, prepared checkout, or confirmed booking |

Keep all three lanes. A blocked destination produces an explicit manager handoff
with evidence and a remaining action. Flights/trains are out of scope.

## Schedule — October 3, 11:00–17:00 PDT

| Time | Work | Exit condition |
|---|---|---|
| 11:00–11:15 | Bootstrap new repo; agree on contract, destinations, accounts and ownership | All builders report the same new root and pass the guard |
| 11:15–12:00 | Prove Surfsky sessions/concurrency and selected site flows; backend probes Supabase and Stripe; frontend starts fixtures | Each lane records actual access, latency, prerequisites and handoff limit |
| 12:00–13:00 | Caller submits mission; persist tasks; dispatch workers; build board; deploy first slice | Hosted caller-to-three-results journey, with any fixtures labeled |
| 13:00–14:00 | Real outputs, approvals, MPP service fee, Link spend request and chosen transaction path | Caller gets usable JSON; reload persists state; payment and merchant evidence stay separate |
| 14:00–15:00 | Budget revision, reservations, stale-approval and retry handling; independent verification | No overspend, duplicate commitments or false completion |
| 15:00–16:00 | Fix findings; polish hierarchy, handoffs and final hosted journey | All three lanes visible; limitations documented; feature freeze at 16:00 |
| 16:00–16:35 | Rehearse twice; capture labeled backup recording; write submission and run instructions | Evidence, public demo and source links ready |
| 16:35–17:00 | Submit; check access/links; keep critical-fix buffer | Submitted by 17:00 or earlier official cutoff |

Confirm the official submission cutoff at kickoff. If earlier, move freeze and
rehearsal earlier. Lost time comes from features, not the submission buffer.

### Gates and fallback order

- **12:00:** freeze one supported flow per lane and the exact ticket provider.
  Do not spend the day trying arbitrary sites. Surface login/approval blockers.
- **14:00:** a hosted end-to-end agent-to-result journey must work.
- **15:00:** demonstrate an actual Stripe test service receipt and the chosen
  approval flow. Merchant completion still requires separate provider evidence.
- **16:00:** no new features/providers/models/dependencies except necessary fixes.
- Timebox blocked-integration diagnosis to 20 minutes. Preserve the lane with a
  clear handoff or labeled replay; never fake execution.
- Cut Gemini, extra visualizations, additional categories/providers, analytics,
  onboarding, subscriptions, scheduling and self-serve agent creation first.
- Preserve agent-facing submission/results, all three lanes, shared constraints,
  approvals, evidence and explicit failures.
- If MPP cannot be enabled in time, a clearly labeled hosted service-payment
  handoff is the fallback. The caller resumes the same job after payment. Report
  that limitation; do not claim autonomous agent payment or a working MPP flow.

## Architecture

| Component | Responsibility |
|---|---|
| External caller agent | Submits work and consumes structured results; appears in the demo |
| Claude + Eve | Interprets constraints, dispatches workers and resumes after decisions |
| Vercel | Hosts UI, APIs, Eve runtime and durable orchestration; use Eve link/deploy |
| Surfsky | Runs remote concurrent browsers and persistent profiles |
| Supabase | Workspace-owned missions, task state, shared budget, approvals, evidence and results; Realtime for board updates |
| Stripe MPP | Preferred fixed per-mission service fee; paid response returns a durable job handle |
| Stripe Link | Manager-approved merchant spend requests/credentials; separate from service payment |
| Codex | Bounded implementation and independent verification; retain actual contribution evidence |
| Gemini | Stretch only: useful image/video interpretation after the core is verified |

One TypeScript web application with Eve integration, one Supabase project, three
named browser sessions and one demo workspace. Confirm the web integration from
installed Eve docs. No separate microservices or per-customer deployments.
Supabase owns product state; Eve owns execution/session state.

Eve's registry has browser and Link extensions. Surfsky uses a remote browser:
verify the selected extension supports that connection instead of assuming its
default sandbox Chromium becomes Surfsky. Search the registry first, then use
a small typed adapter when required.

Use an authenticated demo manager and a scoped caller credential. No anonymous
execution/approval routes. Secrets, cookies, card data and credential-bearing
session URLs stay out of model output, public evidence and source control.

## Demo acceptance

1. A separate caller agent submits through our documented service.
2. Three workers operate concurrently and return grounded results for Amazon,
   Fiverr and the chosen ticket site, or explicit blocked states.
3. The manager sees proposed, reserved and committed spending.
4. Before commitments, lower the budget from $900 to $650 while keeping six
   passes. Revise only uncommitted choices. If no plan fits, explain the gap.
5. Review exact commitments. Material changes invalidate old approvals.
   Required Link purchase approval is separate from application plan approval.
6. Show a verified Stripe service receipt and the best supported merchant flow.
   Label test mode. A test charge does not purchase Amazon/Fiverr goods/services
   or book real tickets. A live commitment needs approval for that exact action.
7. The caller receives outcomes, costs, evidence and blockers. Reload/resume
   preserves state without repeating purchases.

Ninety seconds is a presentation target, not a promised runtime for arbitrary
three-site missions. Measure actual duration, prepare sessions/input, and label
any recording or replay.

## Team execution

Copied roles: **backend**, **browser**, **frontend**, **verifier**. These are build
roles, distinct from the runtime's three marketplace workers. Coordinator owns
contract, dependencies, deployment, integration, scope and submission. Run up to
three builders, then give the verifier stable slices; respect agent-slot limits.

Backend owns API routes even under `app/`; frontend owns UI; browser owns remote
adapters. Read `CONTRACT.md` before parallel edits. Builders append `review`;
only the independent verifier writes `done`. Run the workspace guard first.
No Port MCP, old scraper schema, SQLite defaults or missing validation hooks.

## Event, prizes and categories

The [official event page](https://hackathon.supabase.com/supabase-select-2026-hackathon)
lists October 3, 2026, 08:00–17:30 PDT at 580 20th Street, San Francisco.
Registration closed September 28 at 13:00 PDT. **The user's build window is
11:00–17:00**, regardless of the wider event listing.

The [organizer listing](https://luma.com/select-2026-hackathon) describes **100K+
in shared participant credits** from Supabase, Claude, Stripe and Vercel, plus a
**separate 31K credits winner pool**. These are credits, not promised cash or
per-person awards. The top six teams demo on stage. The final panel lists Ant
Wilson and Paul Copplestone (Supabase), Pratik Gupta (Stripe), John Robison
(Anthropic) and George Fahmy (Vercel).

User-supplied voting categories:

- Best Use of Vercel
- Best Use of Claude
- Functionality and Completeness
- Innovation and Creativity
- User Experience and Design
- Impact and Usefulness
- Best Use of Stripe
- Best Use of Codex
- Best Use of Multimodal AI for Gemini

No category payout or specific eligibility conditions have been supplied.
Prioritize the four core criteria and substantive Supabase/Vercel/Claude/Stripe
usage. Document actual Codex contributions. Gemini is a stretch.

Meaningful Supabase use is required by the
[published rules](https://hackathon.supabase.com/hackathon-rules). The rules allow
open-source building blocks but require the submitted application to be created
during the event. Prepare this kit now; build the new application at kickoff.

## Researched references

- [Hackathon primer](https://shipbysundown.dev): Link, MPP, Projects and browser partners.
- [Surfsky](https://docs.surfsky.io/): remote browsers, persistence, concurrency and screencasts.
- [Eve](https://vercel.com/eve) and [browser extension](https://github.com/vercel-labs/agent-browser/tree/main/packages/%40agent-browser/eve).
- [MPP](https://docs.stripe.com/payments/machine/mpp) and [Link purchases](https://docs.stripe.com/agentic-commerce/agents/link-agent-wallet/use-link-wallet-pay-online).
- [Supabase Realtime](https://supabase.com/docs/guides/realtime) and [access policies](https://supabase.com/docs/guides/database/postgres/row-level-security).

Surfsky reduces access work; it does not prove these specific authenticated
checkouts. Merchant rules, MFA, inventory and payment acceptance remain
per-provider constraints. Credentials and live integrations are unverified in prep.
