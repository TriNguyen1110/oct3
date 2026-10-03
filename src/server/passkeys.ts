import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from "@simplewebauthn/server";
import type { Principal } from "./auth";
import { AppError } from "./errors";
import { approvalRequirement } from "./missions";
import { storageMode } from "./store";

type Kind = "registration" | "approval";
interface CredentialRow { workspace_id:string; principal_id:string; credential_id:string; public_key:string; counter:number; transports:string[]; device_type:string; backed_up:boolean }
interface ChallengeRow { id:string; workspace_id:string; principal_id:string; kind:Kind; challenge:string; task_id:string|null; proposal_id:string|null; revision:number|null; action_hash:string|null; expires_at:string; consumed_at:string|null }
const localCredentials = new Map<string, CredentialRow>();
const localChallenges = new Map<string, ChallengeRow>();
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession:false, autoRefreshToken:false } });
const key = (p:Principal) => `${p.workspace_id}:${p.id}`;
const manager = (p:Principal) => { if(p.role!=="manager")throw new AppError(403,"manager_required","A manager must use passkeys for approvals."); };

function config() {
  let configured = "";
  try { configured = new URL(process.env.OCT3_APP_URL || (process.env.VERCEL || process.env.NODE_ENV === "production" ? "https://oct3-five.vercel.app" : "http://localhost:3003")).origin; }
  catch { throw new AppError(503,"passkey_config_invalid","OCT3_APP_URL must be a valid trusted application URL."); }
  const origin = configured;
  const allowed = new Set(["https://oct3-five.vercel.app", "http://localhost:3003"]);
  if (!allowed.has(origin)) throw new AppError(503,"passkey_config_invalid","The trusted passkey origin is not configured for this deployment.");
  const rpID = new URL(origin).hostname;
  return { origin, rpID };
}
export function assertPasskeyRequestOrigin(request:Request){
  const trusted=config().origin;
  let supplied=request.headers.get("origin");
  if(!supplied&&request.method==="GET"){try{supplied=new URL(request.headers.get("referer")||"").origin;}catch{supplied=null;}}
  if(supplied!==trusted)throw new AppError(403,"invalid_origin","Passkey ceremonies must come from the trusted mission board origin.");
}

async function credential(principal:Principal):Promise<CredentialRow|null>{
  if(storageMode()==="local") return localCredentials.get(key(principal))||null;
  const result=await db().from("oct3_passkey_credentials").select("*").eq("workspace_id",principal.workspace_id).eq("principal_id",principal.id).maybeSingle();
  if(result.error)throw new AppError(503,"storage_unavailable","Passkey storage is unavailable.");
  return result.data as CredentialRow|null;
}
async function saveChallenge(row:ChallengeRow){
  if(storageMode()==="local"){localChallenges.set(row.id,row);return;}
  const result=await db().from("oct3_passkey_challenges").insert(row);
  if(result.error)throw new AppError(503,"storage_unavailable","The passkey challenge could not be saved.");
}
async function loadChallenge(id:string,principal:Principal,kind:Kind){
  let row:ChallengeRow|null;
  if(storageMode()==="local")row=localChallenges.get(id)||null;
  else{const result=await db().from("oct3_passkey_challenges").select("*").eq("id",id).eq("workspace_id",principal.workspace_id).eq("principal_id",principal.id).eq("kind",kind).maybeSingle();if(result.error)throw new AppError(503,"storage_unavailable","The passkey challenge could not be read.");row=result.data as ChallengeRow|null;}
  if(!row||row.workspace_id!==principal.workspace_id||row.principal_id!==principal.id||row.kind!==kind||row.consumed_at)throw new AppError(409,"passkey_challenge_invalid","This passkey challenge is missing, out of scope, or already used.");
  const expires=Date.parse(row.expires_at);
  if(!Number.isFinite(expires)||expires<=Date.now())throw new AppError(409,"passkey_challenge_expired","This passkey challenge expired. Start again.");
  return row;
}
async function consume(row:ChallengeRow){
  if(storageMode()==="local"){
    const current=localChallenges.get(row.id);
    if(!current||current.workspace_id!==row.workspace_id||current.principal_id!==row.principal_id||current.kind!==row.kind||current.consumed_at||Date.parse(current.expires_at)<=Date.now())throw new AppError(409,"passkey_challenge_replayed","This passkey challenge was already used or out of scope.");
    current.consumed_at=new Date().toISOString();return;
  }
  const result=await db().rpc("oct3_consume_passkey_challenge",{p_id:row.id,p_workspace:row.workspace_id,p_principal:row.principal_id,p_kind:row.kind});
  if(result.error)throw new AppError(503,"storage_unavailable","The passkey challenge could not be consumed.");
  if(result.data!==true)throw new AppError(409,"passkey_challenge_replayed","This passkey challenge was already used or expired.");
}
function challengeRow(principal:Principal,kind:Kind,challenge:string,binding?:{task_id:string;proposal_id:string;revision:number;action_hash:string}):ChallengeRow{
  return {id:randomUUID(),workspace_id:principal.workspace_id,principal_id:principal.id,kind,challenge,task_id:binding?.task_id||null,proposal_id:binding?.proposal_id||null,revision:binding?.revision||null,action_hash:binding?.action_hash||null,expires_at:new Date(Date.now()+5*60_000).toISOString(),consumed_at:null};
}

export async function passkeyStatus(principal:Principal){manager(principal);return {enrolled:Boolean(await credential(principal)),required:true as const};}
export async function registrationOptions(principal:Principal){
  manager(principal);
  if(await credential(principal))throw new AppError(409,"passkey_already_enrolled","This manager already has a passkey. Additional enrollment is not available in this demo.");
  const {rpID}=config();
  const options=await generateRegistrationOptions({rpName:"Cue",rpID,userName:principal.id,userDisplayName:"Cue demo manager",userID:Buffer.from(createHash("sha256").update(key(principal)).digest()),attestationType:"none",authenticatorSelection:{authenticatorAttachment:"platform",residentKey:"required",userVerification:"required"},supportedAlgorithmIDs:[-7,-257],timeout:60000});
  const row=challengeRow(principal,"registration",options.challenge);await saveChallenge(row);return {challenge_id:row.id,options};
}
export async function verifyRegistration(principal:Principal,input:{challenge_id:string;response:RegistrationResponseJSON}){
  manager(principal);
  if(await credential(principal))throw new AppError(409,"passkey_already_enrolled","This manager already has a passkey.");
  if(input.response.authenticatorAttachment!=="platform")throw new AppError(400,"platform_passkey_required","Enroll this device's platform passkey.");
  const row=await loadChallenge(input.challenge_id,principal,"registration");const {origin,rpID}=config();
  let verification;try{verification=await verifyRegistrationResponse({response:input.response,expectedChallenge:row.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,supportedAlgorithmIDs:[-7,-257]});}catch{throw new AppError(400,"passkey_verification_failed","The platform passkey response was not valid for this site.");}
  if(!verification.verified||!verification.registrationInfo?.userVerified)throw new AppError(400,"passkey_user_verification_required","Biometric or device user verification is required.");
  await consume(row);const c=verification.registrationInfo.credential;const saved:CredentialRow={workspace_id:principal.workspace_id,principal_id:principal.id,credential_id:c.id,public_key:Buffer.from(c.publicKey).toString("base64url"),counter:c.counter,transports:c.transports||input.response.response.transports||[],device_type:verification.registrationInfo.credentialDeviceType,backed_up:verification.registrationInfo.credentialBackedUp};
  if(storageMode()==="local"){
    if(localCredentials.has(key(principal)))throw new AppError(409,"passkey_already_enrolled","This manager already has a passkey.");
    localCredentials.set(key(principal),saved);
  }else{const result=await db().from("oct3_passkey_credentials").insert(saved);if(result.error)throw new AppError(result.error.code==="23505"?409:503,result.error.code==="23505"?"passkey_already_enrolled":"storage_unavailable","The passkey credential could not be saved.");}
  return {verified:true as const};
}
export async function approvalOptions(taskId:string,principal:Principal,exact:{proposal_id:string;revision:number}){
  manager(principal);
  const c=await credential(principal);if(!c)throw new AppError(409,"passkey_enrollment_required","Enroll the manager's platform passkey before approving live actions.");
  const binding=await approvalRequirement(taskId,principal,exact);if(binding.mode!=="live")throw new AppError(409,"passkey_not_required","Fixture approvals do not use a passkey.");
  const {rpID}=config();const options=await generateAuthenticationOptions({rpID,allowCredentials:[{id:c.credential_id,transports:c.transports}],userVerification:"required",timeout:60000});
  const row=challengeRow(principal,"approval",options.challenge,{task_id:taskId,proposal_id:exact.proposal_id,revision:exact.revision,action_hash:binding.action_hash});await saveChallenge(row);return {challenge_id:row.id,options};
}
export async function verifyApproval(taskId:string,principal:Principal,exact:{proposal_id:string;revision:number},input:{challenge_id:string;response:AuthenticationResponseJSON}){
  manager(principal);
  const row=await loadChallenge(input.challenge_id,principal,"approval");if(row.task_id!==taskId||row.proposal_id!==exact.proposal_id||row.revision!==exact.revision||!row.action_hash)throw new AppError(409,"passkey_scope_mismatch","The passkey challenge belongs to a different exact action.");
  const binding=await approvalRequirement(taskId,principal,exact);if(binding.mode!=="live"||binding.action_hash!==row.action_hash)throw new AppError(409,"stale_proposal","The exact action changed after the passkey prompt was created.");
  const c=await credential(principal);if(!c||c.credential_id!==input.response.id)throw new AppError(400,"passkey_credential_unknown","This passkey is not enrolled for the current manager.");
  const oldCounter=Number(c.counter);const {origin,rpID}=config();const webauthn:WebAuthnCredential={id:c.credential_id,publicKey:new Uint8Array(Buffer.from(c.public_key,"base64url")),counter:oldCounter,transports:c.transports};
  let verification;try{verification=await verifyAuthenticationResponse({response:input.response,expectedChallenge:row.challenge,expectedOrigin:origin,expectedRPID:rpID,credential:webauthn,requireUserVerification:true});}catch{throw new AppError(400,"passkey_verification_failed","The passkey signature, origin, RP ID, or user verification was invalid.");}
  if(!verification.verified||!verification.authenticationInfo.userVerified)throw new AppError(400,"passkey_user_verification_required","Biometric or device user verification is required.");
  await consume(row);const counter=verification.authenticationInfo.newCounter;
  if(storageMode()==="local"){
    const current=localCredentials.get(key(principal));
    if(!current||current.credential_id!==c.credential_id||Number(current.counter)!==oldCounter)throw new AppError(409,"passkey_counter_changed","Another passkey assertion completed first. Start a fresh approval prompt.");
    current.counter=counter;
  }else{
    const result=await db().from("oct3_passkey_credentials").update({counter}).eq("workspace_id",principal.workspace_id).eq("principal_id",principal.id).eq("credential_id",c.credential_id).eq("counter",oldCounter).select("credential_id").maybeSingle();
    if(result.error)throw new AppError(503,"storage_unavailable","The passkey counter could not be updated.");
    if(!result.data)throw new AppError(409,"passkey_counter_changed","Another passkey assertion completed first. Start a fresh approval prompt.");
  }
  return row.action_hash;
}
