import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import { chromium } from "playwright-core";
import { authenticate, login, requireAuth, type Principal } from "../src/server/auth";
import { createMission, decideTask, resumeTask, reviseMission, runFixture } from "../src/server/missions";
import { getRecord, mutateRecord } from "../src/server/store";
import { createComponentToolkit } from "../src/browser/components";
import type { MissionInput, Proposal } from "../src/shared/contracts";

const manager: Principal = { id: "guard-manager", workspace_id: "guard-workspace", role: "manager" };
const caller: Principal = { ...manager, id: "guard-caller", role: "agent" };
const input: MissionInput = {
  objective: "Synthetic guard verification", currency: "USD", purchase_budget_minor: 90000,
  deadline: "2026-10-07T12:00:00Z", headcount: 6,
  requirements: {
    amazon: { category: "supplies", delivery_ref: "synthetic" },
    fiverr: { category: "flyer", brief: "Synthetic fixture only", due_date: "2026-10-06T12:00:00Z" },
    event_tickets: { event_url: "https://www.eventbrite.com/e/synthetic-tickets-123", date: "2026-10-07T12:00:00Z", quantity: 6, attendee_ref: "synthetic" },
  },
};

test("negative deterministic authorization and stored-approval guards", async t => {
  const directory = await mkdtemp(join(tmpdir(), "oct3-guardrails-"));
  const changes: Record<string, string | undefined> = {
    OCT3_STATE_PATH: join(directory, "state.json"), SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined,
    VERCEL: undefined, OCT3_MANAGER_TOKEN: "synthetic-manager-token", OCT3_AGENT_TOKEN: "synthetic-agent-token",
  };
  for (const [key, value] of Object.entries(changes)) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  t.after(() => rm(directory, { recursive: true, force: true }));
  t.mock.method(globalThis, "fetch", () => { throw new Error("Guard tests must not access the network"); });
  let sequence = 0;
  async function planned() {
    const { record } = await createMission(structuredClone(input), manager, `guard-fixture-${++sequence}`, "fixture");
    return runFixture(record.id, manager.workspace_id);
  }
  const exact = (record: Awaited<ReturnType<typeof planned>>) => ({ proposal_id: record.view.tasks[0].proposal!.id, revision: record.view.tasks[0].proposal!.revision });

  await t.test("invalid bearer header cannot exempt a manager-cookie mutation from origin validation", () => {
    const url = "https://cue.example/api/tasks/task/approve";
    const cookie = login(new Request(url, { method: "POST", headers: { origin: "https://cue.example" } }), "synthetic-manager-token").split(";")[0];
    const request = new Request(url, { method: "POST", headers: { cookie, authorization: "Bearer invalid", origin: "https://other.example" } });
    assert.throws(() => requireAuth(request, "manager"), /mission board|Sign in/);
  });

  await t.test("malformed bearer syntax and signed cookie expiry/segments fail closed", () => {
    const url = "https://cue.example/api/missions";
    for (const authorization of ["synthetic-manager-token", "Basic synthetic-manager-token", "Bearer synthetic-manager-token extra"]) {
      assert.equal(authenticate(new Request(url, { headers: { authorization } })), null);
    }
    for (const expires of [undefined, null, "99999999999999", "not-a-date", 1.5, Date.now() - 1000]) {
      const payload = Buffer.from(JSON.stringify({ role: "manager", expires })).toString("base64url");
      const signature = createHmac("sha256", "synthetic-manager-token").update(payload).digest("base64url");
      assert.equal(authenticate(new Request(url, { headers: { cookie: `oct3_session=${payload}.${signature}` } })), null, String(expires));
    }
    const cookie = login(new Request(url), "synthetic-manager-token").split(";")[0];
    assert.equal(authenticate(new Request(url, { headers: { cookie: `${cookie}.extra` } })), null);
  });

  await t.test("constraint service rejects a caller principal even when HTTP role wrapper is bypassed", async () => {
    const record = await planned();
    await assert.rejects(reviseMission(record.id, caller, { expected_revision: 1, purchase_budget_minor: 65000 }), /manager/i);
    assert.equal((await getRecord(record.id, manager.workspace_id)).view.revision, 1);
  });

  await t.test("missing or malformed proposal expiry fails closed before approval", async () => {
    const record = await planned();
    await mutateRecord(record.id, manager.workspace_id, stored => { stored.view.tasks[0].proposal!.expires_at = "not-a-date"; });
    await assert.rejects(decideTask(record.view.tasks[0].id, manager, exact(record), "approve"));
    assert.equal((await getRecord(record.id, manager.workspace_id)).reservations.length, 0);
  });

  await t.test("negative stored proposal amount cannot mint available budget", async () => {
    const record = await planned();
    await mutateRecord(record.id, manager.workspace_id, stored => { stored.view.tasks[0].proposal!.total_minor = -10000; });
    await assert.rejects(decideTask(record.view.tasks[0].id, manager, exact(record), "approve"));
    assert.equal((await getRecord(record.id, manager.workspace_id)).view.budget.available_minor, input.purchase_budget_minor);
  });

  await t.test("resume rejects approval bound to a different stored proposal", async () => {
    const record = await planned();
    await decideTask(record.view.tasks[0].id, manager, exact(record), "approve");
    await mutateRecord(record.id, manager.workspace_id, stored => { stored.view.tasks[0].approval!.proposal_id = "different-proposal"; });
    await assert.rejects(resumeTask(record.view.tasks[0].id, caller, exact(record)));
  });

  await t.test("resume rejects a released reservation despite an approved state", async () => {
    const record = await planned();
    await decideTask(record.view.tasks[0].id, manager, exact(record), "approve");
    await mutateRecord(record.id, manager.workspace_id, stored => { stored.reservations[0].state = "released"; });
    await assert.rejects(resumeTask(record.view.tasks[0].id, caller, exact(record)));
  });

  await t.test("same-ID/revision approval cannot survive any changed proposal field", async () => {
    const changes: Partial<Proposal>[] = [
      { merchant: "Different merchant" }, { source_url: "https://www.amazon.com/dp/OTHER" },
      { title: "Different action" }, { option_id: "different-option" }, { quantity: 2 },
      { recipient_ref: "different-recipient" }, { deadline: "2026-10-08T12:00:00Z" },
      { expires_at: "2099-01-01T00:00:00Z" }, { task_id: "different-task" },
      { currency: "EUR" as "USD" }, { total_minor: 1 }, { subtotal_minor: 1 },
      { tax_minor: 1 }, { shipping_minor: 1 }, { fees_minor: 1 },
    ];
    for (const change of changes) {
      const record = await planned();
      const id = record.view.tasks[0].id;
      await decideTask(id, manager, exact(record), "approve");
      await mutateRecord(record.id, manager.workspace_id, stored => { Object.assign(stored.view.tasks[0].proposal!, change); });
      await assert.rejects(resumeTask(id, caller, exact(record)), JSON.stringify(change));
      await assert.rejects(decideTask(id, manager, exact(record), "approve"), JSON.stringify(change));
    }
  });

  await t.test("proposal key ordering alone preserves canonical approval and its single hold", async () => {
    const record = await planned();
    const id = record.view.tasks[0].id;
    await decideTask(id, manager, exact(record), "approve");
    await mutateRecord(record.id, manager.workspace_id, stored => {
      stored.view.tasks[0].proposal = Object.fromEntries(Object.entries(stored.view.tasks[0].proposal!).reverse()) as unknown as Proposal;
    });
    await decideTask(id, manager, exact(record), "approve");
    const resumed = await resumeTask(id, caller, exact(record));
    assert.equal(resumed.reservations.length, 1);
    assert.equal(resumed.view.tasks[0].status, "needs_human");
    assert.equal(resumed.view.tasks[0].confirmation_ref, undefined);
  });

  await t.test("ordinary expired approvals and cross-workspace mutation remain denied", async () => {
    const record = await planned();
    await mutateRecord(record.id, manager.workspace_id, stored => { stored.view.tasks[0].proposal!.expires_at = "2000-01-01T00:00:00Z"; });
    await assert.rejects(decideTask(record.view.tasks[0].id, manager, exact(record), "approve"), /expired/);
    await assert.rejects(resumeTask(record.view.tasks[0].id, caller, exact(record)), /expired/);
    await assert.rejects(reviseMission(record.id, { ...manager, workspace_id: "other-workspace" }, { expected_revision: 1, purchase_budget_minor: 65000 }), /not found/i);
  });
});

test("remote merchant component writes are blocked before page event handlers can submit", async t => {
  const executablePath = process.env.OCT3_TEST_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!existsSync(executablePath)) return t.skip("Local Chromium required for no-network DOM repro");
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  let submittedRequests = 0;
  await context.route("**/*", async route => {
    if (route.request().method() === "POST") submittedRequests++;
    await route.fulfill({ contentType: "text/html", body: "<!doctype html><body>Intercepted locally</body>" });
  });
  const page = await context.newPage();
  const origin = "https://synthetic-merchant.test";
  await page.goto(origin);
  await page.setContent('<form method="post" action="/place-order" target="receipt"><label>Project<input id="project" oninput="this.form.requestSubmit()"></label></form><iframe name="receipt"></iframe>');
  const kit = createComponentToolkit(page, { task_id: "synthetic-only", allowedOrigins: [origin], readOnly: false, allowedFields: [{ id: "project" }] });
  const inspection = await kit.inspectTaskPage();
  assert.equal(inspection.ok, true);
  if (!inspection.ok) return;
  const snapshot_id = inspection.snapshot.snapshot_id;
  const control_id = inspection.snapshot.controls[0].control_id;
  const plan = await kit.planTaskFields({ snapshot_id, fields: [{ control_id, value: "Synthetic brief" }] });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.planned.length, 0);
  assert.equal(plan.blocked.length, 1);
  const requestObserved = page.waitForRequest(request => request.method() === "POST", { timeout: 1500 }).then(() => true, () => false);
  const fill = await kit.fillTaskComponent({ snapshot_id, control_id, value: "Synthetic brief" });
  assert.equal(fill.ok, false);
  if (!fill.ok) assert.equal(fill.code, "field_not_allowed");
  assert.equal(await requestObserved, false);
  assert.equal(submittedRequests, 0, "A preparatory fill dispatched a locally intercepted final-submit POST through merchant oninput JavaScript");
});
