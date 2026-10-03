import { requireAuth } from "@/src/server/auth";
import { handle } from "@/src/server/errors";
import { assertPasskeyRequestOrigin } from "@/src/server/passkeys";
import { approvalSchema } from "@/src/server/schema";
import { cancelLinkWallet } from "@/src/server/link-wallet";
import { presentMission } from "@/src/server/presentation";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const principal = requireAuth(request, "manager"); assertPasskeyRequestOrigin(request);
    const record = await cancelLinkWallet((await context.params).id, principal, approvalSchema.parse(await request.json()));
    return Response.json(presentMission(record.view, new URL(request.url).origin), { headers: { "cache-control": "no-store" } });
  });
}
