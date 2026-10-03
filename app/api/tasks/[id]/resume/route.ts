import { presentMission } from "@/src/server/presentation";
import { requireAuth } from "@/src/server/auth";
import { handle } from "@/src/server/errors";
import { resumeTask } from "@/src/server/missions";
import { approvalSchema } from "@/src/server/schema";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const principal = requireAuth(request);
    const record = await resumeTask((await context.params).id, principal, approvalSchema.parse(await request.json()));
    return Response.json(presentMission(record.view, new URL(request.url).origin), { headers: { "cache-control": "no-store" } });
  });
}
