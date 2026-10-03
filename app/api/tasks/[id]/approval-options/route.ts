import { z } from "zod";
import { requireAuth } from "@/src/server/auth";
import { handle } from "@/src/server/errors";
import { approvalOptions, assertPasskeyRequestOrigin } from "@/src/server/passkeys";
const schema=z.object({proposal_id:z.string().min(1),revision:z.number().int().min(1)}).strict();
export const runtime="nodejs";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{assertPasskeyRequestOrigin(request);const principal=requireAuth(request,"manager");const exact=schema.parse(await request.json());return Response.json(await approvalOptions((await context.params).id,principal,exact),{headers:{"cache-control":"no-store"}});});}
