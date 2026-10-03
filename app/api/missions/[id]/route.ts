import { presentMission } from "@/src/server/presentation";
import { requireAuth } from "@/src/server/auth";
import { handle } from "@/src/server/errors";
import { missionView } from "@/src/server/missions";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => Response.json(presentMission(await missionView((await context.params).id, requireAuth(request)), new URL(request.url).origin), { headers: { "cache-control": "no-store" } }));
}
