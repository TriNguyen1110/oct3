# Caller environment boundary — independent verification

Date: 2026-10-03T19:24:41.705446+00:00
Root: `/Users/tringuyen/Developer/.worktrees/oct3`; workspace guard passed.

PASS: `node --import tsx --test tests/caller-environment.test.ts` under Node24 reports one pass, zero failures/skips, 696.425875 ms. No broad suite or build was rerun for this narrow launcher change.

The test places an executable fake `claude` first on PATH inside a temporary directory, starts the real launcher with --check, and supplies only synthetic environment values. The fake child verifies that Stripe key/profile, Surfsky key/token, Supabase URL/service/anon keys, DATABASE_URL, MPP_SECRET_KEY, manager token, unknown future secret, multiple payment-authorization names and NODE_OPTIONS are absent. Sixteen denied keys are checked. Agent token, Anthropic key/OAuth token, normalized base origin and runtime essentials are present with their exact synthetic values. No credential values appear in launcher stdout/stderr.

The child also verifies isolated caller cwd, strict MCP configuration, no general tools and exactly the three caller MCP tools. It emits synthetic check events; those events are not evidence of a real Claude, MCP, network or payment call. Temporary executable, diagnostics and marker are removed after the test.

Two preliminary harness runs correctly observed no blocked keys but rejected macOS-injected __CF_USER_TEXT_ENCODING metadata. The assertion now permits that one operating-system runtime key. No launcher feature defect was found.

Scope limitation: this verifies environment inheritance and launch arguments. It does not inspect external Claude config or prove real model behavior. No actual server credential, model call, mission submission or money was used.

- `scripts/claude-demo.mjs`: `31b07db108d2aa26c7baafaa071c85f82ab8769f38b86ea3f0325402fa67c350`
- `tests/caller-environment.test.ts`: `47ba4c631d41cb83b3b2b3fff1d3683a6062d2d625eb4d759f3b478ad6d838d7`

Board: appended review and done for caller-environment only. No commit or push.
