import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { authenticate, login, requireAuth, type Principal } from "../src/server/auth";
import { AppError } from "../src/server/errors";
import { createMission, decideTask, missionView, refresh, resumeTask, reviseMission, runFixture } from "../src/server/missions";
import { acquireLane, getRecord, mutateRecord, releaseLane } from "../src/server/store";
import type { MissionInput } from "../src/shared/contracts";

const manager: Principal = { id: "verify-manager", workspace_id: "verify-workspace", role: "manager" };
const agent: Principal = { id: "verify-agent", workspace_id: manager.workspace_id, role: "agent" };
const input: MissionInput = {
  objective: "Prepare six people for the expo", currency: "USD", purchase_budget_minor: 90000,
  deadline: "2026-10-07T12:00:00-07:00", headcount: 6,
  requirements: {
    amazon: { category: "booth supplies", delivery_ref: "office" },
    fiverr: { category: "flyer design", brief: "A5 flyer", due_date: "2026-10-06T12:00:00-07:00" },
    event_tickets: { event_url: "https://www.eventbrite.com/e/demo-tickets-123", date: "2026-10-07T12:00:00-07:00", quantity: 6, attendee_ref: "team" },
  },
};
const code = (expected: string) => (error: unknown) => error instanceof AppError && error.code === expected;
const exact = (task: Awaited<ReturnType<typeof runFixture>>["view"]["tasks"][number]) => ({ proposal_id: task.proposal!.id, revision: task.proposal!.revision });

test("DATA invariants against isolated atomic local storage", async t => {
  const directory = await mkdtemp(join(tmpdir(), "oct3-verifier-"));
  const changes: Record<string, string | undefined> = { OCT3_STATE_PATH: join(directory, "state.json"), SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined, VERCEL: undefined, OCT3_AGENT_TOKEN: "verify-agent-token", OCT3_MANAGER_TOKEN: "verify-manager-token" };
  for (const [name, value] of Object.entries(changes)) {
    const previous = process.env[name];
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
  }
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  let number = 0;
  async function planned() {
    const created = await createMission(structuredClone(input), manager, `verify-plan-${++number}`, "fixture");
    return runFixture(created.record.id, manager.workspace_id);
  }

  await t.test("caller and manager credentials are distinct, manager cookie is signed and origin bound", () => {
    const request = (headers: Record<string, string>, method = "GET") => new Request("https://oct3.example/api/tasks/id/approve", { method, headers });
    assert.equal(authenticate(request({})), null);
    assert.equal(authenticate(request({ authorization: "Bearer invalid" })), null);
    assert.equal(authenticate(request({ authorization: "Bearer verify-agent-token" }))?.role, "agent");
    assert.throws(() => requireAuth(request({ authorization: "Bearer verify-agent-token" }, "POST"), "manager"), code("manager_required"));
    const cookie = login(request({ origin: "https://oct3.example" }, "POST"), "verify-manager-token").split(";")[0];
    assert.equal(requireAuth(request({ cookie }, "POST"), "manager").role, "manager");
    assert.throws(() => requireAuth(request({ cookie, origin: "https://attacker.example" }, "POST"), "manager"), code("invalid_origin"));
    assert.equal(authenticate(request({ cookie: cookie + "changed" })), null);
  });

  await t.test("racing duplicate submissions return one durable mission and changed input conflicts", async () => {
    const records = await Promise.all(Array.from({ length: 8 }, () => createMission(structuredClone(input), agent, "concurrent-key", "fixture")));
    assert.equal(new Set(records.map(x => x.record.id)).size, 1);
    assert.equal(records.filter(x => x.created).length, 1);
    await assert.rejects(createMission({ ...input, purchase_budget_minor: 65000 }, agent, "concurrent-key", "fixture"), code("idempotency_conflict"));
    const other: Principal = { ...agent, workspace_id: "other-workspace" };
    await assert.rejects(missionView(records[0].record.id, other), code("mission_not_found"));
    const separate = await createMission(structuredClone(input), other, "concurrent-key", "fixture");
    assert.notEqual(separate.record.id, records[0].record.id);
    assert.equal((await getRecord(records[0].record.id, manager.workspace_id)).view.tasks.length, 3);
  });

  await t.test("two racing commitments cannot reserve the same remaining budget", async () => {
    const mission = await planned();
    await mutateRecord(mission.id, manager.workspace_id, record => {
      record.input.purchase_budget_minor = 50000;
      for (const task of record.view.tasks) { task.proposal!.total_minor = 30000; task.proposal!.subtotal_minor = 30000; }
      refresh(record);
    });
    const attempts = await Promise.allSettled(mission.view.tasks.slice(0, 2).map(task => decideTask(task.id, manager, exact(task), "approve")));
    assert.equal(attempts.filter(x => x.status === "fulfilled").length, 1);
    const failed = attempts.find(x => x.status === "rejected") as PromiseRejectedResult;
    assert.ok(code("budget_exceeded")(failed.reason));
    const persisted = await getRecord(mission.id, manager.workspace_id);
    assert.equal(persisted.view.budget.reserved_minor, 30000);
    assert.equal(persisted.view.budget.available_minor, 20000);
  });

  await t.test("approval repeats once, caller approval is denied, and revisions invalidate every safe hold", async () => {
    const mission = await planned();
    const task = mission.view.tasks[0];
    await assert.rejects(decideTask(task.id, agent, exact(task), "approve"), code("manager_required"));
    await Promise.all(Array.from({ length: 4 }, () => decideTask(task.id, manager, exact(task), "approve")));
    const approved = await getRecord(mission.id, manager.workspace_id);
    assert.equal(approved.reservations.filter(x => x.state === "reserved").length, 1);
    const changed = await reviseMission(mission.id, manager, { expected_revision: 1, purchase_budget_minor: 65000 });
    assert.equal(changed.view.revision, 2);
    assert.equal(changed.view.budget.reserved_minor, 0);
    assert.equal(changed.view.budget.proposed_minor, 58800);
    assert.equal(changed.view.tasks.find(x => x.lane === "event_tickets")!.proposal!.quantity, 6);
    await assert.rejects(decideTask(task.id, manager, exact(task), "approve"), code("stale_proposal"));
    await assert.rejects(resumeTask(task.id, agent, exact(task)), code("stale_proposal"));
    await assert.rejects(reviseMission(mission.id, manager, { expected_revision: 1, purchase_budget_minor: 60000 }), code("revision_conflict"));
  });

  await t.test("uncertain spend stays held through retries and cannot be rejected or underfunded", async () => {
    const mission = await planned();
    const task = mission.view.tasks[0];
    await decideTask(task.id, manager, exact(task), "approve");
    await mutateRecord(mission.id, manager.workspace_id, record => {
      record.reservations[0].state = "uncertain";
      record.view.tasks[0].status = "needs_human";
      record.view.tasks[0].approval!.link_state = "succeeded";
      record.view.service_payment.status = "paid";
      refresh(record);
    });
    await assert.rejects(decideTask(task.id, manager, exact(task), "reject"), code("execution_locked"));
    await assert.rejects(reviseMission(mission.id, manager, { expected_revision: 1, purchase_budget_minor: 10000 }), code("allocated_budget"));
    await resumeTask(task.id, agent, exact(task));
    const repeated = await resumeTask(task.id, agent, exact(task));
    assert.equal(repeated.view.tasks[0].status, "needs_human");
    assert.equal(repeated.view.tasks[0].confirmation_ref, undefined);
    assert.equal(repeated.reservations.length, 1);
    assert.equal(repeated.view.budget.uncertain_minor, task.proposal!.total_minor);
    assert.notEqual(repeated.view.status, "completed");
    const revised = await reviseMission(mission.id, manager, { expected_revision: 1, purchase_budget_minor: 65000 });
    assert.equal(revised.view.budget.uncertain_minor, task.proposal!.total_minor);
    assert.equal(revised.view.tasks[0].proposal?.id, task.proposal!.id);
  });

  await t.test("a completed commitment remains completed when resume is retried", async () => {
    const mission = await planned();
    const task = mission.view.tasks[0];
    await decideTask(task.id, manager, exact(task), "approve");
    await mutateRecord(mission.id, manager.workspace_id, record => {
      record.reservations[0].state = "committed";
      record.view.tasks[0].status = "confirmed";
      record.view.tasks[0].confirmation_ref = "test-provider-confirmation";
      record.view.tasks[0].proposal!.expires_at = "2000-01-01T00:00:00Z";
      record.view.tasks[0].evidence.push({ id: "verify-confirmation", task_id: task.id, mode: "test", source_url: task.proposal!.source_url, observed_at: new Date().toISOString(), title: "Synthetic confirmed commitment", detail: "Verification seed, no live order", confirmation_ref: "test-provider-confirmation" });
      refresh(record);
    });
    const repeated = await resumeTask(task.id, agent, exact(task));
    assert.equal(repeated.view.tasks[0].status, "confirmed");
    assert.equal(repeated.view.budget.committed_minor, task.proposal!.total_minor);
  });

  await t.test("resume does not downgrade or reclaim an already executing attempt", async () => {
    const mission = await planned();
    const task = mission.view.tasks[0];
    await decideTask(task.id, manager, exact(task), "approve");
    await mutateRecord(mission.id, manager.workspace_id, record => {
      record.view.tasks[0].status = "executing";
      record.view.tasks[0].progress = "Waiting for the merchant response";
      record.attempts["already-claimed"] = { state: "claimed", started_at: new Date().toISOString() };
      refresh(record);
    });
    await assert.rejects(reviseMission(mission.id, manager, { expected_revision: 1, purchase_budget_minor: 65000 }), code("execution_in_flight"));
    const repeated = await resumeTask(task.id, agent, exact(task));
    assert.equal(repeated.view.tasks[0].status, "executing");
    assert.equal(repeated.view.tasks[0].progress, "Waiting for the merchant response");
    assert.deepEqual(Object.keys(repeated.attempts), ["already-claimed"]);
    assert.equal(repeated.reservations.length, 1);
  });

  await t.test("lane leases exclude competitors and another owner cannot release them", async () => {
    const attempts = await Promise.all([acquireLane(manager.workspace_id, "amazon", "owner-a"), acquireLane(manager.workspace_id, "amazon", "owner-b")]);
    assert.equal(attempts.filter(Boolean).length, 1);
    const winner = attempts[0] ? "owner-a" : "owner-b";
    const loser = attempts[0] ? "owner-b" : "owner-a";
    await releaseLane(manager.workspace_id, "amazon", loser);
    assert.equal(await acquireLane(manager.workspace_id, "amazon", loser), false);
    await releaseLane(manager.workspace_id, "amazon", winner);
    assert.equal(await acquireLane(manager.workspace_id, "amazon", loser), true);
  });

  await t.test("hosted missions fail closed when durable Supabase storage is absent", async () => {
    process.env.VERCEL = "1";
    try { await assert.rejects(createMission(structuredClone(input), agent, "hosted-no-db", "fixture"), code("storage_not_configured")); }
    finally { delete process.env.VERCEL; }
  });
});
