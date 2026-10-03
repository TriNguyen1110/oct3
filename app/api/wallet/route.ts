import { requireAuth } from "@/src/server/auth";
import { handle } from "@/src/server/errors";
import { walletStatus } from "@/src/server/link-wallet";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handle(async () => { requireAuth(request, "manager"); return Response.json(await walletStatus(), { headers: { "cache-control": "no-store" } }); });
}
