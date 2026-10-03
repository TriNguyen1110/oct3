import { requireAuth } from "@/src/server/auth";
import { dispatchMission } from "@/src/server/dispatch";
import { handle } from "@/src/server/errors";
import { presentMission } from "@/src/server/presentation";
import { payMissionServiceFeeForTest } from "@/src/server/service-test-payment";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const testPaymentSchema = z.object({ mode: z.literal("test") }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const principal = requireAuth(request);
    const paymentRequest = request.clone();
    testPaymentSchema.parse(await request.json());
    const { id } = await context.params;
    const origin = new URL(request.url).origin;
    const payment = await payMissionServiceFeeForTest(paymentRequest, id, principal.workspace_id, origin);
    if (payment.kind === "blocked" || payment.kind === "failed") {
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
    return payment.withReceipt(Response.json(presentMission(view, origin), {
      status: 200,
      headers: { "cache-control": "no-store" },
    }));
  });
}
