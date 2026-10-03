import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createMission, decideTask, resumeTask, reviseMission, refresh } from "../src/server/missions";
import { prepareFreeRegistrationTask, freeRegistrationReview } from "../src/server/free-registration";
import { getRecord, mutateRecord } from "../src/server/store";
import { servicePaymentBinding } from "../src/server/service-payments";
import type { MissionRecord } from "../src/server/model";
import type { Principal } from "../src/server/auth";
import type { MissionInput } from "../src/shared/contracts";
import { mock, type Options } from "./helpers/luma-registration";

const manager: Principal = { id: "synthetic-manager", workspace_id: "synthetic-free-workspace", role: "manager" };
const agent: Principal = { ...manager, id: "synthetic-agent", role: "agent" };
const mission: MissionInput = { objective: "Synthetic free registration", currency: "USD", purchase_budget_minor: 100, deadline: "2026-10-17T01:00:00.000Z", headcount: 1,
  requirements: { amazon: { category: "supplies", delivery_ref: "synthetic" }, fiverr: { category: "flyer", brief: "synthetic", due_date: "2026-10-10" }, event_tickets: { event_url: "https://luma.com/OpenTogether", date: "2026-10-16", quantity: 1, attendee_ref: "manager" } } };
function setup(t: TestContext, options: Options = {}) {
  for (const [key, value] of Object.entries({ SUPABASE_URL: "https://synthetic.supabase.test", SUPABASE_SERVICE_ROLE_KEY: "synthetic-key", MPP_SECRET_KEY: "synthetic-free-registration-proof-secret" })) {
    const old = process.env[key]; process.env[key] = value; t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  const rows = new Map<string, MissionRecord>(), leases = new Map<string, string>();
  const profile = { name: "Synthetic Attendee", email: "synthetic-attendee@example.test", company: "Synthetic", role: "Synthetic" };
  options.otherFetch = async (url, init) => {
    assert.equal(url.origin, "https://synthetic.supabase.test");
    const method = init?.method || "GET";
    if (url.pathname.endsWith("/oct3_preferences")) { assert.equal(url.searchParams.get("workspace_id"), `eq.${manager.workspace_id}`); return Response.json([{ profile, updated_at: "2026-10-03T00:00:00Z" }]); }
    if (url.pathname.endsWith("/rpc/oct3_acquire_lane")) {
      const b = JSON.parse(String(init?.body)), key = `${b.p_workspace}:${b.p_lane}`;
      if (leases.has(key) && leases.get(key) !== b.p_owner) return Response.json(false);
      leases.set(key, b.p_owner); return Response.json(true);
    }
    if (url.pathname.endsWith("/oct3_browser_leases")) { leases.delete(`${url.searchParams.get("workspace_id")!.slice(3)}:${url.searchParams.get("lane")!.slice(3)}`); return new Response(null, { status: 204 }); }
    assert.equal(url.pathname, "/rest/v1/oct3_missions");
    const id = url.searchParams.get("id")?.slice(3), workspace = url.searchParams.get("workspace_id")?.slice(3);
    if (method === "POST") { const b = JSON.parse(String(init?.body)); rows.set(b.id, b.payload); return Response.json({ payload: b.payload }); }
    const row = id ? rows.get(id) : undefined;
    if (method === "GET") return Response.json(row && row.workspace_id === workspace ? [{ payload: row }] : []);
    assert.equal(method, "PATCH");
    if (!row || row.workspace_id !== workspace || row.version !== Number(url.searchParams.get("version")?.slice(3))) return Response.json(null);
    const b = JSON.parse(String(init?.body)); rows.set(row.id, b.payload); return Response.json({ payload: b.payload });
  };
  const browser = mock(t, options);
  let sequence = 0;
  const fresh = async () => {
    const record = (await createMission(structuredClone(mission), manager, `synthetic-free-${++sequence}`, "live")).record;
    return mutateRecord(record.id, manager.workspace_id, stored => {
      const binding = servicePaymentBinding({ workspaceId: stored.workspace_id, idempotencyKey: stored.idempotency_key, requestHash: stored.request_hash });
      stored.service_payment = { external_id: binding.externalId, scope: binding.scope, proof: { reference: "pi_synthetic_free", external_id: binding.externalId, amount_minor: 50, currency: "USD", mode: "test", verified_at: new Date().toISOString() } };
      stored.view.service_payment = { status: "paid", reference: "pi_synthetic_free", amount_minor: 50, currency: "USD", mode: "test" };
      for (const task of stored.view.tasks) task.status = "needs_human";
      refresh(stored);
    });
  };
  const prepared = async () => { const r = await fresh(); return prepareFreeRegistrationTask(`${r.id}:event_tickets`, manager, 1); };
  return { browser, profile, options, rows, leases, fresh, prepared };
}
const task = (r: MissionRecord) => r.view.tasks.find(x => x.lane === "event_tickets")!;
const exact = (r: MissionRecord) => ({ proposal_id: task(r).proposal!.id, revision: task(r).proposal!.revision });

test("free registration private preparation and exact approval guards", async t => {
  const h = setup(t);
  const r = await h.fresh(), id = task(r).id;
  await assert.rejects(prepareFreeRegistrationTask(id, agent, 1), /manager/);
  await assert.rejects(prepareFreeRegistrationTask(id, { ...manager, workspace_id: "other" }, 1), /not found/);
  assert.equal(h.browser.calls.length, 0);
  const p = await prepareFreeRegistrationTask(id, manager, 1);
  await assert.rejects(decideTask(id, agent, exact(p), "approve"), /manager/);
  await assert.rejects(freeRegistrationReview(id, agent), /manager/);
  const review = await freeRegistrationReview(id, manager); assert.deepEqual(review.attendee, { name: h.profile.name, email: h.profile.email }); assert.equal(review.profile_unchanged, true);
  const approved = await decideTask(id, manager, exact(p), "approve");
  assert.equal(approved.reservations.length, 1); assert.equal(approved.reservations[0].amount_minor, 0); assert.equal(approved.view.budget.available_minor, 100); assert.equal(task(approved).approval!.link_state, "not_applicable_free");
  for (const mutate of [
    (v: MissionRecord) => { task(v).proposal!.action_hash = "f".repeat(64); },
    (v: MissionRecord) => { v.prepared_registrations![id].attendee.email = "different@example.test"; },
    (v: MissionRecord) => { v.prepared_registrations![id].snapshot.quantity = 2 as 1; },
    (v: MissionRecord) => { task(v).proposal!.merchant = "Other"; },
  ]) {
    const saved = structuredClone(h.rows.get(p.id)!); await mutateRecord(p.id, manager.workspace_id, mutate);
    await assert.rejects(resumeTask(id, agent, exact(p))); h.rows.set(p.id, saved);
  }
  h.profile.email = "changed@example.test"; await assert.rejects(resumeTask(id, agent, exact(p)), /profile changed/);
  assert.equal(h.browser.allowed.length, 0);
});
test("forged free action without a private preparation is denied", async t => {
  const h = setup(t), p = await h.prepared(), id = task(p).id;
  await mutateRecord(p.id, manager.workspace_id, r => { delete r.prepared_registrations; });
  await assert.rejects(decideTask(id, manager, exact(p), "approve"), /private action/); assert.equal(h.browser.allowed.length, 0);
});
test("concurrent resumes claim once and uncertain registration cannot replay or reprepare", async t => {
  const h = setup(t, { lost: true }), p = await h.prepared(), id = task(p).id;
  await decideTask(id, manager, exact(p), "approve");
  await Promise.allSettled([resumeTask(id, agent, exact(p)), resumeTask(id, agent, exact(p))]);
  const result = await getRecord(p.id, manager.workspace_id);
  assert.equal(h.browser.allowed.length, 1); assert.equal(result.reservations[0].state, "uncertain"); assert.equal(result.attempts[id].state, "uncertain");
  await resumeTask(id, agent, exact(p)); assert.equal(h.browser.allowed.length, 1);
  await assert.rejects(prepareFreeRegistrationTask(id, manager, 1), /protected|locked|reconcil/i);
});
test("clean pre-submit failure releases zero hold and requires fresh approval", async t => {
  const h = setup(t), p = await h.prepared(), id = task(p).id;
  await decideTask(id, manager, exact(p), "approve"); h.options.prefilled = true;
  const result = await resumeTask(id, agent, exact(p));
  assert.equal(result.reservations[0].state, "released"); assert.equal(result.prepared_registrations?.[id], undefined); assert.equal(task(result).approval!.state, "stale");
  await assert.rejects(resumeTask(id, agent, exact(p))); assert.equal(h.browser.allowed.length, 0);
});
test("prepare finishing after execution claims cannot replace proposal or release its hold", async t => {
  const h = setup(t), p = await h.prepared(), id = task(p).id;
  await decideTask(id, manager, exact(p), "approve");
  // Profile change forces a fresh asynchronous inspection rather than cached return.
  h.profile.company = "Changed company";
  h.options.onGoto = async () => { await mutateRecord(p.id, manager.workspace_id, r => { task(r).status = "executing"; r.attempts[id] = { state: "claimed", started_at: new Date().toISOString() }; }); };
  await assert.rejects(prepareFreeRegistrationTask(id, manager, 1), /protected|locked|busy/i);
  const current = await getRecord(p.id, manager.workspace_id); assert.equal(task(current).proposal!.id, exact(p).proposal_id); assert.equal(current.reservations[0].state, "reserved");
});
test("failed preparation finishing after execution claims cannot invalidate protected approval", async t => {
  const h = setup(t), p = await h.prepared(), id = task(p).id;
  await decideTask(id, manager, exact(p), "approve"); h.profile.company = "Changed company"; h.options.prefilled = true;
  h.options.onGoto = async () => { await mutateRecord(p.id, manager.workspace_id, r => { task(r).status = "executing"; r.attempts[id] = { state: "claimed", started_at: new Date().toISOString() }; }); };
  await assert.rejects(prepareFreeRegistrationTask(id, manager, 1), /protected|locked|busy/i);
  const current = await getRecord(p.id, manager.workspace_id); assert.equal(task(current).proposal!.id, exact(p).proposal_id); assert.equal(current.reservations[0].state, "reserved");
});
test("prepare finishing after constraint revision cannot write stale proposal", async t => {
  const h = setup(t), p = await h.prepared(), id = task(p).id; h.profile.company = "Changed company";
  h.options.onGoto = async () => { await reviseMission(p.id, manager, { expected_revision: 1, purchase_budget_minor: 110 }); };
  await assert.rejects(prepareFreeRegistrationTask(id, manager, 1), /changed/);
  assert.equal((await getRecord(p.id, manager.workspace_id)).view.revision, 2);
});
test("actual matching synthetic confirmation binds task proposal revision and repeats without new POST", async t => {
  const h = setup(t), p = await h.prepared(), id = task(p).id;
  await decideTask(id, manager, exact(p), "approve"); const result = await resumeTask(id, agent, exact(p));
  assert.equal(task(result).status, "confirmed"); assert.equal(result.reservations[0].state, "committed");
  const proof = task(result).evidence.find(e => e.kind === "merchant_confirmation")!;
  assert.equal(proof.task_id, id); assert.equal(proof.proposal_id, exact(p).proposal_id); assert.equal(proof.revision, 1); assert.equal(proof.mode, "live"); assert.equal(proof.confirmation_ref, task(result).confirmation_ref);
  await resumeTask(id, agent, exact(p)); assert.equal(h.browser.allowed.length, 1);
});

test("unpaid mission cannot prepare a free registration", async t => {
  const h = setup(t), r = await h.fresh();
  await mutateRecord(r.id, manager.workspace_id, stored => { delete stored.service_payment; stored.view.service_payment = { status: "payment_required", amount_minor: 50, currency: "USD", mode: "test" }; });
  await assert.rejects(prepareFreeRegistrationTask(task(r).id, manager, 1), /payment|fee/i); assert.equal(h.browser.calls.length, 0);
});
test("execution respects the shared event browser lease before any registration request", async t => {
  const h = setup(t), p = await h.prepared(), id = task(p).id;
  await decideTask(id, manager, exact(p), "approve");
  h.leases.set(`${manager.workspace_id}:event_tickets`, "synthetic-other-worker");
  await assert.rejects(resumeTask(id, agent, exact(p)), /browser|busy/i);
  assert.equal(h.browser.allowed.length, 0);
  const current = await getRecord(p.id, manager.workspace_id); assert.equal(current.reservations[0].state, "reserved"); assert.equal(current.attempts[id], undefined);
});
