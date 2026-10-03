import { requireAuth } from "@/src/server/auth";
import { handle } from "@/src/server/errors";
import { assertPasskeyRequestOrigin, passkeyStatus } from "@/src/server/passkeys";
export const runtime="nodejs";
export async function GET(request:Request){return handle(async()=>{assertPasskeyRequestOrigin(request);const principal=requireAuth(request,"manager");return Response.json(await passkeyStatus(principal),{headers:{"cache-control":"no-store"}});});}
