import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Stripe from "stripe";
import { ClientSessions } from "eve/client";
import { createMission } from "../src/server/missions";
import { getRecord, mutateRecord } from "../src/server/store";
import { payMissionServiceFeeForTest } from "../src/server/service-test-payment";
import { assertMissionServicePaymentVerified } from "../src/server/service-payment-gate";
import { POST as submit } from "../app/api/missions/route";
import { POST as pay } from "../app/api/missions/[id]/service-payment/route";
import { POST as mcp } from "../app/api/mcp/route";
import type { MissionInput } from "../src/shared/contracts";
import type { Principal } from "../src/server/auth";

const principal: Principal = { id: "test-agent", workspace_id: "oct3-demo", role: "agent" };
const origin = "https://cue.synthetic.test";
const input: MissionInput = { objective: "Synthetic sandbox payer verification", currency: "USD", purchase_budget_minor: 2500, deadline: "2026-10-10T12:00:00Z", headcount: 1, requirements: { amazon: { category: "supplies", delivery_ref: "synthetic" }, fiverr: { category: "flyer", brief: "Synthetic", due_date: "2026-10-09T12:00:00Z" }, event_tickets: { event_url: "https://www.eventbrite.com/e/synthetic-tickets-123", date: "2026-10-10T12:00:00Z", quantity: 1, attendee_ref: "synthetic" } } };

test("sandbox payer guards with local storage, real MPP and mocked Stripe/Eve only", async t => {
  const directory = await mkdtemp(join(tmpdir(), "cue-sandbox-payer-"));
  const changes: Record<string, string | undefined> = { OCT3_STATE_PATH: join(directory, "state.json"), SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined, VERCEL: undefined, OCT3_TEST_PAYMENT_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_synthetic_payer", STRIPE_PROFILE_ID: "profile_test_synthetic_payer", MPP_SECRET_KEY: "synthetic-payer-binding-secret-long-enough", OCT3_AGENT_TOKEN: "synthetic-payer-agent", OCT3_MANAGER_TOKEN: "synthetic-payer-manager", ANTHROPIC_API_KEY: "synthetic-anthropic", OCT3_APP_URL: origin };
  for (const [key, value] of Object.entries(changes)) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  t.after(() => rm(directory, { recursive: true, force: true }));
  let sequence = 0, tokens = 0, charges = 0, sessions = 0, tokenFailure = false, loseChargeResponse = false;
  const payments = new Map<string, { token: string; id: string }>();
  const fetchMock = t.mock.method(globalThis, "fetch", async (resource: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(resource), "https://api.stripe.com/v1/test_helpers/shared_payment/granted_tokens", "No external network target other than mocked test helper");
    tokens++;
    assert.equal(init?.method, "POST");
    assert.ok(init?.signal instanceof AbortSignal);
    const body = new URLSearchParams(String(init.body));
    assert.equal(body.get("payment_method"), "pm_card_visa");
    assert.equal(body.get("usage_limits[currency]"), "usd");
    assert.equal(body.get("usage_limits[max_amount]"), "50");
    assert.equal(body.get("seller_details[network_id]"), "profile_test_synthetic_payer");
    assert.ok(Number(body.get("usage_limits[expires_at]")) > Date.now() / 1000);
    if (tokenFailure) return Response.json({ error: { message: "synthetic-private-provider-body" } }, { status: 500 });
    return Response.json({ id: `spt_synthetic_private_${tokens}` });
  });
  t.mock.method(Stripe.resources.PaymentIntents.prototype, "create", (async (parameters: any, options: any) => {
    charges++;
    assert.equal(parameters.amount, 50); assert.equal(parameters.currency, "usd");
    const key = options.idempotencyKey;
    const existing = payments.get(key);
    if (existing && existing.token !== parameters.shared_payment_granted_token) throw new Error("Synthetic Stripe idempotency parameters differ");
    const payment = existing ?? { token: parameters.shared_payment_granted_token, id: `pi_synthetic_${payments.size + 1}` };
    payments.set(key, payment);
    if (loseChargeResponse) { loseChargeResponse = false; throw new Error("Synthetic Stripe succeeded but response was lost"); }
    return { id: payment.id, status: "succeeded", lastResponse: { headers: {} } };
  }) as any);
  t.mock.method(ClientSessions.prototype, "create", (async () => { sessions++; return { session: { state: { sessionId: "synthetic-session" } } }; }) as any);
  const create = async (workspace = principal.workspace_id, mode: "live" | "fixture" = "live") => (await createMission(structuredClone(input), { ...principal, workspace_id: workspace }, `sandbox-verifier-${++sequence}`, mode)).record;
  const request = (id: string, body: unknown = { mode: "test" }, authorized = true) => new Request(`${origin}/api/missions/${id}/service-payment`, { method: "POST", headers: { "content-type": "application/json", ...(authorized ? { authorization: "Bearer synthetic-payer-agent" } : {}) }, body: JSON.stringify(body) });
  const run = (id: string) => payMissionServiceFeeForTest(request(id), id, principal.workspace_id, origin);

  await t.test("explicit server enablement and matching sandbox key/profile are mandatory", async () => {
    const record = await create();
    const before = tokens;
    for (const [key, value] of [["OCT3_TEST_PAYMENT_ENABLED", "false"], ["STRIPE_SECRET_KEY", "sk_live_synthetic_refused"], ["STRIPE_PROFILE_ID", "profile_live_refused"]]) {
      const previous = process.env[key]; process.env[key] = value;
      try { assert.equal((await run(record.id)).kind, "failed"); }
      finally { process.env[key] = previous; }
    }
    const fixture = await create(principal.workspace_id, "fixture");
    assert.equal((await run(fixture.id)).kind, "failed");
    assert.equal(tokens, before);
  });

  await t.test("payment route requires auth, same workspace and exactly mode:test", async () => {
    const record = await create(), other = await create("other-workspace");
    const before = tokens;
    const context = { params: Promise.resolve({ id: record.id }) };
    assert.equal((await pay(request(record.id, { mode: "test" }, false), context)).status, 401);
    assert.equal((await pay(request(other.id), { params: Promise.resolve({ id: other.id }) })).status, 404);
    for (const body of [{ mode: "live" }, { mode: "test", amount: 1 }, { mode: "test", paid: true }, {}]) assert.equal((await pay(request(record.id, body), context)).status, 400);
    assert.equal(tokens, before);
  });

  await t.test("normal submit stays402; exact opt-in pays through verifier and replays without new token", async () => {
    const key = "synthetic-sandbox-submit";
    const req = (optin?: string) => new Request(`${origin}/api/missions`, { method: "POST", headers: { authorization: "Bearer synthetic-payer-agent", "content-type": "application/json", "idempotency-key": key, ...(optin ? { "x-cue-test-payment": optin } : {}) }, body: JSON.stringify({ ...input, mode: "live" }) });
    const before = tokens, beforeSessions = sessions;
    assert.equal((await submit(req())).status, 402);
    assert.equal((await submit(req("true"))).status, 402);
    assert.equal(tokens, before);
    const paid = await submit(req("authorized"));
    const body = await paid.json();
    assert.equal(paid.status, 200, JSON.stringify(body));
    assert.equal(body.service_payment.status, "paid");
    assert.ok(paid.headers.get("payment-receipt"));
    assertMissionServicePaymentVerified(await getRecord(body.mission_id, principal.workspace_id));
    assert.equal((await getRecord(body.mission_id, principal.workspace_id)).service_payment?.test_payment_credential, undefined);
    assert.doesNotMatch(JSON.stringify(body), /spt_synthetic|sk_test|synthetic-payer-binding/);
    const after = tokens, afterCharges = charges;
    const replay = await pay(request(body.mission_id), { params: Promise.resolve({ id: body.mission_id }) });
    assert.equal(replay.status, 200);
    assert.equal(tokens, after); assert.equal(charges, afterCharges);
    assert.equal(sessions - beforeSessions, 1);
  });

  await t.test("MPP credentials and provider error bodies cannot escape failure responses", async () => {
    const record = await create();
    tokenFailure = true;
    try {
      const response = await pay(request(record.id), { params: Promise.resolve({ id: record.id }) });
      assert.equal(response.status, 502);
      const body = await response.json();
      assert.equal(body.mission.mission_id, record.id);
      assert.doesNotMatch(JSON.stringify(body), /synthetic-private-provider-body|spt_synthetic|sk_test/);
    } finally { tokenFailure = false; }
  });

  await t.test("concurrent payer requests use one selected Stripe credential and dispatch once", async () => {
    const record = await create();
    const beforeSessions = sessions;
    const responses = await Promise.all(Array.from({ length: 4 }, () => pay(request(record.id), { params: Promise.resolve({ id: record.id }) })));
    for (const response of responses) assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.equal(sessions - beforeSessions, 1);
    const saved = await getRecord(record.id, principal.workspace_id);
    assertMissionServicePaymentVerified(saved);
    assert.equal(saved.service_payment?.test_payment_credential, undefined);
    // The Stripe mock rejects changed tokens under the same idempotency key.
    assert.equal(payments.get(`cue_service_${saved.service_payment!.external_id}`)?.id, saved.service_payment!.proof!.reference);
  });

  await t.test("expired submitted credential requires reconciliation without another token or charge", async s => {
    const record = await create();
    loseChargeResponse = true;
    assert.notEqual((await run(record.id)).kind, "ready");
    const saved = await getRecord(record.id, principal.workspace_id);
    assert.ok(saved.service_payment?.test_payment_credential);
    const beforeTokens = tokens, beforeCharges = charges;
    const afterExpiry = Date.parse(saved.service_payment!.test_payment_credential!.expires_at) + 1;
    s.mock.method(Date, "now", () => afterExpiry);
    const result = await run(record.id);
    assert.ok("code" in result);
    if ("code" in result) assert.equal(result.code, "payment_reconciliation_required");
    assert.equal(tokens, beforeTokens); assert.equal(charges, beforeCharges);
  });

  await t.test("token requests are bounded to10seconds and old attempts cannot mint credentials", async s => {
    const record = await create();
    await mutateRecord(record.id, principal.workspace_id, row => { row.service_payment = { first_credential_attempt_at: new Date(Date.now() - 22 * 3600000).toISOString() }; });
    const before = tokens;
    const result = await run(record.id);
    assert.equal(result.kind, "blocked"); assert.equal(tokens, before);
    const fresh = await create();
    const durations: number[] = [];
    s.mock.method(AbortSignal, "timeout", (milliseconds: number) => { durations.push(milliseconds); return AbortSignal.abort(new DOMException("Synthetic timeout", "TimeoutError")); });
    fetchMock.mock.mockImplementation(async (_resource, init) => { init?.signal?.throwIfAborted(); throw new Error("Expected aborted signal"); });
    try { assert.equal((await run(fresh.id)).kind, "failed"); assert.ok(durations.includes(10000)); }
    finally { fetchMock.mock.restore(); }
  });

  await t.test("lost Stripe success retries the same credential or explicitly blocks reconciliation", async () => {
    // Restore the controlled token fixture after timeout injection.
    const localFetch = t.mock.method(globalThis, "fetch", async () => Response.json({ id: `spt_synthetic_private_${++tokens}` }));
    const record = await create();
    const before = tokens;
    loseChargeResponse = true;
    try {
      const first = await submit(new Request(`${origin}/api/missions`, { method: "POST", headers: { authorization: "Bearer synthetic-payer-agent", "content-type": "application/json", "idempotency-key": record.idempotency_key, "x-cue-test-payment": "authorized" }, body: JSON.stringify({ ...input, mode: "live" }) }));
      assert.equal(first.status, 502);
      const retry = await pay(request(record.id), { params: Promise.resolve({ id: record.id }) });
      assert.equal(retry.status, 200, JSON.stringify(await retry.clone().json()));
      assert.equal((await retry.json()).service_payment.status, "paid");
      assert.equal(tokens - before, 1, "An ambiguous charged request must not mint a different SPT for the same Stripe idempotency key");
    } finally { localFetch.mock.restore(); }
  });

  await t.test("MCP false/omitted sandbox opt-in preserves402 and onlytrue enables the payer", async () => {
    const localFetch = t.mock.method(globalThis, "fetch", async () => Response.json({ id: `spt_synthetic_private_${++tokens}` }));
    try {
      let rpcId = 0;
      const call = async (flag?: boolean) => {
        const response = await mcp(new Request(`${origin}/api/mcp`, { method: "POST", headers: { authorization: "Bearer synthetic-payer-agent", "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-03-26" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name: "submit_mission", arguments: { mission: { ...input, mode: "live" }, idempotency_key: "synthetic-mcp-sandbox", ...(flag === undefined ? {} : { pay_test_service_fee: flag }) } } }) }));
        const text = await response.text();
        return response.headers.get("content-type")?.includes("text/event-stream") ? text.split("\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6))).find(value => value.id === rpcId) : JSON.parse(text);
      };
      const before = tokens;
      for (const flag of [undefined, false]) { const value = await call(flag); assert.equal(value.result.isError, true); assert.ok(value.result.structuredContent.payment_challenge); }
      assert.equal(tokens, before);
      const value = await call(true);
      assert.notEqual(value.result.isError, true, JSON.stringify(value));
      assert.equal(value.result.structuredContent.service_payment.status, "paid");
      assert.ok(value.result.structuredContent.service_payment_receipt);
      assert.doesNotMatch(JSON.stringify(value), /spt_synthetic|sk_test/);
    } finally { localFetch.mock.restore(); }
  });
});
