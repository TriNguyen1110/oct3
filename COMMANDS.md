# Local commands

Canonical repository: `/Users/tringuyen/Developer/.worktrees/oct3`.
Run `bash scripts/check-workspace.sh` here before editing/building.

Use Node 24: `export PATH=/Users/tringuyen/.nvm/versions/node/v24.20.0/bin:$PATH`.

- Install: `npm install`
- Development: `npm run dev` (coordinator only; http://localhost:3003 for passkeys)
- Type check: `npm run typecheck`
- Production build: `npm run build`
- Tests, once authored: `npm test`

Dependencies are pinned in package.json and package-lock.json. Put secrets in
ignored `.env.local`; never in browser code, evidence, commits or model messages.
Stripe MPP sandbox and the combined hosted Claude terminal/payment/research
journey are verified; see `reports/performance/hosted-claude-paid-research.json`.
Real merchant checkout and final registration remain unverified. Fixture mode
must be explicit throughout the UI. See `docs/CLAUDE_DEMO.md` for current limits.

Passkey cloud proof (isolated synthetic workspace; creates then removes its own
test rows, never touches the real manager's credential):
`node --env-file=.env.local --import tsx scripts/prove-passkey-cloud.ts --synthetic-cloud`.
Apply `supabase/migrations/202610030003_passkeys.sql` before running this on a new
project. Native enrollment must happen at the configured `OCT3_APP_URL`, using
the manager's own device. The demo supports one enrollment and no reset flow.
