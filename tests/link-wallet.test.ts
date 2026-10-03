import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { CreateSpendRequestParams, SpendRequest } from "@stripe/link-sdk";
import type { Principal } from "../src/server/auth";
import { createMission, approvalRequirement, decideTask, reviseMission } from "../src/server/missions";
import { buildLinkRequest, cancelLinkWallet, resumeLinkWallet, verifyLinkRequest } from "../src/server/link-wallet";
import { getRecord, mutateRecord } from "../src/server/store";
import type { MissionInput, Proposal } from "../src/shared/contracts";
import { GET as walletRoute } from "../app/api/wallet/route";
import { POST as cancelRoute } from "../app/api/tasks/[id]/wallet/cancel/route";

const manager: Principal = { id: "wallet-manager", workspace_id: "wallet-test", role: "manager" };
const agent: Principal = { id: "wallet-agent", workspace_id: "wallet-test", role: "agent" };
const input: MissionInput = {
  objective: "Verify a synthetic exact checkout without buying anything",
  currency: "USD",
  purchase_budget_minor: 5000,
  deadline: "2099-10-07T12:00:00.000Z",
  headcount: 1,
  requirements: {
    amazon: { category: "toothpaste", delivery_ref: "saved-private-reference" },
    fiverr: { category: "music", brief: "synthetic", due_date: "2099-10-06T12:00:00.000Z" },
    event_tickets: { event_url: "https://luma.com/OpenTogether", date: "2099-10-07T12:00:00.000Z", quantity: 1, attendee_ref: "saved-private-attendee" },
  },
};

const code = (wanted: string) => (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === wanted);
const exact = (proposal: Proposal) => ({ proposal_id: proposal.id, revision: proposal.revision });

function remoteFrom(body: CreateSpendRequestParams, status = "created", overrides: Partial<SpendRequest> = {}): SpendRequest {
  return {
    id: "lsrq_synthetic_12345",
    status,
    created_at: "2026-10-03T00:00:00.000Z",
    updated_at: "2026-10-03T00:00:00.000Z",
    amount: body.amount,
    currency: body.currency,
    merchant_name: body.merchant_name,
    merchant_url: body.merchant_url,
    credential_type: body.credential_type,
    line_items: structuredClone(body.line_items),
    totals: structuredClone(body.totals),
    metadata: structuredClone(body.metadata),
    ...overrides,
  };
}

test("Link wallet exact-action and reconciliation boundary", async t => {
  const directory = await mkdtemp(join(tmpdir(), "oct3-link-wallet-"));
  const statePath = join(directory, "state.json");
  const env: Record<string, string | undefined> = {
    OCT3_STATE_PATH: statePath,
    SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    VERCEL: undefined,
    LINK_ACCESS_TOKEN: "synthetic-link-access-token-never-log",
    LINK_AUTH_FILE: undefined,
    OCT3_LINK_MODE: "test",
    OCT3_MANAGER_TOKEN: "synthetic-manager",
    OCT3_AGENT_TOKEN: "synthetic-agent",
  };
  for (const [key, value] of Object.entries(env)) {
    const before = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
  }
  t.after(() => rm(directory, { recursive: true, force: true }));

  let sequence = 0;
  async function planned(options: { approve?: boolean; checkout?: boolean } = {}) {
    const { record } = await createMission(structuredClone(input), manager, `wallet-test-${++sequence}`, "live");
    const taskId = `${record.id}:amazon`;
    const proposal: Proposal = {
      id: `proposal-${sequence}`, task_id: taskId, revision: 1, option_id: `option-${sequence}`,
      merchant: "Amazon", title: "Synthetic toothpaste single tube", source_url: "https://www.amazon.com/dp/B0195UTBKA", quantity: 1,
      recipient_ref: "saved-private-reference", deadline: input.deadline,
      subtotal_minor: 399, tax_minor: 31, shipping_minor: 0, fees_minor: 0, total_minor: 430,
      currency: "USD", expires_at: "2099-10-03T00:00:00.000Z",
    };
    await mutateRecord(record.id, manager.workspace_id, stored => {
      stored.view.service_payment = { status: "paid", amount_minor: 50, currency: "USD", mode: "test", reference: "synthetic-fee" };
      const task = stored.view.tasks.find(item => item.id === taskId)!;
      task.proposal = structuredClone(proposal);
      task.approval = { id: `approval-${sequence}`, proposal_id: proposal.id, revision: 1, state: "pending" };
      task.status = "awaiting_approval";
      if (options.checkout !== false) task.evidence.push({
        id: `checkout-${sequence}`, task_id: taskId, source_url: proposal.source_url,
        observed_at: "2026-10-03T00:00:00.000Z", title: "Synthetic exact checkout",
        detail: "Synthetic checkout preview only", mode: "live", kind: "checkout_preview",
        proposal_id: proposal.id, revision: proposal.revision,
      });
    });
    if (options.approve !== false) {
      const requirement = await approvalRequirement(taskId, manager, exact(proposal));
      await decideTask(taskId, manager, exact(proposal), "approve", requirement.action_hash);
    }
    return { missionId: record.id, taskId, proposal };
  }

  function provider(t2: TestContext, options: {
    createOverride?: (body: CreateSpendRequestParams) => Partial<SpendRequest>;
    createStatus?: number;
    cancelStatus?: number;
    includePrivateCredential?: boolean;
    expectedBody?: CreateSpendRequestParams;
  } = {}) {
    const calls: Array<{ method: string; path: string; body?: CreateSpendRequestParams }> = [];
    let body: CreateSpendRequestParams | undefined;
    const mock = t2.mock.method(globalThis, "fetch", async (resource: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(resource));
      const method = init?.method || "GET";
      if (method === "POST" && url.pathname === "/spend_requests") {
        body = JSON.parse(String(init?.body)); calls.push({ method, path: url.pathname, body });
        if (options.createStatus && options.createStatus >= 400) return Response.json({ error: { code: "synthetic_failure" } }, { status: options.createStatus });
        return Response.json(remoteFrom(body!, "created", {
          ...(options.includePrivateCredential ? { card: { id: "card_private", brand: "visa", exp_month: 12, exp_year: 2099, number: "4242424242424242", cvc: "123" } } : {}),
          ...(options.createOverride?.(body!) || {}),
        }));
      }
      if (method === "POST" && url.pathname.endsWith("/request_approval")) {
        calls.push({ method, path: url.pathname });
        return Response.json({ id: "lsrq_synthetic_12345", approval_link: "https://app.link.com/approve/synthetic" });
      }
      if (method === "POST" && url.pathname.endsWith("/cancel")) {
        calls.push({ method, path: url.pathname });
        if (options.cancelStatus && options.cancelStatus >= 400) return Response.json({ error: { message: "synthetic provider detail must not escape" } }, { status: options.cancelStatus });
        return Response.json(remoteFrom(body || options.expectedBody!, "canceled"));
      }
      if (method === "GET" && url.pathname.endsWith("/lsrq_synthetic_12345")) {
        calls.push({ method, path: url.pathname });
        return Response.json(remoteFrom(body || options.expectedBody!, "pending_approval", options.includePrivateCredential ? { card: { id: "card_private", brand: "visa", exp_month: 12, exp_year: 2099, number: "4242424242424242", cvc: "123" } } : {}));
      }
      throw new Error(`Unexpected mocked Link request ${method} ${url.pathname}`);
    });
    return { calls, mock };
  }

  await t.test("amount, merchant source, items and quantity mismatches fail closed", async () => {
    const expected: CreateSpendRequestParams = {
      idempotency_key: "stable", credential_type: "card", test: true, request_approval: false,
      amount: 430, currency: "usd", merchant_name: "Amazon", merchant_url: "https://www.amazon.com/dp/B0195UTBKA",
      context: "x".repeat(100), line_items: [{ name: "Single tube", quantity: 1, product_url: "https://www.amazon.com/dp/B0195UTBKA" }],
      totals: [{ type: "total", display_text: "Total", amount: 430 }], metadata: { cue_task: "task", cue_action_hash: "a".repeat(64), cue_test: "true" },
    };
    const valid = remoteFrom(expected);
    verifyLinkRequest(valid, expected);
    const variants: Partial<SpendRequest>[] = [
      { amount: 431 },
      { merchant_url: "https://www.amazon.com/dp/OTHER" },
      { line_items: [{ ...expected.line_items![0], name: "Other" }] },
      { line_items: [{ ...expected.line_items![0], quantity: 2 }] },
      { line_items: [...expected.line_items!, { name: "Extra", quantity: 1 }] },
      { metadata: { ...expected.metadata, cue_test: "false" } },
    ];
    for (const variant of variants) assert.throws(() => verifyLinkRequest({ ...valid, ...variant }, expected), code("link_binding_mismatch"));
  });

  await t.test("missing passkey approval, reservation, or checkout preview makes zero provider calls", async t2 => {
    let calls = 0;
    t2.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("provider must not run"); });
    const unapproved = await planned({ approve: false });
    await assert.rejects(resumeLinkWallet(unapproved.taskId, agent, exact(unapproved.proposal)), code("approval_required"));
    const noCheckout = await planned({ checkout: false });
    await assert.rejects(resumeLinkWallet(noCheckout.taskId, agent, exact(noCheckout.proposal)), code("checkout_required"));
    const noReservation = await planned();
    await mutateRecord(noReservation.missionId, manager.workspace_id, record => { record.reservations[0].state = "released"; });
    await assert.rejects(resumeLinkWallet(noReservation.taskId, agent, exact(noReservation.proposal)), code("approval_required"));
    assert.equal(calls, 0);
  });

  await t.test("concurrent resume creates once; replay retrieves the same ID", async t2 => {
    const plan = await planned();
    const p = provider(t2);
    const raced = await Promise.allSettled([
      resumeLinkWallet(plan.taskId, agent, exact(plan.proposal)),
      resumeLinkWallet(plan.taskId, agent, exact(plan.proposal)),
    ]);
    assert.equal(p.calls.filter(call => call.method === "POST" && call.path === "/spend_requests").length, 1);
    assert.ok(raced.some(result => result.status === "fulfilled"));
    for (const result of raced) if (result.status === "rejected") assert.ok(code("wallet_busy")(result.reason));
    for (const result of raced) if (result.status === "fulfilled") assert.equal(result.value.wallet_spends![plan.taskId].request_id, "lsrq_synthetic_12345");
    const replay = await resumeLinkWallet(plan.taskId, agent, exact(plan.proposal));
    assert.equal(replay.wallet_spends![plan.taskId].request_id, "lsrq_synthetic_12345");
    assert.equal(p.calls.filter(call => call.path === "/spend_requests").length, 1, "Replay created a second request");
    assert.ok(p.calls.some(call => call.method === "GET" && call.path.endsWith("/lsrq_synthetic_12345")));
    const sent = p.calls.find(call => call.path === "/spend_requests")!.body!;
    assert.equal(sent.test, true); assert.equal(sent.request_approval, false);
    assert.equal(sent.amount, 430); assert.equal(sent.currency, "usd");
    assert.equal(sent.metadata?.cue_task, plan.taskId); assert.equal(sent.metadata?.cue_proposal, plan.proposal.id);
    assert.match(sent.idempotency_key!, /^cue-wallet-[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(sent).includes("saved-private-reference"), false);
    assert.equal(JSON.stringify(sent).includes("saved-private-attendee"), false);
  });

  await t.test("provider failure keeps the exact budget held and marks reconciliation uncertain", async t2 => {
    const plan = await planned(); provider(t2, { createStatus: 503 });
    await assert.rejects(resumeLinkWallet(plan.taskId, agent, exact(plan.proposal)), code("link_reconciliation_required"));
    const stored = await getRecord(plan.missionId, manager.workspace_id);
    assert.equal(stored.reservations.length, 1); assert.equal(stored.reservations[0].state, "reserved");
    assert.equal(stored.view.budget.reserved_minor, 430); assert.equal(stored.wallet_spends![plan.taskId].state, "uncertain");
  });

  await t.test("expired creating claims are reclaimed with the same request or idempotency key", async t2 => {
    for (const requestId of ["lsrq_synthetic_12345", undefined]) {
      const plan = await planned();
      const before = await getRecord(plan.missionId, manager.workspace_id);
      const expected = buildLinkRequest(before, plan.taskId, exact(plan.proposal), true);
      await mutateRecord(plan.missionId, manager.workspace_id, record => {
        record.wallet_spends = { [plan.taskId]: {
          proposal_id: plan.proposal.id, revision: 1, action_hash: expected.metadata!.cue_action_hash,
          idempotency_key: expected.idempotency_key!, test_mode: true, state: "creating",
          claim_id: "dead-process-claim", checked_at: "2000-01-01T00:00:00.000Z", ...(requestId ? { request_id: requestId } : {}),
        } };
      });
      const p = provider(t2, { expectedBody: expected });
      const result = await resumeLinkWallet(plan.taskId, agent, exact(plan.proposal));
      assert.equal(result.wallet_spends![plan.taskId].request_id, "lsrq_synthetic_12345");
      assert.equal(p.calls.filter(call => call.path === "/spend_requests").length, requestId ? 0 : 1);
      p.mock.mock.restore();
    }
  });

  await t.test("malformed creating timestamp fails closed before provider reconciliation", async t2 => {
    const plan = await planned();
    const before = await getRecord(plan.missionId, manager.workspace_id);
    const expected = buildLinkRequest(before, plan.taskId, exact(plan.proposal), true);
    await mutateRecord(plan.missionId, manager.workspace_id, record => {
      record.wallet_spends = { [plan.taskId]: {
        proposal_id: plan.proposal.id, revision: 1, action_hash: expected.metadata!.cue_action_hash,
        idempotency_key: expected.idempotency_key!, test_mode: true, state: "creating",
        claim_id: "malformed-time-claim", checked_at: "not-a-date", request_id: "lsrq_synthetic_12345",
      } };
    });
    let calls = 0; t2.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("provider must not run for corrupt state"); });
    await assert.rejects(resumeLinkWallet(plan.taskId, agent, exact(plan.proposal)), code("wallet_reconciliation_required"));
    assert.equal(calls, 0);
  });

  await t.test("fresh creating claim remains busy and makes zero provider calls", async t2 => {
    const plan = await planned();
    const before = await getRecord(plan.missionId, manager.workspace_id);
    const expected = buildLinkRequest(before, plan.taskId, exact(plan.proposal), true);
    await mutateRecord(plan.missionId, manager.workspace_id, record => {
      record.wallet_spends = { [plan.taskId]: {
        proposal_id: plan.proposal.id, revision: 1, action_hash: expected.metadata!.cue_action_hash,
        idempotency_key: expected.idempotency_key!, test_mode: true, state: "creating",
        claim_id: "live-claim", checked_at: new Date().toISOString(),
      } };
    });
    let calls = 0; t2.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("provider must not run"); });
    await assert.rejects(resumeLinkWallet(plan.taskId, agent, exact(plan.proposal)), code("wallet_busy"));
    assert.equal(calls, 0);
  });

  await t.test("synthetic returned card data is never persisted or returned in mission state", async t2 => {
    const plan = await planned(); provider(t2, { includePrivateCredential: true });
    const result = await resumeLinkWallet(plan.taskId, agent, exact(plan.proposal));
    const serializedResult = JSON.stringify(result);
    const serializedDisk = await readFile(statePath, "utf8");
    for (const privateValue of ["4242424242424242", '"cvc":"123"', "synthetic-link-access-token-never-log"]) {
      assert.equal(serializedResult.includes(privateValue), false);
      assert.equal(serializedDisk.includes(privateValue), false);
    }
    assert.deepEqual(Object.keys(result.wallet_spends![plan.taskId]).sort(), ["action_hash", "checked_at", "claim_id", "idempotency_key", "proposal_id", "request_id", "revision", "state", "test_mode"].sort());
  });

  await t.test("active request blocks revision; confirmed cancellation permits revision and releases hold", async t2 => {
    const plan = await planned(); provider(t2);
    await resumeLinkWallet(plan.taskId, agent, exact(plan.proposal));
    await assert.rejects(reviseMission(plan.missionId, manager, { expected_revision: 1, purchase_budget_minor: 5000 }), code("wallet_reconciliation_required"));
    const canceled = await cancelLinkWallet(plan.taskId, manager, exact(plan.proposal));
    assert.equal(canceled.wallet_spends![plan.taskId].state, "canceled");
    const revised = await reviseMission(plan.missionId, manager, { expected_revision: 1, purchase_budget_minor: 5000 });
    assert.equal(revised.view.revision, 2); assert.equal(revised.reservations[0].state, "released");
  });

  await t.test("unverified cancellation keeps request and budget held with sanitized error", async t2 => {
    const plan = await planned(); const p = provider(t2);
    await resumeLinkWallet(plan.taskId, agent, exact(plan.proposal));
    p.mock.mock.mockImplementation(async (resource: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(resource));
      if ((init?.method || "GET") === "POST" && url.pathname.endsWith("/cancel")) return Response.json({ error: { message: "synthetic provider secret detail" } }, { status: 503 });
      throw new Error(`Unexpected request ${url.pathname}`);
    });
    await assert.rejects(cancelLinkWallet(plan.taskId, manager, exact(plan.proposal)), error => code("link_reconciliation_required")(error) && !String((error as Error).message).includes("secret"));
    const stored = await getRecord(plan.missionId, manager.workspace_id);
    assert.equal(stored.reservations[0].state, "reserved");
    assert.equal(stored.wallet_spends![plan.taskId].state, "pending_approval");
  });

  await t.test("wallet and cancel HTTP routes enforce manager role before provider access", async t2 => {
    let calls = 0; t2.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("provider must not run"); });
    const auth = { authorization: "Bearer synthetic-agent" };
    const status = await walletRoute(new Request("https://cue.example/api/wallet", { headers: auth }));
    assert.equal(status.status, 403); assert.equal((await status.json()).error.code, "manager_required");
    const plan = await planned();
    const cancel = await cancelRoute(new Request(`https://cue.example/api/tasks/${plan.taskId}/wallet/cancel`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify(exact(plan.proposal)) }), { params: Promise.resolve({ id: plan.taskId }) });
    assert.equal(cancel.status, 403); assert.equal((await cancel.json()).error.code, "manager_required"); assert.equal(calls, 0);
  });
});
