import { presentMission } from "../../src/server/presentation";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { runMissionResearch } from "../../src/server/research";
import { findTask } from "../../src/server/store";

export default defineTool({
  description: "Retry only one mission worker's read-only browser research after manager handoff. Reuses the mission, revision, browser profile and durable lane lease.",
  inputSchema: z.object({ task_id: z.string().min(1) }),
  async execute({ task_id }, ctx) {
    const workspace = ctx.session.auth.current?.attributes.workspace_id;
    if (typeof workspace !== "string") throw new Error("Authenticated workspace required");
    const record = await findTask(task_id, workspace);
    return presentMission(await runMissionResearch(record.id, workspace, task_id));
  },
});
