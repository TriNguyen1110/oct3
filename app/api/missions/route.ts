import { requireAuth } from "@/src/server/auth";
import { dispatchMission } from "@/src/server/dispatch";
import { handle } from "@/src/server/errors";
import { createMission } from "@/src/server/missions";
import { missionSchema } from "@/src/server/schema";
import { listRecords } from "@/src/server/store";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  return handle(async () => {
    const principal = requireAuth(request);
    const missions = (await listRecords(principal.workspace_id)).map(x => x.view);
    return Response.json({ mission: missions[0] || null, missions });
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    const principal = requireAuth(request);
    const parsed = missionSchema.parse(await request.json());
    const { mode = process.env.OCT3_DEMO_MODE === "true" ? "fixture" : "live", ...input } = parsed;
    const result = await createMission(input, principal, request.headers.get("Idempotency-Key") || "", mode);
    const view = result.created ? await dispatchMission(result.record.id, principal.workspace_id, new URL(request.url).origin) : result.record.view;
    return Response.json({ ...view, result_url: `/api/missions/${view.mission_id}` }, { status: result.created ? 202 : 200, headers: { "cache-control": "no-store" } });
  });
}
