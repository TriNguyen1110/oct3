import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { api, ApiError } from "../src/client/api";

const id = "11111111-1111-4111-8111-111111111111";
test("CLI sandbox payment requires explicit submit opt-in against a local mock server", async t => {
  const directory = await mkdtemp(join(tmpdir(), "cue-client-payment-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const seen: Array<{ method: string; path: string; optin?: string; payment?: string; key?: string }> = [];
  const server = createServer(async (request, response) => {
    for await (const _ of request) { /* Consume synthetic request only. */ }
    seen.push({ method: request.method!, path: request.url!, optin: request.headers["x-cue-test-payment"] as string | undefined, payment: request.headers["payment-authorization"] as string | undefined, key: request.headers["idempotency-key"] as string | undefined });
    const paid = request.headers["x-cue-test-payment"] === "authorized";
    response.writeHead(request.method === "POST" && !paid ? 402 : 200, {
      "content-type": "application/json", "x-cue-mission-id": id,
      "x-cue-dashboard-url": `http://127.0.0.1/?mission=${id}`, "x-cue-result-url": `http://127.0.0.1/api/missions/${id}`,
      ...(paid ? { "payment-receipt": "synthetic-public-receipt" } : { "www-authenticate": "Payment synthetic-public-challenge" }),
    });
    response.end(JSON.stringify(paid ? { service_payment: { status: "paid", mode: "test" } } : { error: { code: "payment_required" } }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const env = { NODE_ENV: "test" as const, OCT3_BASE_URL: `http://127.0.0.1:${address.port}`, OCT3_AGENT_TOKEN: "synthetic-agent", OCT3_PAYMENT_AUTHORIZATION: "Payment synthetic-private-credential" };
  const live = join(directory, "live.json"), fixture = join(directory, "fixture.json");
  await writeFile(live, JSON.stringify({ mode: "live", objective: "Synthetic CLI test" }));
  await writeFile(fixture, JSON.stringify({ mode: "fixture" }));
  const cli = fileURLToPath(new URL("../cli/oct3.mjs", import.meta.url));
  const run = async (args: string[]) => promisify(execFile)(process.execPath, [cli, ...args], { env, timeout: 5000 }).then(result => ({ ...result, code: 0 }), (error: { stdout: string; stderr: string; code: number }) => error);

  await t.test("default submit preserves saved 402 handles without opting in or exposing credential", async () => {
    const result = await run(["submit", live, "--key", "synthetic-default-key"]);
    assert.equal(result.code, 1);
    const body = JSON.parse(result.stdout);
    assert.equal(body.mission_id, id);
    assert.equal(body.payment_challenge, "Payment synthetic-public-challenge");
    assert.equal(seen.at(-1)!.optin, undefined);
    assert.equal(seen.at(-1)!.payment, "Payment synthetic-private-credential");
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-private-credential|synthetic-agent/);
  });

  await t.test("explicit live --pay-test sets opt-in once and preserves service receipt", async () => {
    const result = await run(["submit", live, "--key", "synthetic-paid-key", "--pay-test"]);
    assert.equal(result.code, 0);
    assert.equal(seen.at(-1)!.optin, "authorized");
    assert.equal(JSON.parse(result.stdout).service_payment_receipt, "synthetic-public-receipt");
    for (const args of [["list"], ["status", id]]) {
      assert.equal((await run(args)).code, 0);
      assert.equal(seen.at(-1)!.optin, undefined);
      assert.equal(seen.at(-1)!.payment, undefined);
    }
  });

  await t.test("fixture, duplicate and misplaced opt-in flags fail before any request", async () => {
    const count = seen.length;
    for (const args of [["submit", fixture, "--key", "synthetic-fixture-key", "--pay-test"], ["submit", live, "--key", "synthetic-duplicate", "--pay-test", "--pay-test"], ["list", "--pay-test"], ["status", id, "--pay-test"]]) assert.equal((await run(args)).code, 1);
    assert.equal(seen.length, count);
  });
});

test("client API errors preserve recoverable mission metadata without payment headers", async t => {
  const origin = "https://cue.synthetic.test";
  const response = (body: unknown, headers: Record<string, string>, status = 402) => {
    const result = Response.json(body, { status, headers });
    Object.defineProperty(result, "url", { value: `${origin}/api/missions` });
    return result;
  };
  let next = response({ error: { code: "payment_required", message: "Payment required" } }, { "x-cue-mission-id": id, "x-cue-dashboard-url": `${origin}/?mission=${id}`, "x-cue-result-url": `${origin}/api/missions/${id}`, "www-authenticate": "synthetic-not-retained-challenge", "payment-authorization": "synthetic-private-payment", "set-cookie": "synthetic-private-cookie" });
  t.mock.method(globalThis, "fetch", async (_path: unknown, options: RequestInit) => { assert.equal(options.credentials, "same-origin"); return next; });
  const rejected = async () => { try { await api("/api/missions"); assert.fail("Expected ApiError"); } catch (error) { assert.ok(error instanceof ApiError); return error; } };
  const first = await rejected();
  assert.equal(first.status, 402);
  assert.equal(first.metadata.missionId, id);
  assert.equal(first.metadata.dashboardUrl, `${origin}/?mission=${id}`);
  assert.doesNotMatch(JSON.stringify(first), /synthetic-(?:private|not-retained)/);
  next = response({ error: { code: "payment_setup_required", message: "Setup required" }, mission: { mission_id: id, dashboard_url: `${origin}/?mission=${id}` } }, {}, 503);
  const setup = await rejected();
  assert.equal(setup.metadata.missionId, id);
  assert.equal(setup.status, 503);
  next = response({ error: { message: { malicious: "not a message" } } }, { "x-cue-mission-id": "../../secret", "x-cue-dashboard-url": "https://other.test/?token=synthetic-private", "x-cue-result-url": "https://user:password@cue.synthetic.test/api/missions" });
  const unsafe = await rejected();
  assert.equal(unsafe.metadata.missionId, undefined);
  assert.equal(unsafe.metadata.dashboardUrl, undefined);
  assert.equal(unsafe.metadata.resultUrl, undefined);
  assert.equal(unsafe.message, "Request could not complete (402).");
});
