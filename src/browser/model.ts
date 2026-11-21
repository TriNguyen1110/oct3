/** Claude model id for worker-side choices (ranking, food item pick): OCT3_CLAUDE_MODEL, else claude-sonnet-5-5. */
export const claudeModelId = () => process.env.OCT3_CLAUDE_MODEL?.trim() || "claude-sonnet-5-5";
