import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, createPrivateKey, sign } from "node:crypto";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { registrationOptions, verifyRegistration, approvalOptions, verifyApproval, passkeyStatus, assertPasskeyRequestOrigin } from "../src/server/passkeys";
import { createMission, runFixture, approvalRequirement, decideTask } from "../src/server/missions";
import { mutateRecord, getRecord } from "../src/server/store";
import { AppError } from "../src/server/errors";
import type { Principal } from "../src/server/auth";
import { defaultInput } from "../src/client/preview";
import { virtualPasskeyDevice } from "./helpers/virtual-passkey";
import { POST as approveRoute } from "../app/api/tasks/[id]/approve/route";

const manager: Principal = { id: "synthetic-passkey-manager", workspace_id: "synthetic-passkey-security", role: "manager" };
const code = (value: string) => (error: unknown) => error instanceof AppError && error.code === value;
test("independent real WebAuthn crypto with virtual authenticator and isolated CAS storage", async t => {
  for (const [key, value] of Object.entries({ SUPABASE_URL: "https://synthetic.supabase.test", SUPABASE_SERVICE_ROLE_KEY: "synthetic-no-real-key", OCT3_APP_URL: "http://localhost:3003", OCT3_MANAGER_TOKEN: "synthetic-passkey-route-manager" })) {
    const old = process.env[key]; process.env[key] = value; t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  type Row = Record<string, any>;
  const tables = new Map<string, Row[]>(["oct3_missions", "oct3_passkey_credentials", "oct3_passkey_challenges"].map(name => [name, []]));
  let interfereCounter = false;
  t.mock.method(globalThis, "fetch", async (resource: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof resource === "string" || resource instanceof URL ? resource : resource.url); assert.equal(url.origin, "https://synthetic.supabase.test");
    const method = init?.method || "GET";
    if (url.pathname.endsWith("/rpc/oct3_consume_passkey_challenge")) {
      const args = JSON.parse(String(init?.body));
      const row = tables.get("oct3_passkey_challenges")!.find(row => row.id === args.p_id && row.workspace_id === args.p_workspace && row.principal_id === args.p_principal && row.kind === args.p_kind && !row.consumed_at && Date.parse(row.expires_at) > Date.now());
      if (row) row.consumed_at = new Date().toISOString(); return Response.json(!!row);
    }
    const name = url.pathname.split("/").at(-1)!; const rows = tables.get(name); assert.ok(rows, `Unexpected synthetic table ${name}`);
    if (method === "POST") {
      const row = JSON.parse(String(init?.body));
      if (name === "oct3_passkey_credentials" && rows.some(existing => existing.workspace_id === row.workspace_id && existing.principal_id === row.principal_id)) return Response.json({ code: "23505" }, { status: 409 });
      rows.push(row); return Response.json(name === "oct3_missions" ? { payload: row.payload } : row);
    }
    if (interfereCounter && name === "oct3_passkey_credentials" && method === "PATCH") { rows[0].counter++; interfereCounter = false; }
    const matches = rows.filter(row => [...url.searchParams].every(([field, expression]) => !expression.startsWith("eq.") || String(row[field]) === expression.slice(3)));
    if (method === "GET") return Response.json(matches);
    assert.equal(method, "PATCH");
    const patch = JSON.parse(String(init?.body)); for (const row of matches) Object.assign(row, patch);
    return Response.json(matches.length ? matches[0] : null);
  });
  const device = await virtualPasskeyDevice(); t.after(() => device.close());
  const { cdp, authenticatorId } = device;
  const options = await registrationOptions(manager);
  const registration = await device.register(options.options);
  const enroll = (response = registration, principal = manager) => verifyRegistration(principal, { challenge_id: options.challenge_id, response });
  const editClient = <T extends AuthenticationResponseJSON | RegistrationResponseJSON>(response: T, changes: Record<string, unknown>) => {
    const next = structuredClone(response), client = JSON.parse(Buffer.from(next.response.clientDataJSON, "base64url").toString()); Object.assign(client, changes);
    next.response.clientDataJSON = Buffer.from(JSON.stringify(client)).toString("base64url"); return next;
  };
  await t.test("enrollment requires scoped challenge, platform attachment, trusted origin and user verification", async () => {
    await assert.rejects(enroll(registration, { ...manager, role: "agent" }), code("manager_required"));
    await assert.rejects(enroll(registration, { ...manager, workspace_id: "other" }), code("passkey_challenge_invalid"));
    await assert.rejects(enroll({ ...registration, authenticatorAttachment: "cross-platform" }), code("platform_passkey_required"));
    await assert.rejects(enroll(editClient(registration, { origin: "https://attacker.example" })), code("passkey_verification_failed"));
    await assert.rejects(enroll(editClient(registration, { challenge: "wrong-challenge" })), code("passkey_verification_failed"));
    assert.deepEqual(await passkeyStatus(manager), { enrolled: false, required: true });
    assert.deepEqual(await enroll(), { verified: true }); await assert.rejects(enroll(), code("passkey_already_enrolled"));
    for (const origin of ["https://attacker.example", "http://localhost:3004", "null"]) assert.throws(() => assertPasskeyRequestOrigin(new Request("http://localhost:3003/api/passkeys", { method: "POST", headers: { origin } })), code("invalid_origin"));
  });
  const made = await createMission(structuredClone(defaultInput), manager, "synthetic-webauthn-only", "fixture"); const planned = await runFixture(made.record.id, manager.workspace_id);
  await mutateRecord(planned.id, manager.workspace_id, record => { record.view.mode = "live"; });
  const task = planned.view.tasks[0], exact = { proposal_id: task.proposal!.id, revision: task.proposal!.revision };
  const getAssertion = async () => {
    const challenge = await approvalOptions(task.id, manager, exact);
    const response = await device.authenticate(challenge.options);
    return { challenge_id: challenge.challenge_id, response };
  };
  const verify = (value: Awaited<ReturnType<typeof getAssertion>>, principal = manager, selected = exact) => verifyApproval(task.id, principal, selected, value);
  const resign = async (response: AuthenticationResponseJSON, mutate: (data: Buffer) => void) => {
    const next = structuredClone(response), data = Buffer.from(next.response.authenticatorData, "base64url"); mutate(data);
    next.response.authenticatorData = data.toString("base64url");
    const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
    const privateKey = createPrivateKey({ key: Buffer.from(credentials[0].privateKey, "base64"), format: "der", type: "pkcs8" });
    next.response.signature = sign("sha256", Buffer.concat([data, createHash("sha256").update(Buffer.from(next.response.clientDataJSON, "base64url")).digest()]), privateKey).toString("base64url");
    return next;
  };
  await t.test("valid signatures still require RP hash and UV; altered signature and origin fail", async () => {
    const assertion = await getAssertion();
    const wrongOrigin = await resign(editClient(assertion.response, { origin: "https://attacker.example" }), () => {});
    await assert.rejects(verify({ ...assertion, response: wrongOrigin }), code("passkey_verification_failed"));
    const wrongChallenge = await resign(editClient(assertion.response, { challenge: "different-signed-challenge" }), () => {});
    await assert.rejects(verify({ ...assertion, response: wrongChallenge }), code("passkey_verification_failed"));
    const broken = structuredClone(assertion); broken.response.response.signature = Buffer.alloc(64, 7).toString("base64url"); await assert.rejects(verify(broken), code("passkey_verification_failed"));
    const wrongRP = await resign(assertion.response, data => createHash("sha256").update("attacker.example").digest().copy(data, 0));
    await assert.rejects(verify({ ...assertion, response: wrongRP }), code("passkey_verification_failed"));
    const noUV = await resign(assertion.response, data => { data[32] &= ~4; });
    await assert.rejects(verify({ ...assertion, response: noUV }), code("passkey_verification_failed"));
    assert.equal(tables.get("oct3_passkey_challenges")!.find(row => row.id === assertion.challenge_id)!.consumed_at, null);
  });
  await t.test("wrong principal, workspace, task binding, expired and used challenges reject", async () => {
    const assertion = await getAssertion();
    await assert.rejects(verify(assertion, { ...manager, id: "other-manager" }), code("passkey_challenge_invalid"));
    await assert.rejects(verify(assertion, { ...manager, workspace_id: "other" }), code("passkey_challenge_invalid"));
    await assert.rejects(verify(assertion, manager, { ...exact, proposal_id: "different" }), code("passkey_scope_mismatch"));
    const row = tables.get("oct3_passkey_challenges")!.find(row => row.id === assertion.challenge_id)!; const original = row.expires_at; row.expires_at = "2000-01-01T00:00:00Z";
    await assert.rejects(verify(assertion), code("passkey_challenge_expired")); row.expires_at = original;
    const outcomes = await Promise.allSettled([verify(assertion), verify(assertion)]); assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
    await assert.rejects(verify(assertion), code("passkey_challenge_invalid"));
  });
  await t.test("changed proposal and counter CAS interference cannot produce usable approval", async () => {
    const assertion = await getAssertion();
    await mutateRecord(planned.id, manager.workspace_id, record => { record.view.tasks[0].proposal!.title += " changed"; });
    await assert.rejects(verify(assertion), code("stale_proposal"));
    await mutateRecord(planned.id, manager.workspace_id, record => { record.view.tasks[0].proposal!.title = task.proposal!.title; });
    const second = await getAssertion(); interfereCounter = true;
    await assert.rejects(verify(second), code("passkey_counter_changed"));
    assert.ok(tables.get("oct3_passkey_challenges")!.find(row => row.id === second.challenge_id)!.consumed_at);
    assert.equal((await getRecord(planned.id, manager.workspace_id)).reservations.length, 0);
  });
  await t.test("HTTP approval cannot inject a verified hash or omit native proof for a new live decision", async () => {
    // Auth uses a fixed demo workspace, so this row exists only in the mocked
    // database. No credential is enrolled for the demo manager or workspace.
    const routePrincipal = { ...manager, workspace_id: "oct3-demo" };
    const made = await createMission(structuredClone(defaultInput), routePrincipal, "synthetic-route-only", "fixture");
    const planned = await runFixture(made.record.id, routePrincipal.workspace_id);
    await mutateRecord(planned.id, routePrincipal.workspace_id, record => { record.view.mode = "live"; });
    const routeTask = planned.view.tasks[0], selection = { proposal_id: routeTask.proposal!.id, revision: 1 };
    const request = (body: unknown) => new Request(`http://localhost:3003/api/tasks/${routeTask.id}/approve`, { method: "POST", headers: { authorization: "Bearer synthetic-passkey-route-manager", origin: "http://localhost:3003", "content-type": "application/json" }, body: JSON.stringify(body) });
    const injected = await approveRoute(request({ ...selection, verifiedActionHash: "a".repeat(64) }), { params: Promise.resolve({ id: routeTask.id }) });
    assert.equal(injected.status, 400);
    const missing = await approveRoute(request(selection), { params: Promise.resolve({ id: routeTask.id }) });
    assert.equal(missing.status, 403); assert.equal((await missing.json()).error.code, "passkey_required");
    assert.equal((await getRecord(planned.id, routePrincipal.workspace_id)).reservations.length, 0);
  });
  await t.test("all new live approvals need verified exact hash and CAS rejects post-verification changes", async () => {
    await assert.rejects(decideTask(task.id, manager, exact, "approve"), code("passkey_required"));
    const assertion = await getAssertion(), hash = await verify(assertion);
    await mutateRecord(planned.id, manager.workspace_id, record => { record.view.tasks[0].proposal!.merchant = "Changed after ceremony"; });
    await assert.rejects(decideTask(task.id, manager, exact, "approve", hash), code("passkey_required"));
    await mutateRecord(planned.id, manager.workspace_id, record => { record.view.tasks[0].proposal!.merchant = task.proposal!.merchant; });
    assert.equal(hash, (await approvalRequirement(task.id, manager, exact)).action_hash);
    const approved = await decideTask(task.id, manager, exact, "approve", hash); assert.equal(approved.reservations.length, 1);
    const replay = await decideTask(task.id, manager, exact, "approve"); assert.equal(replay.reservations.length, 1);
  });
});

test("local fallback concurrent first enrollment cannot replace the winning credential", async t => {
  for (const [key, value] of Object.entries({ SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined, OCT3_APP_URL: "http://localhost:3003" })) {
    const old = process.env[key]; if (value === undefined) delete process.env[key]; else process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  const principal: Principal = { id: "synthetic-local-manager", workspace_id: "synthetic-local-passkey-race", role: "manager" };
  const device = await virtualPasskeyDevice(); t.after(() => device.close());
  const first = await registrationOptions(principal), second = await registrationOptions(principal);
  const firstResponse = await device.register(first.options), secondResponse = await device.register(second.options);
  const results = await Promise.allSettled([
    verifyRegistration(principal, { challenge_id: first.challenge_id, response: firstResponse }),
    verifyRegistration(principal, { challenge_id: second.challenge_id, response: secondResponse }),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1, "Only one initial passkey may be enrolled even when two verified ceremonies race");
});
