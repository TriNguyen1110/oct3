import { presentMission } from "@/src/server/presentation";
import { requireAuth } from "@/src/server/auth";
import { dispatchMission } from "@/src/server/dispatch";
import { handle } from "@/src/server/errors";
import { createMission } from "@/src/server/missions";
import { missionSchema } from "@/src/server/schema";
import { gateMissionServicePayment } from "@/src/server/service-payment-gate";
import { listRecords } from "@/src/server/store";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  return handle(async () => {
    const principal = requireAuth(request);
    const missions = (await listRecords(principal.workspace_id)).map(x => presentMission(x.view, new URL(request.url).origin));
    return Response.json({ mission: missions[0] || null, missions }, { headers: { "cache-control": "no-store" } });
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    const principal = requireAuth(request);
    const parsed = missionSchema.parse(await request.json());
    const { mode = process.env.OCT3_DEMO_MODE === "true" ? "fixture" : "live", ...input } = parsed;
    const result = await createMission(input, principal, request.headers.get("Idempotency-Key") || "", mode);
    const origin = new URL(request.url).origin;
    if (mode === "fixture") {
      const view = result.created ? await dispatchMission(result.record.id, principal.workspace_id, origin) : result.record.view;
      return Response.json(presentMission(view, origin), { status: result.created ? 202 : 200, headers: { "cache-control": "no-store" } });
    }

    const payment = await gateMissionServicePayment(request, result.record.id, principal.workspace_id, origin);
    if (payment.kind === "challenge") return payment.response;
    if (payment.kind === "blocked") {
      const presented = presentMission(payment.record.view, origin);
      return Response.json({
        error: { code: payment.code, message: payment.message },
        mission: presented,
      }, {
        status: payment.status,
        headers: {
          "cache-control": "no-store",
          "x-cue-mission-id": payment.record.id,
          "x-cue-result-url": presented.result_url!,
          "x-cue-dashboard-url": presented.dashboard_url!,
        },
      });
    }
    const view = await dispatchMission(payment.record.id, principal.workspace_id, origin);
    const response = Response.json(presentMission(view, origin), {
      status: result.created ? 202 : 200,
      headers: { "cache-control": "no-store" },
    });
    return payment.withReceipt(response);
  });
}
