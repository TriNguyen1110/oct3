# Cue

**Your agent’s extra hands.**

Browser workers other agents can hire. One mission coordinates **Hiring,
Logistics, and Travel** under a shared budget and manager approvals. The wider
vision includes **Food & supplies**, shown as coming next.

Today’s three demo lanes use Fiverr, Amazon, and event-ticket research. Providers
appear beneath capability names. Food ordering, Luma registration, and completed
merchant transactions remain implementation targets; the category names do not
add integrations. Cue’s rounded C-and-arrow mark suggests a friendly nudge forward.

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

The initial slice is in development. Surfsky and Anthropic credentials are loaded
locally; live provider verification is separate. Supabase project setup and Stripe
configuration are pending. Fixture data and test payments must be labeled;
neither proves a merchant order, freelancer hire, or ticket booking.

## Review and history

Agent results include a dashboard link and per-worker review/provider-preview
links. Confirmation and receipt links appear only from matching live provider
evidence; current merchant execution still ends at a handoff. **Past missions**
reopens the latest 20 workspace missions from the configured store. Saved user
preferences and external history import remain stretch work.

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
