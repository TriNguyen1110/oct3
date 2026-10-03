import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Principal } from "../src/server/auth";
import { AppError } from "../src/server/errors";
import { approvalRequirement, createMission, decideTask, runFixture } from "../src/server/missions";
import { assertPasskeyRequestOrigin, passkeyStatus, registrationOptions } from "../src/server/passkeys";
import { mutateRecord } from "../src/server/store";
import type { MissionInput } from "../src/shared/contracts";

const manager:Principal={id:"passkey-manager",workspace_id:"passkey-workspace",role:"manager"};
const agent:Principal={...manager,id:"passkey-agent",role:"agent"};
const input:MissionInput={objective:"Prepare the passkey approval test",currency:"USD",purchase_budget_minor:90000,deadline:"2026-10-07T19:00:00.000Z",headcount:1,requirements:{amazon:{category:"toothpaste",delivery_ref:"office"},fiverr:{category:"flyer",brief:"test",due_date:"2026-10-06T19:00:00.000Z"},event_tickets:{event_url:"https://luma.com/OpenTogether",date:"2026-10-16T19:00:00.000Z",quantity:1,attendee_ref:"manager"}}};
const code=(value:string)=>(error:unknown)=>error instanceof AppError&&error.code===value;

test("passkey enrollment options and exact live approval gate",async t=>{
  const dir=await mkdtemp(join(tmpdir(),"oct3-passkey-"));
  const env={OCT3_STATE_PATH:join(dir,"state.json"),SUPABASE_URL:undefined,SUPABASE_SERVICE_ROLE_KEY:undefined,VERCEL:undefined,NODE_ENV:"test",OCT3_APP_URL:"http://localhost:3003"};
  for(const [name,value]of Object.entries(env)){const old=process.env[name];if(value===undefined)delete process.env[name];else process.env[name]=value;t.after(()=>{if(old===undefined)delete process.env[name];else process.env[name]=old;});}
  t.after(()=>rm(dir,{recursive:true,force:true}));

  assert.deepEqual(await passkeyStatus(manager),{enrolled:false,required:true});
  await assert.rejects(passkeyStatus(agent),code("manager_required"));
  assert.throws(()=>assertPasskeyRequestOrigin(new Request("http://127.0.0.1:3003/api/passkeys",{headers:{origin:"https://attacker.example"}})),code("invalid_origin"));
  assert.doesNotThrow(()=>assertPasskeyRequestOrigin(new Request("http://attacker.invalid/api/passkeys",{headers:{origin:"http://localhost:3003"}})));
  const created=await registrationOptions(manager);
  assert.ok(created.challenge_id);assert.equal(created.options.rp.id,"localhost");assert.equal(created.options.authenticatorSelection?.authenticatorAttachment,"platform");assert.equal(created.options.authenticatorSelection?.residentKey,"required");assert.equal(created.options.authenticatorSelection?.userVerification,"required");

  const made=await createMission(structuredClone(input),manager,"passkey-live-gate","fixture");
  const planned=await runFixture(made.record.id,manager.workspace_id);
  await mutateRecord(planned.id,manager.workspace_id,r=>{r.view.mode="live";});
  const task=planned.view.tasks[0],exact={proposal_id:task.proposal!.id,revision:task.proposal!.revision};
  const binding=await approvalRequirement(task.id,manager,exact);
  assert.equal(binding.mode,"live");assert.match(binding.action_hash,/^[0-9a-f]{64}$/);
  await assert.rejects(decideTask(task.id,manager,exact,"approve"),code("passkey_required"));
  await assert.rejects(decideTask(task.id,manager,exact,"approve","0".repeat(64)),code("passkey_required"));
  const approved=await decideTask(task.id,manager,exact,"approve",binding.action_hash);
  assert.equal(approved.reservations.filter(x=>x.state==="reserved").length,1);
  const replay=await decideTask(task.id,manager,exact,"approve");
  assert.equal(replay.reservations.filter(x=>x.state==="reserved").length,1);
  await mutateRecord(planned.id,manager.workspace_id,r=>{r.view.tasks[0].proposal!.title+=" changed";});
  await assert.rejects(decideTask(task.id,manager,exact,"approve",binding.action_hash),code("approval_state_invalid"));
});
