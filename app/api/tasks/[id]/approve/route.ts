import { presentMission } from "@/src/server/presentation";
import { requireAuth } from "@/src/server/auth";
import { handle } from "@/src/server/errors";
import { decideTask, type VerifiedApproval } from "@/src/server/missions";
import { approvalSchema } from "@/src/server/schema";
import { assertPasskeyRequestOrigin, verifyApproval } from "@/src/server/passkeys";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const principal = requireAuth(request, "manager");
    const taskId=(await context.params).id;
    const body=z.object({proposal_id:z.string().min(1),revision:z.number().int().min(1),passkey:z.object({challenge_id:z.string().uuid(),response:z.object({id:z.string().min(1),rawId:z.string().min(1),type:z.literal("public-key"),response:z.object({clientDataJSON:z.string().min(1),authenticatorData:z.string().min(1),signature:z.string().min(1),userHandle:z.string().optional()}).strict(),clientExtensionResults:z.record(z.string(),z.unknown())}).passthrough()}).optional()}).strict().parse(await request.json());
    const exact=approvalSchema.parse(body);
    // A live approval needs a verified passkey assertion for this exact action. Without one,
    // decideTask approves fixture plans only; there is no demo or server-derived live approval.
    let verified:VerifiedApproval|undefined;
    if(body.passkey){
      assertPasskeyRequestOrigin(request);
      verified={via:"passkey",action_hash:await verifyApproval(taskId,principal,exact,{challenge_id:body.passkey.challenge_id,response:body.passkey.response as AuthenticationResponseJSON})};
    }
    const record = await decideTask(taskId, principal, exact, "approve", verified);
    return Response.json(presentMission(record.view, new URL(request.url).origin), { headers: { "cache-control": "no-store" } });
  });
}
