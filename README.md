# Cue

**Your agent’s extra hands.**

Browser workers other agents can hire. One mission coordinates **Hiring,
Logistics, and Travel** under a shared budget and manager approvals. The wider
vision includes **Food & supplies**, shown as coming next.

Public demo: **https://oct3-five.vercel.app**. Today’s lanes use Fiverr, Amazon
and event-ticket research. The hosted Claude → Stripe sandbox → Surfsky →
Supabase research flow is verified: Fiverr and Luma returned options, while
Amazon returned an access blocker. The narrow free Luma registration adapter has
passed synthetic guard checks and actual read-only preparation; its final RSVP
is unverified. Food ordering and paid merchant transactions are not implemented.

Built for Supabase Select, October 3, 2026. Theme: **Make Something Agents Want**.
Judging: **Innovation, Design, Functionality, Impact**.

## Work here

Cue is the product name; `oct3` remains the repository and technical identifier.
This is the independent application repository, initialized from hacker-kit.
Canonical local root: `/Users/tringuyen/Developer/.worktrees/oct3`.
Every builder must run `bash scripts/check-workspace.sh` here before changes.
Read [TEAM_BRIEF.md](TEAM_BRIEF.md), [HACKATHON.md](HACKATHON.md), and
[CONTRACT.md](CONTRACT.md). Active ownership and progress are in [BOARD.tsv](BOARD.tsv).

## Development

Use Node 24 and run `npm install`, then `npm run dev`. The coordinator owns the
single development server at `http://127.0.0.1:3003`.
See [COMMANDS.md](COMMANDS.md) for checks. Copy `.env.example` to `.env.local` only
when the local file does not already exist; credentials are never committed.

Supabase cloud state and manager preferences, Stripe MPP sandbox payment,
Claude/Eve orchestration and hosted read-only Surfsky research are verified.
Fixture data and test payments are labeled; neither proves a merchant order,
freelancer hire or ticket booking. See the runbook for exact evidence and limits.

## Review and history

Agent results include a dashboard link and per-worker review/provider-preview
links. Confirmation and receipt links appear only from matching live provider
evidence. **Past missions** reopens the latest 20 workspace missions. The saved
manager profile stores name, email, company and role in Supabase and supplies
attendee defaults. It never authorizes commitments. External merchant-history
import remains unimplemented.

## Agent connections and evidence

- [Connect with CLI or MCP](docs/CONNECT.md)
- [Sponsor integrations and proof](docs/SPONSORS.md)
- [Demo runbook and latency](docs/DEMO.md)
- [Form components and bounded recovery](docs/RELIABILITY.md)
- [Coding team models and thinking levels](MODEL_ROUTING.md)
- [Independent local verification](reports/verification/passed-local.md)

## Stack and boundaries

Next.js and Eve on Vercel, Claude for coordination, remote Surfsky browsers,
Supabase for shared state, and Stripe for separate service fees and approved
merchant spend. Managers approve exact commitments. Other agents submit work
and receive structured outcomes and source evidence.

Frontend owns UI, backend owns APIs and state, browser builder owns remote
workflows, and the coordinator owns dependencies and integration. The verifier
checks stable slices independently. All application code stays in this repo.
