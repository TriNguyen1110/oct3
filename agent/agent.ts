import { anthropic } from "@ai-sdk/anthropic";
import { defineAgent } from "eve";

export default defineAgent({
  model: anthropic("claude-sonnet-5-5"),
  reasoning: "medium",
  limits: { maxInputTokensPerSession: 60000, maxOutputTokensPerSession: 6000, sessionTimeoutMs: 24 * 60 * 60 * 1000 },
  build: { externalDependencies: ["playwright-core"] },
});
