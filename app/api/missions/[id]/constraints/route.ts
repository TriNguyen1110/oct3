import { presentMission } from "@/src/server/presentation";
import { requireAuth } from "@/src/server/auth";
import { dispatchMission } from "@/src/server/dispatch";
import { handle } from "@/src/server/errors";
import { reviseMission } from "@/src/server/missions";
import { constraintsSchema } from "@/src/server/schema";

export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const principal = requireAuth(request, "manager");
    const record = await reviseMission((await context.params).id, principal, constraintsSchema.parse(await request.json()));
    const view = record.view.mode === "live" ? await dispatchMission(record.id, principal.workspace_id, new URL(request.url).origin) : record.view;
    return Response.json(presentMission(view, new URL(request.url).origin), { headers: { "cache-control": "no-store" } });
  });
}
