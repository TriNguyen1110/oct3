# Real Claude Code caller check

October 3, 2026. Coordinator-run connection check, not an independent merchant
journey verification.

Command: `node --env-file=.env.local scripts/claude-demo.mjs --check`

Observed result:

```json
{
  "passed": true,
  "environment": "http://127.0.0.1:3003",
  "client": "Claude Code",
  "model": "claude-sonnet-5-5",
  "tool_calls": ["mcp__oct3__list_missions"],
  "mission_submitted": false
}
```

The actual Claude Code client loaded the HTTP MCP server, invoked list_missions
once, received a non-error tool result, and exited successfully. The check
inspected the stream's tool-use and matching tool-result IDs. No merchant
browsers, purchases, freelancer messages or event registrations were started.

The launcher selects medium effort, only the oct3 MCP server, and no built-in
coding tools. It runs in an isolated temporary caller directory; the reusable
config contains environment references, not actual credentials. It passes the
agent credential and Claude authentication while excluding manager, Surfsky,
Supabase, Stripe and Vercel credentials from the child environment.

This establishes a terminal connection for the stage. It does not establish
completed merchant flows, hosted Supabase persistence, Stripe payments, or the
interactive terminal's appearance. Those remain separate verification scopes.
