import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ClientSessions } from "eve/client";
import { POST } from "../app/api/tasks/[id]/retry-research/route";
import { verifyLaneStopped } from "../src/browser/surfsky";
import { createMission, missionView, refresh } from "../src/server/missions";
import { beginResearchAttempt, finishResearchAttempt, researchFingerprint, researchGate } from "../src/server/research-policy";
import { runMissionResearch } from "../src/server/research";
import { getRecord, mutateRecord } from "../src/server/store";
import type { Principal } from "../src/server/auth";
import type { MissionInput } from "../src/shared/contracts";
import type { MissionRecord } from "../src/server/model";

const principal: Principal = { id: "verify-manager", workspace_id: "oct3-demo", role: "manager" };
const input: MissionInput = { objective: "Verify safe retries", currency: "USD", purchase_budget_minor: 90000, deadline: "2026-10-07T12:00:00-07:00", headcount: 6, requirements: { amazon: { category: "booth supplies", delivery_ref: "private-office-ref" }, fiverr: { category: "flyer design", brief: "A5 flyer", due_date: "2026-10-06T12:00:00-07:00" }, event_tickets: { event_url: "https://www.eventbrite.com/e/demo-tickets-123", date: "2026-10-07T12:00:00-07:00", quantity: 6, attendee_ref: "private-team-ref" } } };
function env(t: TestContext, values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    const before = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
  }
}

function failed(record: MissionRecord, now: number, cleanup: "confirmed" | "unconfirmed" = "confirmed") {
  const taskId = record.view.tasks[0].id;
  beginResearchAttempt(record, taskId, now);
  record.research_claims[taskId] = { revision: record.view.revision, expires_at: new Date(now + 150000).toISOString() };
  finishResearchAttempt(record, taskId, record.view.revision, { blocker_code: "provider_error", cleanup }, now + 100);
  record.view.tasks[0].status = "needs_human";
  return taskId;
}

test("independent retry policy and actual endpoint use isolated storage and mocked providers", async t => {
  const directory = await mkdtemp(join(tmpdir(), "oct3-research-verifier-"));
  env(t, { OCT3_STATE_PATH: join(directory, "state.json"), SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined, VERCEL: undefined, VERCEL_GIT_COMMIT_SHA: "verifier-version-1", OCT3_MANAGER_TOKEN: "verifier-manager-token", OCT3_AGENT_TOKEN: "verifier-agent-token", ANTHROPIC_API_KEY: "fake-local-only-key", SURFSKY_API_KEY: "fake-provider-key", SURFSKY_API_TOKEN: undefined, SURFSKY_API_BASE_URL: "https://region.surfsky.io", SURFSKY_PROXY_COUNTRY: "US" });
  t.after(() => rm(directory, { recursive: true, force: true }));
  let sequence = 0;
  const fresh = async () => (await createMission(structuredClone(input), principal, `research-verifier-${++sequence}`, "live")).record;

  await t.test("cooldown is 429; same technical failure exhausts two attempts; configuration repair respects cooldown", async () => {
    const record = await fresh(), now = Date.now(), taskId = failed(record, now);
    assert.equal(researchGate(record, taskId, now + 1000)?.status, 429);
    assert.equal(researchGate(record, taskId, now + 15100), null);
    assert.equal(beginResearchAttempt(record, taskId, now + 15100), 2);
    finishResearchAttempt(record, taskId, 1, { blocker_code: "provider_error", cleanup: "confirmed" }, now + 15200);
    assert.equal(researchGate(record, taskId, now + 40000)?.code, "research_retry_exhausted");
    const before = researchFingerprint();
    process.env.SURFSKY_PROXY_COUNTRY = "CA";
    try {
      assert.notEqual(researchFingerprint(), before);
      assert.equal(researchGate(record, taskId, now + 16000)?.code, "research_cooldown");
      assert.equal(beginResearchAttempt(record, taskId, now + 30200), 1);
    } finally { process.env.SURFSKY_PROXY_COUNTRY = "US"; }
  });

  await t.test("configuration changes cannot bypass uncertain cleanup or expired claims", async () => {
    const record = await fresh(), now = Date.now(), taskId = failed(record, now, "unconfirmed");
    process.env.SURFSKY_PROXY_COUNTRY = "CA";
    try {
      assert.equal(researchGate(record, taskId, now + 100000)?.code, "research_reconciliation_required");
      record.research_attempts![taskId].last_cleanup = "confirmed";
      record.research_claims[taskId] = { revision: 1, expires_at: new Date(now - 1).toISOString() };
      assert.equal(researchGate(record, taskId, now + 100000)?.code, "research_reconciliation_required");
      record.research_claims[taskId].expires_at = new Date(now + 200000).toISOString();
      assert.equal(researchGate(record, taskId, now + 100000)?.code, "task_busy");
    } finally { process.env.SURFSKY_PROXY_COUNTRY = "US"; }
  });

  await t.test("allocated, uncertain, committed and in-flight work is busy", async () => {
    const record = await fresh(), taskId = record.view.tasks[0].id;
    for (const state of ["reserved", "uncertain", "committed"] as const) {
      record.reservations = [{ id: "hold", task_id: taskId, proposal_id: "proposal", amount_minor: 100, state }];
      assert.equal(researchGate(record, taskId)?.code, "task_busy");
    }
    record.reservations = [];
    for (const status of ["executing", "confirmed"] as const) { record.view.tasks[0].status = status; assert.equal(researchGate(record, taskId)?.code, "task_busy"); }
  });

  await t.test("repeated worker calls on needs_human perform zero provider requests and expose no private ledger", async s => {
    const record = await fresh();
    await mutateRecord(record.id, principal.workspace_id, draft => {
      failed(draft, Date.now() - 30000);
      for (const task of draft.view.tasks) { task.status = "needs_human"; task.blocker = "Verifier handoff"; }
      refresh(draft);
    });
    let requests = 0;
    s.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("Unexpected provider request"); });
    const before = await getRecord(record.id, principal.workspace_id);
    await runMissionResearch(record.id, principal.workspace_id);
    await runMissionResearch(record.id, principal.workspace_id);
    assert.equal(requests, 0);
    const after = await getRecord(record.id, principal.workspace_id);
    assert.deepEqual(after.research_attempts, before.research_attempts);
    const view = await missionView(record.id, principal);
    assert.doesNotMatch(JSON.stringify(view), /fingerprint|research_attempts|research_claims|fake-provider-key|cooldown_until/);
    assert.ok(!JSON.stringify(view).includes(researchFingerprint()));
  });

  await t.test("provider reconciliation requires exactly one valid exact-lane stopped profile", async s => {
    let rows: unknown[] = [];
    const requests: string[] = [];
    s.mock.method(globalThis, "fetch", async (resource: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(resource)); requests.push(url.pathname);
      assert.equal(init?.method, "GET");
      assert.equal(url.pathname, "/profiles");
      return Response.json(rows);
    });
    for (const candidate of [[], [{ title: "oct3-fiverr", uuid: "other-profile", status: "stopped" }], [{ title: "oct3-amazon", uuid: "exact-profile", status: "running" }], [{ title: "oct3-amazon", uuid: "exact-profile" }], [{ title: "oct3-amazon", uuid: "exact-profile", status: "unknown" }], [{ title: "oct3-amazon", uuid: "exact-profile", status: "stopped" }, { title: "oct3-amazon", uuid: "duplicate-profile", status: "stopped" }]]) {
      rows = candidate; assert.equal((await verifyLaneStopped("amazon")).confirmed, false);
    }
    rows = [{ title: "oct3-amazon", uuid: "exact-profile", status: "stopped" }, { title: "oct3-fiverr", uuid: "other-profile", status: "running" }];
    assert.equal((await verifyLaneStopped("amazon")).confirmed, true);
    assert.equal(requests.length, 7);
  });

  await t.test("actual retry route blocks unresolved state then queues the same lane/revision without changing other lanes", async s => {
    const record = await fresh();
    const taskId = record.view.tasks[0].id;
    await mutateRecord(record.id, principal.workspace_id, draft => {
      failed(draft, Date.now() - 30000, "unconfirmed");
      draft.research_claims[taskId] = { revision: 1, expires_at: new Date(Date.now() - 1000).toISOString() };
      draft.view.tasks[1].status = "options_ready";
      draft.view.tasks[1].progress = "Other lane observations must survive";
      draft.view.tasks[2].status = "needs_human";
      draft.view.tasks[2].blocker = "Independent ticket handoff";
      refresh(draft);
    });
    let rows: unknown[] = [];
    let dispatches = 0, dispatchedMessage = "";
    s.mock.method(globalThis, "fetch", async (resource: string | URL | Request) => {
      assert.equal(new URL(String(resource)).pathname, "/profiles", "Only profile reconciliation may hit the mocked provider");
      return Response.json(rows);
    });
    s.mock.method(ClientSessions.prototype, "create", (async (options: { message: string }) => {
      dispatches++; dispatchedMessage = options.message;
      return { session: { state: { sessionId: "independent-verifier-session" } } };
    }) as any);
    const request = () => new Request(`https://oct3.example/api/tasks/${encodeURIComponent(taskId)}/retry-research`, { method: "POST", headers: { authorization: "Bearer verifier-manager-token", "content-type": "application/json" }, body: JSON.stringify({ expected_revision: 1 }) });
    const before = await getRecord(record.id, principal.workspace_id);
    for (const candidate of [[], [{ title: "oct3-amazon", uuid: "exact-profile", status: "running" }], [{ title: "oct3-amazon", uuid: "exact-profile", status: "unknown" }]]) {
      rows = candidate;
      const response = await POST(request(), { params: Promise.resolve({ id: taskId }) });
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, "research_reconciliation_required");
    }
    assert.equal(dispatches, 0);
    rows = [{ title: "oct3-amazon", uuid: "exact-profile", status: "stopped" }];
    const response = await POST(request(), { params: Promise.resolve({ id: taskId }) });
    const body = await response.json();
    assert.equal(response.status, 202, JSON.stringify(body));
    const after = await getRecord(record.id, principal.workspace_id);
    assert.equal(after.id, before.id);
    assert.equal(after.view.revision, before.view.revision);
    assert.equal(after.view.tasks[0].status, "queued");
    assert.equal(after.research_claims[taskId], undefined);
    assert.equal(after.research_attempts![taskId].last_cleanup, "confirmed");
    assert.deepEqual(after.view.tasks.slice(1), before.view.tasks.slice(1));
    assert.equal(dispatches, 1);
    assert.ok(dispatchedMessage.includes(`task ${taskId}`));
    assert.ok(dispatchedMessage.includes("revision 1"));
    assert.doesNotMatch(JSON.stringify(body), /fingerprint|research_attempts|research_claims|fake-provider-key|cooldown_until/);
    const repeated = await POST(request(), { params: Promise.resolve({ id: taskId }) });
    assert.equal(repeated.status, 409);
    assert.equal((await repeated.json()).error.code, "task_busy");
    assert.equal(dispatches, 1);
  });
});
