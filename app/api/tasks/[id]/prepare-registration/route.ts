import { requireAuth } from "@/src/server/auth";
import { handle } from "@/src/server/errors";
import { prepareFreeRegistrationTask } from "@/src/server/free-registration";
import { presentMission } from "@/src/server/presentation";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const prepareSchema = z.object({ expected_revision: z.number().int().min(1) }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const principal = requireAuth(request, "manager");
    const input = prepareSchema.parse(await request.json());
    const record = await prepareFreeRegistrationTask((await context.params).id, principal, input.expected_revision);
    return Response.json(presentMission(record.view, new URL(request.url).origin), { headers: { "cache-control": "no-store" } });
  });
}
