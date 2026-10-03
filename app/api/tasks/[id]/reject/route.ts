import { presentMission } from "@/src/server/presentation";
import { requireAuth } from "@/src/server/auth";
import { handle } from "@/src/server/errors";
import { decideTask } from "@/src/server/missions";
import { approvalSchema } from "@/src/server/schema";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const principal = requireAuth(request, "manager");
    const record = await decideTask((await context.params).id, principal, approvalSchema.parse(await request.json()), "reject");
    return Response.json(presentMission(record.view, new URL(request.url).origin), { headers: { "cache-control": "no-store" } });
  });
}
