import { presentMission } from "../../src/server/presentation";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { runMissionResearch } from "../../src/server/research";

export default defineTool({
  description: "Run the mission's three read-only browser workers concurrently, persisting grounded options and explicit blockers. Makes no merchant commitments.",
  inputSchema: z.object({ mission_id: z.string().uuid() }),
  async execute({ mission_id }, ctx) {
    const workspace = ctx.session.auth.current?.attributes.workspace_id;
    if (typeof workspace !== "string") throw new Error("Authenticated workspace required");
    return presentMission(await runMissionResearch(mission_id, workspace));
  },
});
