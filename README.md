# Cue

**Your agent’s extra hands.**

Browser workers other agents can hire. One mission coordinates **Hiring,
Logistics, Travel, and optional Food & supplies** under a shared budget and
manager approvals. The food demo focuses on one boba for pickup near the venue.

Public demo: **https://oct3-five.vercel.app**. Today’s lanes use Fiverr, Amazon
and event-ticket research. The hosted Claude → Stripe sandbox → Surfsky →
Supabase research flow is verified: Fiverr and Luma returned options, while
Amazon returned an access blocker. The narrow free Luma registration adapter has
passed guard checks, read-only preparation, and an actual $0 registration after
the manager enrolled a native passkey and approved the exact action. Matching
Luma confirmation is saved; a separate receipt link was not captured. Boba Guys' official pickup form is reachable; final food checkout
and paid merchant transactions remain unverified. New live approvals require
the manager's device passkey. Native setup and one exact signed live approval
are verified; test authenticators never enroll in their account.

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
single development server at `http://localhost:3003` (required for local passkeys).
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

Short voice notes can draft the brief, budget and food request for explicit
review. Actual Gemini audio-to-draft inference passed with a 4.842-second
synthetic spoken request in 2.088 seconds. The real hosted browser-to-Gemini
flow most recently passed in 3.238 seconds, with explicit draft application and no mission
submission. Typed briefs remain usable.
No voice result submits a mission or approves an action, and Cue does not save
recordings.

## Agent connections and evidence

- [Connect with CLI or MCP](docs/CONNECT.md)
- [Experimental local Chrome connection probe](docs/LOCAL_BROWSER.md) — native connection testing only; deployed workers still use Surfsky.
- [Sponsor integrations and proof](docs/SPONSORS.md)
- [Demo runbook and latency](docs/DEMO.md)
- [Measured impact baseline and comparison protocol](reports/verification/impact-baseline.md)
- [Form components and bounded recovery](docs/RELIABILITY.md)
- [Coding team models and thinking levels](MODEL_ROUTING.md)
- [Independent local verification](reports/verification/passed-local.md)

## Interface

Cue uses a dark concierge-desk composition: warm black, champagne and sea glass,
editorial serif headings, translucent command surfaces, and original SVG worker
illustrations. Spotlight hover writes CSS variables without React re-renders;
touch and reduced-motion users receive static affordances. No new animation
runtime or component subscription was added. The original components take
pattern inspiration from 21st.dev's [spotlight guidance](https://docs.21st.dev/blog/react-spotlight-effect-components)
and [card collection guide](https://docs.21st.dev/blog/react-card-components).

The cinematic hero uses a real close-up museum photograph of Hermes, a Roman
marble adaptation of a Classical Greek work. Monochrome grading, champagne
typography and subtle static texture provide the spy-film art direction.
The Met supplies the photograph under CC0; its original bytes stay intact.
[Asset](public/images/cue-hermes-marble.jpg),
[source and license](public/images/cue-hermes-marble.source.txt).

## Stack and boundaries

Next.js and Eve on Vercel, Claude for coordination, remote Surfsky browsers,
Supabase for shared state, and Stripe for separate service fees and approved
merchant spend. Managers approve exact commitments. Other agents submit work
and receive structured outcomes and source evidence.

Frontend owns UI, backend owns APIs and state, browser builder owns remote
workflows, and the coordinator owns dependencies and integration. The verifier
checks stable slices independently. All application code stays in this repo.
