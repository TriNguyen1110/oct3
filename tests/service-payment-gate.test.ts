import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Stripe from "stripe";
import { Challenge, Credential } from "mppx";
import { ClientSessions } from "eve/client";
import { POST } from "../app/api/missions/route";
import { createMission, refresh, reviseMission } from "../src/server/missions";
import { dispatchMission } from "../src/server/dispatch";
import { runMissionResearch } from "../src/server/research";
import { assertMissionServicePaymentVerified, gateMissionServicePayment } from "../src/server/service-payment-gate";
import { servicePaymentBinding } from "../src/server/service-payments";
import { getRecord, listRecords, mutateRecord } from "../src/server/store";
import type { MissionRecord } from "../src/server/model";
import type { Principal } from "../src/server/auth";
import type { MissionInput } from "../src/shared/contracts";

const principal: Principal = { id: "demo-manager", workspace_id: "oct3-demo", role: "manager" };
const origin = "https://cue.synthetic.test";
const input: MissionInput = {
  objective: "Synthetic payment gate verification", currency: "USD", purchase_budget_minor: 90000,
  deadline: "2026-10-07T12:00:00Z", headcount: 6,
  requirements: {
    amazon: { category: "supplies", delivery_ref: "synthetic" },
    fiverr: { category: "flyer", brief: "Synthetic only", due_date: "2026-10-06T12:00:00Z" },
    event_tickets: { event_url: "https://www.eventbrite.com/e/synthetic-tickets-123", date: "2026-10-07T12:00:00Z", quantity: 6, attendee_ref: "synthetic" },
  },
};
function seedPaid(record: MissionRecord) {
  const binding = servicePaymentBinding({ workspaceId: record.workspace_id, idempotencyKey: record.idempotency_key, requestHash: record.request_hash });
  record.service_payment = { external_id: binding.externalId, scope: binding.scope, proof: { reference: "pi_synthetic_stored", external_id: binding.externalId, amount_minor: 50, currency: "USD", mode: "test", verified_at: new Date().toISOString() } };
  record.view.service_payment = { status: "paid", reference: "pi_synthetic_stored", amount_minor: 50, currency: "USD", mode: "test" };
  refresh(record);
}

test("independent fee gate uses durable local rows and synthetic Stripe/Eve boundaries", async t => {
  const directory = await mkdtemp(join(tmpdir(), "cue-fee-verifier-"));
  const changes: Record<string, string | undefined> = {
    OCT3_STATE_PATH: join(directory, "state.json"), SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined, VERCEL: undefined,
    STRIPE_SECRET_KEY: "sk_test_synthetic_verifier", STRIPE_PROFILE_ID: "profile_test_synthetic_verifier", MPP_SECRET_KEY: "synthetic-fee-verifier-binding-secret-32-bytes",
    OCT3_AGENT_TOKEN: "synthetic-fee-agent", OCT3_MANAGER_TOKEN: "synthetic-fee-manager", ANTHROPIC_API_KEY: "synthetic-no-network", OCT3_APP_URL: origin,
  };
  for (const [key, value] of Object.entries(changes)) {
    const prior = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    t.after(() => { if (prior === undefined) delete process.env[key]; else process.env[key] = prior; });
  }
  t.after(() => rm(directory, { recursive: true, force: true }));
  let stripeCalls = 0, eveCalls = 0, failEve = false;
  const stripeKeys: string[] = [];
  t.mock.method(globalThis, "fetch", () => { throw new Error("No network is permitted in synthetic fee tests"); });
  t.mock.method(Stripe.resources.PaymentIntents.prototype, "create", (async (parameters: any, options: any) => {
    stripeCalls++;
    assert.equal(parameters.amount, 50);
    assert.equal(parameters.currency, "usd");
    assert.equal(parameters.payment_method_types, undefined);
    assert.equal(parameters.confirm, true);
    const externalId = parameters.metadata.cue_payment_binding;
    const row = (await listRecords(principal.workspace_id)).find(record => record.service_payment?.external_id === externalId);
    assert.ok(row, "The bound mission must be durable before Stripe create is reached");
    assert.ok(row.service_payment!.first_credential_attempt_at, "Retry clock must be durable before charge");
    assert.ok(["pending", "paid"].includes(row.view.service_payment.status));
    assert.equal(options.idempotencyKey, `cue_service_${externalId}`);
    stripeKeys.push(options.idempotencyKey);
    return { id: `pi_${externalId}`, status: "succeeded", lastResponse: { headers: {} } };
  }) as any);
  t.mock.method(ClientSessions.prototype, "create", (async (options: { message: string }) => {
    eveCalls++;
    const id = options.message.match(/mission ([\w-]+)/)?.[1];
    assert.ok(id);
    assertMissionServicePaymentVerified(await getRecord(id, principal.workspace_id));
    if (failEve) throw new Error("Synthetic ambiguous acceptance");
    return { session: { state: { sessionId: "synthetic-eve-session" } } };
  }) as any);
  let sequence = 0;
  const create = async () => (await createMission(structuredClone(input), principal, `synthetic-fee-${++sequence}`, "live")).record;
  const request = (key: string, payment?: string, data: MissionInput = input) => new Request(`${origin}/api/missions`, {
    method: "POST", headers: { authorization: "Bearer synthetic-fee-agent", "content-type": "application/json", "idempotency-key": key, ...(payment ? { "payment-authorization": payment } : {}) },
    body: JSON.stringify({ ...data, mode: "live" }),
  });

  await t.test("unpaid direct research and dispatch cannot bypass the fee or reach external services", async () => {
    const record = await create();
    await assert.rejects(runMissionResearch(record.id, principal.workspace_id), /verified.*payment/i);
    await assert.rejects(dispatchMission(record.id, principal.workspace_id, origin), /verified.*payment/i);
    assert.equal(stripeCalls, 0);
    assert.equal(eveCalls, 0);
    assert.equal((await getRecord(record.id, principal.workspace_id)).eve_dispatch, undefined);
  });

  await t.test("concurrent changed-body reuse conflicts before payment and retains one durable handle", async () => {
    const key = "synthetic-changed-body";
    const before = stripeCalls;
    const responses = await Promise.all([POST(request(key)), POST(request(key, undefined, { ...input, objective: "Different synthetic objective" }))]);
    assert.deepEqual(responses.map(response => response.status).sort(), [402, 409]);
    const rows = (await listRecords(principal.workspace_id)).filter(row => row.idempotency_key === key);
    assert.equal(rows.length, 1);
    assert.equal(stripeCalls, before);
    const challenge = responses.find(response => response.status === 402)!;
    assert.equal(challenge.headers.get("x-cue-mission-id"), rows[0].id);
    assert.equal(new URL(challenge.headers.get("x-cue-dashboard-url")!).searchParams.get("mission"), rows[0].id);
  });

  await t.test("real MPP parsing plus mocked Stripe saves exact proof before one duplicate-safe dispatch", async () => {
    const key = "synthetic-paid-concurrency";
    const challengeResponse = await POST(request(key));
    assert.equal(challengeResponse.status, 402);
    const challenge = Challenge.fromResponse(challengeResponse);
    const payment = Credential.serialize({ challenge, payload: { spt: "spt_synthetic_only", externalId: challenge.request.externalId } });
    const beforeEve = eveCalls, beforeStripe = stripeCalls;
    const responses = await Promise.all(Array.from({ length: 4 }, () => POST(request(key, payment))));
    for (const response of responses) {
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
      assert.ok(response.headers.get("payment-receipt"));
    }
    assert.equal(eveCalls - beforeEve, 1);
    assert.ok(stripeCalls > beforeStripe);
    assert.equal(new Set(stripeKeys.slice(beforeStripe)).size, 1, "All attempts use one Stripe idempotency key");
    const id = challengeResponse.headers.get("x-cue-mission-id")!;
    const record = await getRecord(id, principal.workspace_id);
    assertMissionServicePaymentVerified(record);
    assert.equal(record.eve_dispatch?.state, "sent");
    assert.equal(record.view.service_payment.amount_minor, 50);
    assert.equal(record.view.service_payment.currency, "USD");
    assert.ok(record.view.tasks.every(task => task.status !== "confirmed" && !task.confirmation_ref));
    const paidCalls = stripeCalls;
    const replay = await POST(request(key));
    assert.equal(replay.status, 200);
    assert.ok(replay.headers.get("payment-receipt"));
    assert.equal(stripeCalls, paidCalls, "Persisted proof replay cannot charge again");
    assert.equal(eveCalls - beforeEve, 1);
  });

  await t.test("signed payment challenge cannot be replayed for another mission or tampered amount", async () => {
    const key = "synthetic-credential-binding";
    const response = await POST(request(key));
    assert.equal(response.status, 402);
    const challenge = Challenge.fromResponse(response);
    const credential = Credential.serialize({ challenge, payload: { spt: "spt_synthetic_only", externalId: challenge.request.externalId } });
    const before = stripeCalls;
    const other = await POST(request("synthetic-other-binding", credential));
    assert.equal(other.status, 402);
    const changed = await POST(request(key, credential, { ...input, purchase_budget_minor: 1 }));
    assert.equal(changed.status, 409);
    const tampered = Credential.serialize({ challenge: { ...challenge, request: { ...challenge.request, amount: "1" } }, payload: { spt: "spt_synthetic_only", externalId: challenge.request.externalId } });
    const invalid = await POST(request(key, tampered));
    assert.equal(invalid.status, 402);
    assert.equal(stripeCalls, before);
  });

  await t.test("paid status alone and mismatched proof amount, currency, binding, mode or reference fail closed", async () => {
    const record = await create();
    seedPaid(record);
    assertMissionServicePaymentVerified(record);
    const mutations: Array<(value: MissionRecord) => void> = [
      value => { delete value.service_payment!.proof; },
      value => { value.service_payment!.proof!.amount_minor = 51 as 50; },
      value => { value.service_payment!.proof!.currency = "EUR" as "USD"; },
      value => { value.service_payment!.proof!.mode = "live"; },
      value => { value.service_payment!.proof!.external_id = "another-binding"; },
      value => { value.service_payment!.proof!.verified_at = "invalid-date"; },
      value => { value.service_payment!.scope = "other-scope"; },
      value => { value.workspace_id = "other-workspace"; },
      value => { value.request_hash = "different-body-hash"; },
      value => { value.idempotency_key = "different-idempotency-key"; },
      value => { value.view.service_payment.reference = "pi_other"; },
    ];
    for (const change of mutations) {
      const changed = structuredClone(record); change(changed);
      assert.throws(() => assertMissionServicePaymentVerified(changed));
    }
  });

  await t.test("malformed, future and at-least-22-hour credential attempts require reconciliation without charge", async () => {
    for (const at of ["invalid-date", new Date(Date.now() + 60000).toISOString(), new Date(Date.now() - 22 * 3600000).toISOString(), new Date(Date.now() - 23 * 3600000).toISOString()]) {
      const record = await create();
      await mutateRecord(record.id, principal.workspace_id, row => { row.service_payment = { first_credential_attempt_at: at }; });
      const before = stripeCalls;
      const result = await gateMissionServicePayment(request(record.idempotency_key, "Payment synthetic-invalid"), record.id, principal.workspace_id, origin);
      assert.equal(result.kind, "blocked");
      if (result.kind === "blocked") assert.equal(result.code, "payment_reconciliation_required");
      assert.equal(stripeCalls, before);
    }
  });

  await t.test("unexpired stored proof survives old retry clock and replays a receipt without charge", async () => {
    const record = await create();
    await mutateRecord(record.id, principal.workspace_id, row => { seedPaid(row); row.service_payment!.first_credential_attempt_at = "2000-01-01T00:00:00Z"; });
    const before = stripeCalls;
    const result = await gateMissionServicePayment(request(record.idempotency_key), record.id, principal.workspace_id, origin);
    assert.equal(result.kind, "ready");
    if (result.kind === "ready") assert.ok(result.withReceipt(Response.json({ synthetic: true })).headers.get("payment-receipt"));
    assert.equal(stripeCalls, before);
  });

  await t.test("ambiguous session creation remains held across a constraint revision", async () => {
    const record = await create();
    await mutateRecord(record.id, principal.workspace_id, seedPaid);
    const before = eveCalls;
    failEve = true;
    try {
      await dispatchMission(record.id, principal.workspace_id, origin);
      assert.equal((await getRecord(record.id, principal.workspace_id)).eve_dispatch?.state, "uncertain");
      await reviseMission(record.id, principal, { expected_revision: 1, purchase_budget_minor: 65000 });
      await dispatchMission(record.id, principal.workspace_id, origin);
      assert.equal(eveCalls - before, 1);
      const after = await getRecord(record.id, principal.workspace_id);
      assert.equal(after.eve_dispatch?.revision, 1);
      assert.equal(after.eve_dispatch?.state, "uncertain");
    } finally { failEve = false; }
  });
});
