import { defineTool } from "eve/tools";
import { z } from "zod";
import { getRecord } from "../../src/server/store";

export default defineTool({
  description: "Read a persisted mission's budget, workers, evidence and handoffs in the authenticated workspace.",
  inputSchema: z.object({ mission_id: z.string().uuid() }),
  async execute({ mission_id }, ctx) {
    const workspace = ctx.session.auth.current?.attributes.workspace_id;
    if (typeof workspace !== "string") throw new Error("Authenticated workspace required");
    return (await getRecord(mission_id, workspace)).view;
  },
});
