import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createMission, decideTask, approvalRequirement, runFixture } from "../src/server/missions";
import { getRecord, mutateRecord } from "../src/server/store";
import { demoApprovalEnabled } from "../src/server/approval-policy";
import { confirmAndExecute } from "../src/server/confirm-and-execute";
import { AppError } from "../src/server/errors";
import type { Principal } from "../src/server/auth";
import { defaultInput } from "../src/client/preview";
import { POST as approveRoute } from "../app/api/tasks/[id]/approve/route";
import { POST as resumeRoute } from "../app/api/tasks/[id]/resume/route";
import { approveWithFakePasskey, fakeVerifiedApproval } from "./helpers/fake-webauthn";

// The bearer manager token always maps to this principal (src/server/auth.ts).
const routeManager: Principal = { id: "demo-manager", workspace_id: "oct3-demo", role: "manager" };
const code = (value: string) => (error: unknown) => error instanceof AppError && error.code === value;

function setEnv(t: { after: (fn: () => void) => void }, changes: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(changes)) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
}

async function plannedMission(principal: Principal, key: string, mode: "fixture" | "live") {
  const made = await createMission(structuredClone(defaultInput), principal, key, "fixture");
  const planned = await runFixture(made.record.id, principal.workspace_id);
  // A fixture plan gives a real stored proposal; flipping the mode makes it a live action.
  if (mode === "live") await mutateRecord(planned.id, principal.workspace_id, record => { record.view.mode = "live"; });
  const task = planned.view.tasks[0];
  return { id: planned.id, task, exact: { proposal_id: task.proposal!.id, revision: task.proposal!.revision } };
}

const call = (path: string, body: unknown) => new Request(`http://localhost:3003${path}`, {
  method: "POST", headers: { authorization: "Bearer synthetic-live-gate-manager", "content-type": "application/json" }, body: JSON.stringify(body),
});

test("demo mode never approves a live mission", async t => {
  const directory = await mkdtemp(join(tmpdir(), "cue-live-gate-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  setEnv(t, {
    OCT3_STATE_PATH: join(directory, "state.json"), SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined, VERCEL: undefined,
    LINK_ACCESS_TOKEN: undefined, LINK_AUTH_FILE: undefined, OCT3_MANAGER_TOKEN: "synthetic-live-gate-manager",
    OCT3_DEMO_MODE: "true", OCT3_DEMO_SKIP_PASSKEY: "true",
  });
  t.mock.method(globalThis, "fetch", () => { throw new Error("live approval gate tests must not access the network"); });

  await t.test("demo switches are on for this test", () => assert.equal(demoApprovalEnabled(), true));

  await t.test("approve route refuses a live approval without a passkey and holds no budget", async () => {
    const { id, task, exact } = await plannedMission(routeManager, "live-gate-route-0001", "live");
    const response = await approveRoute(call(`/api/tasks/${task.id}/approve`, exact), { params: Promise.resolve({ id: task.id }) });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "passkey_required");
    const saved = await getRecord(id, routeManager.workspace_id);
    assert.equal(saved.reservations.length, 0);
    assert.equal(saved.view.tasks[0].approval?.state, "pending");
  });

  await t.test("MCP confirm_and_execute cannot approve and resume a live mission in one call", async () => {
    const { id, task, exact } = await plannedMission(routeManager, "live-gate-mcp-0001", "live");
    const context = { params: Promise.resolve({ id: task.id }) };
    let resumed = 0;
    const response = await confirmAndExecute(
      () => approveRoute(call(`/api/tasks/${task.id}/approve`, exact), context),
      async () => { resumed++; return resumeRoute(call(`/api/tasks/${task.id}/resume`, exact), context); });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "passkey_required");
    assert.equal(resumed, 0);
    assert.equal((await getRecord(id, routeManager.workspace_id)).reservations.length, 0);
  });

  await t.test("MCP confirm_and_execute still confirms a fixture mission and stops at the handoff", async () => {
    const { id, task, exact } = await plannedMission(routeManager, "live-gate-fixture-0001", "fixture");
    const context = { params: Promise.resolve({ id: task.id }) };
    const response = await confirmAndExecute(
      () => approveRoute(call(`/api/tasks/${task.id}/approve`, exact), context),
      () => resumeRoute(call(`/api/tasks/${task.id}/resume`, exact), context));
    assert.equal(response.status, 200);
    const saved = await getRecord(id, routeManager.workspace_id);
    assert.equal(saved.view.tasks[0].approval?.state, "approved");
    assert.equal(saved.view.tasks[0].status, "needs_human");
    assert.equal(saved.view.budget.committed_minor, 0);
  });

  await t.test("MCP confirm_and_execute continues a live plan already approved with a passkey", async () => {
    const { id, task, exact } = await plannedMission(routeManager, "live-gate-after-passkey-0001", "live");
    // The real passkey checks with a fake authenticator stand in for the board's ceremony.
    await approveWithFakePasskey(task.id, routeManager, exact);
    const context = { params: Promise.resolve({ id: task.id }) };
    const response = await confirmAndExecute(
      () => approveRoute(call(`/api/tasks/${task.id}/approve`, exact), context),
      () => resumeRoute(call(`/api/tasks/${task.id}/resume`, exact), context));
    assert.equal(response.status, 200);
    const saved = await getRecord(id, routeManager.workspace_id);
    assert.equal(saved.reservations.filter(r => r.state === "reserved").length, 1);
    assert.equal(saved.view.budget.committed_minor, 0);
  });

  await t.test("a live approval needs an approver named in the installation policy", async () => {
    const outsider: Principal = { id: "not-in-policy", workspace_id: "live-gate-outsider", role: "manager" };
    const { task, exact } = await plannedMission(outsider, "live-gate-outsider-0001", "live");
    const proof = await fakeVerifiedApproval(task.id, outsider, exact);
    await assert.rejects(decideTask(task.id, outsider, exact, "approve", proof), code("approver_not_allowed"));
  });

  await t.test("a missing installation policy refuses live approval and still allows fixtures", async t2 => {
    setEnv(t2, { OCT3_POLICY_FILE: join(directory, "no-policy.json") });
    const live = await plannedMission(routeManager, "live-gate-nopolicy-0001", "live");
    const proof = await fakeVerifiedApproval(live.task.id, routeManager, live.exact);
    await assert.rejects(decideTask(live.task.id, routeManager, live.exact, "approve", proof), code("installation_policy_missing"));
    const fixture = await plannedMission(routeManager, "live-gate-nopolicy-0002", "fixture");
    const approved = await decideTask(fixture.task.id, routeManager, fixture.exact, "approve");
    assert.equal(approved.reservations.length, 1);
  });
});

test("demo approval is off by default and in .env.example", async t => {
  setEnv(t, { OCT3_DEMO_MODE: undefined, OCT3_DEMO_SKIP_PASSKEY: undefined });
  assert.equal(demoApprovalEnabled(), false);
  const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(example, /^OCT3_DEMO_MODE=false$/m);
});
