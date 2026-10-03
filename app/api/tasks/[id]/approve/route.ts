import { requireAuth } from "@/src/server/auth";
import { handle } from "@/src/server/errors";
import { decideTask } from "@/src/server/missions";
import { approvalSchema } from "@/src/server/schema";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const principal = requireAuth(request, "manager");
    const record = await decideTask((await context.params).id, principal, approvalSchema.parse(await request.json()), "approve");
    return Response.json(record.view);
  });
}
