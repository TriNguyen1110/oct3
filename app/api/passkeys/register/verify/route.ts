import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";
import { requireAuth } from "@/src/server/auth";
import { handle } from "@/src/server/errors";
import { assertPasskeyRequestOrigin, verifyRegistration } from "@/src/server/passkeys";
const schema=z.object({challenge_id:z.string().uuid(),response:z.object({id:z.string().min(1),rawId:z.string().min(1),type:z.literal("public-key"),response:z.object({clientDataJSON:z.string().min(1),attestationObject:z.string().min(1),transports:z.array(z.string()).optional()}).passthrough(),clientExtensionResults:z.record(z.string(),z.unknown())}).passthrough()}).strict();
export const runtime="nodejs";
export async function POST(request:Request){return handle(async()=>{assertPasskeyRequestOrigin(request);const principal=requireAuth(request,"manager");const input=schema.parse(await request.json());return Response.json(await verifyRegistration(principal,{challenge_id:input.challenge_id,response:input.response as RegistrationResponseJSON}),{headers:{"cache-control":"no-store"}});});}
