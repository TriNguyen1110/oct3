import { requireAuth } from "@/src/server/auth";
import { handle } from "@/src/server/errors";
import { storageMode } from "@/src/server/store";
import { servicePaymentReadiness } from "@/src/server/service-payments";
import type { RuntimeReadiness } from "@/src/shared/contracts";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return handle(async () => {
    requireAuth(request);
    const stripe = servicePaymentReadiness();
    const services: RuntimeReadiness[] = [
      { service: "Claude", ready: !!process.env.ANTHROPIC_API_KEY, detail: process.env.ANTHROPIC_API_KEY ? "API key configured; coordinator uses claude-sonnet-5-5." : "Add ANTHROPIC_API_KEY to enable planning." },
      { service: "Surfsky", ready: !!process.env.SURFSKY_API_KEY, detail: process.env.SURFSKY_API_KEY ? "Key configured. Each destination still needs an observed browser result." : "Add SURFSKY_API_KEY to enable remote browsers." },
      { service: "Supabase", ready: storageMode() === "supabase", detail: storageMode() === "supabase" ? "Supabase persistence configured; apply the checked-in migration." : "Local development JSON storage. Connect Supabase for deployment." },
      { service: "Stripe MPP", ready: stripe.ready, detail: stripe.detail },
      { service: "Link Agent Wallet", ready: false, detail: "Not connected. Merchant commitments require separate manager and Link approval." },
    ];
    return Response.json({ services, mode: process.env.OCT3_DEMO_MODE === "true" ? "fixture" : "live", storage: storageMode() });
  });
}
