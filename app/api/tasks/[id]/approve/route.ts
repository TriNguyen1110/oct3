import { presentMission } from "@/src/server/presentation";
import { requireAuth } from "@/src/server/auth";
import { handle } from "@/src/server/errors";
import { approvalRequirement, decideTask } from "@/src/server/missions";
import { approvalSchema } from "@/src/server/schema";
import { assertPasskeyRequestOrigin, verifyApproval } from "@/src/server/passkeys";
import { demoApprovalEnabled } from "@/src/server/approval-policy";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const principal = requireAuth(request, "manager");
    const taskId=(await context.params).id;
    const body=z.object({proposal_id:z.string().min(1),revision:z.number().int().min(1),passkey:z.object({challenge_id:z.string().uuid(),response:z.object({id:z.string().min(1),rawId:z.string().min(1),type:z.literal("public-key"),response:z.object({clientDataJSON:z.string().min(1),authenticatorData:z.string().min(1),signature:z.string().min(1),userHandle:z.string().optional()}).strict(),clientExtensionResults:z.record(z.string(),z.unknown())}).passthrough()}).optional()}).strict().parse(await request.json());
    const exact=approvalSchema.parse(body);
    let verifiedActionHash:string|undefined;
    if(body.passkey){
      assertPasskeyRequestOrigin(request);
      verifiedActionHash=await verifyApproval(taskId,principal,exact,{challenge_id:body.passkey.challenge_id,response:body.passkey.response as AuthenticationResponseJSON});
    }else if(demoApprovalEnabled()){
      // Never accept a client-supplied bypass or action hash. Demo mode removes
      // only the device ceremony; the server computes the binding from the
      // authenticated workspace and current stored proposal.
      verifiedActionHash=(await approvalRequirement(taskId,principal,exact)).action_hash;
    }
    const record = await decideTask(taskId, principal, exact, "approve",verifiedActionHash);
    return Response.json(presentMission(record.view, new URL(request.url).origin), { headers: { "cache-control": "no-store" } });
  });
}
