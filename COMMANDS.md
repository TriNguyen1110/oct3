# Local commands

Canonical repository: `/Users/tringuyen/Developer/.worktrees/oct3`.
Run `bash scripts/check-workspace.sh` here before editing/building.

Use Node 24: `export PATH=/Users/tringuyen/.nvm/versions/node/v24.20.0/bin:$PATH`.

- Install: `npm install`
- Development: `npm run dev` (coordinator only; http://127.0.0.1:3003)
- Type check: `npm run typecheck`
- Production build: `npm run build`
- Tests, once authored: `npm test`

Dependencies are pinned in package.json and package-lock.json. Put secrets in
ignored `.env.local`; never in browser code, evidence, commits or model messages.
Stripe is not configured yet. Fixture mode must be explicit throughout the UI.
