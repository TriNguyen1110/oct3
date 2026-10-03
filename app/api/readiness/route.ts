import { requireAuth } from "@/src/server/auth";
import { handle } from "@/src/server/errors";
import { storageMode } from "@/src/server/store";
import { servicePaymentReadiness } from "@/src/server/service-payments";
import { linkConfigured, linkTestMode } from "@/src/server/link-wallet";
import type { RuntimeReadiness } from "@/src/shared/contracts";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return handle(async () => {
    requireAuth(request);
    const stripe = servicePaymentReadiness();
    const services: RuntimeReadiness[] = [
      { service: "Claude", ready: !!process.env.ANTHROPIC_API_KEY, detail: process.env.ANTHROPIC_API_KEY ? "API key configured; coordinator uses claude-sonnet-5-5." : "Add ANTHROPIC_API_KEY to enable planning." },
      { service: "Gemini voice", ready: !!process.env.GEMINI_API_KEY, detail: process.env.GEMINI_API_KEY ? "Key configured for short audio briefs. Voice produces an editable draft; it never submits or approves work." : "Voice is not configured. Typed briefs remain available." },
      { service: "Surfsky", ready: !!process.env.SURFSKY_API_KEY, detail: process.env.SURFSKY_API_KEY ? "Key configured. Each destination still needs an observed browser result." : "Add SURFSKY_API_KEY to enable remote browsers." },
      { service: "Supabase", ready: storageMode() === "supabase", detail: storageMode() === "supabase" ? "Supabase persistence configured. Connection health is verified separately." : "Local development JSON storage. Connect Supabase for deployment." },
      { service: "Stripe MPP", ready: stripe.ready, detail: stripe.detail },
      { service: "Link Agent Wallet", ready: linkConfigured(), detail: linkConfigured() ? `Connection configured in ${linkTestMode() ? "test" : "live"} mode; wallet health is checked separately. Exact checkout, passkey and Link approval are required; merchant execution remains disabled.` : "Connect Link to prepare exact merchant spend requests. Merchant execution remains disabled." },
    ];
    return Response.json({ services, mode: process.env.OCT3_DEMO_MODE === "true" ? "fixture" : "live", storage: storageMode() });
  });
}
