import { requireAuth } from "@/src/server/auth";
import { handle } from "@/src/server/errors";
import { assertPasskeyRequestOrigin, registrationOptions } from "@/src/server/passkeys";
import { z } from "zod";
export const runtime="nodejs";
export async function POST(request:Request){return handle(async()=>{assertPasskeyRequestOrigin(request);const principal=requireAuth(request,"manager");z.object({}).strict().parse(await request.json());return Response.json(await registrationOptions(principal),{headers:{"cache-control":"no-store"}});});}
