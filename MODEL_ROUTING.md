# Build team model routing

This is the coding crew configuration, separate from the application's Claude/Eve runtime.

| Role | Codex model | Thinking | Claude Code model | Effort |
| --- | --- | --- | --- | --- |
| Backend implementation | GPT-5.6 Sol | medium | Claude Sonnet 5.5 | medium |
| Browser implementation | GPT-5.6 Sol | medium | Claude Sonnet 5.5 | medium |
| Frontend design and interaction | GPT-6 Astra | medium | Claude Sonnet 5.5 | medium |
| Independent verification | GPT-6 Astra | high | Claude Opus 5.5 | high |
| Bounded docs / discovery helper | GPT-5.6 Luna | low | — | — |

These are task-based choices for fast iteration, not benchmark claims. Keep three workers active at most. Give each worker disjoint owned paths and one concrete slice; use a verifier after that slice is stable. Keep the coordinator's selected model unchanged. Escalate a repeated unresolved issue or a change to authorization, spending, or concurrency to Astra/high review; do not make every edit use maximum thinking.

Codex loads project defaults from `.codex/config.toml` and roles from `.codex/agents/*.toml`. Start a new coding session in the application repository for project discovery. When the current host uses generic collaboration spawning, pass the listed model and reasoning effort explicitly with a fresh or bounded context; a full-history fork may inherit its parent's settings. Existing running agents retain their launch configuration. Replace them at a stable handoff instead of interrupting an edit to change models.

Claude Code roles live in `.claude/agents/*.md`, with explicit model IDs and effort. They configure Claude Code, not an already-running Codex worker. Inspect `/tasks` to confirm the resolved Claude model and effort. No global user preferences are changed.

Use the runtime settings in `agent/agent.ts` for the application's Claude/Eve agent. Browser latency, timeouts, and tool-call count must be measured separately from coding crew settings.

Configuration references: [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) and [Claude Code subagents](https://code.claude.com/docs/en/sub-agents).
