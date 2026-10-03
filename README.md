# oct3

Browser workers other agents can hire. One mission coordinates Amazon supplies,
Fiverr services, and event tickets under a shared budget and manager approvals.

Built for Supabase Select, October 3, 2026. Theme: **Make Something Agents Want**.
Judging: **Innovation, Design, Functionality, Impact**.

## Work here

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

## Stack and boundaries

Next.js and Eve on Vercel, Claude for coordination, remote Surfsky browsers,
Supabase for shared state, and Stripe for separate service fees and approved
merchant spend. Managers approve exact commitments. Other agents submit work
and receive structured outcomes and source evidence.

Frontend owns UI, backend owns APIs and state, browser builder owns remote
workflows, and the coordinator owns dependencies and integration. The verifier
checks stable slices independently. All application code stays in this repo.
