// Live-approval and wallet bypass attempts against the real approve route, passkeys.ts binding and
// wallet gate. A fake WebAuthn library (tests/helpers/fake-webauthn.ts) replaces only the crypto, so
// challenge binding, task scope, expiry, single use, request origin and approver policy all run.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { approvalRequirement, createMission, decideTask, runFixture, walletAction } from "../src/server/missions";
import { getRecord, mutateRecord } from "../src/server/store";
import { setWebAuthnLibraryForTests, verifyApproval } from "../src/server/passkeys";
import { AppError } from "../src/server/errors";
import type { Principal } from "../src/server/auth";
import type { MissionInput, Proposal } from "../src/shared/contracts";
import { defaultInput } from "../src/client/preview";
import { POST as approveRoute } from "../app/api/tasks/[id]/approve/route";
import { FAKE_ORIGIN, approveWithFakePasskey, enrollFakePasskey, fakeAssertion, fakeChallenge, fakeVerifiedApproval, fakeWebAuthn } from "./helpers/fake-webauthn";

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
async function liveMission(principal: Principal, key: string) {
  const made = await createMission(structuredClone(defaultInput), principal, key, "fixture");
  const planned = await runFixture(made.record.id, principal.workspace_id);
  // A fixture plan gives a real stored proposal; flipping the mode makes it a live action.
  await mutateRecord(planned.id, principal.workspace_id, record => { record.view.mode = "live"; });
  const task = planned.view.tasks[0];
  return { id: planned.id, task, exact: { proposal_id: task.proposal!.id, revision: task.proposal!.revision } };
}
const call = (taskId: string, body: unknown, origin: string | null = FAKE_ORIGIN) => approveRoute(new Request(`${FAKE_ORIGIN}/api/tasks/${taskId}/approve`, {
  method: "POST", headers: { authorization: "Bearer synthetic-bypass-manager", ...(origin === null ? {} : { origin }), "content-type": "application/json" }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id: taskId }) });
const passkeyBody = (exact: { proposal_id: string; revision: number }, challenge: { challenge_id: string; challenge: string; credential: string }, signed = challenge.challenge) =>
  ({ ...exact, passkey: { challenge_id: challenge.challenge_id, response: fakeAssertion(signed, FAKE_ORIGIN, challenge.credential) } });
const policyFixture = async () => JSON.parse(await readFile(new URL("./fixtures/installation-policy.json", import.meta.url), "utf8"));

test("live approval bypass attempts are refused", async t => {
  const directory = await mkdtemp(join(tmpdir(), "cue-approval-bypass-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  setEnv(t, { OCT3_STATE_PATH: join(directory, "state.json"), SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined, VERCEL: undefined,
    OCT3_APP_URL: undefined, LINK_ACCESS_TOKEN: undefined, LINK_AUTH_FILE: undefined, OCT3_MANAGER_TOKEN: "synthetic-bypass-manager", OCT3_DEMO_MODE: "true", OCT3_DEMO_SKIP_PASSKEY: "true" });
  t.mock.method(globalThis, "fetch", () => { throw new Error("approval bypass tests must not access the network"); });
  const previous = setWebAuthnLibraryForTests(fakeWebAuthn);
  t.after(() => { setWebAuthnLibraryForTests(previous); });
  await enrollFakePasskey(routeManager);

  await t.test("no passkey with demo switches on is refused", async () => {
    const a = await liveMission(routeManager, "bypass-nopasskey-0001");
    const r = await call(a.task.id, a.exact);
    assert.equal(r.status, 403); assert.equal((await r.json()).error.code, "passkey_required");
    assert.equal((await getRecord(a.id, routeManager.workspace_id)).reservations.length, 0);
  });
  await t.test("a valid proof approves once; replaying the same proof is refused", async () => {
    const a = await liveMission(routeManager, "bypass-replay-0001");
    const ch = await fakeChallenge(a.task.id, routeManager, a.exact);
    const ok = await call(a.task.id, passkeyBody(a.exact, ch));
    assert.equal(ok.status, 200, JSON.stringify(await ok.clone().json()));
    assert.equal((await getRecord(a.id, routeManager.workspace_id)).reservations.filter(x => x.state === "reserved").length, 1);
    const again = await call(a.task.id, passkeyBody(a.exact, ch));
    assert.equal(again.status, 409); assert.equal((await again.json()).error.code, "passkey_challenge_invalid");
  });
  await t.test("a proof made for task A cannot approve task B", async () => {
    const a = await liveMission(routeManager, "bypass-scope-0001"), b = await liveMission(routeManager, "bypass-scope-0002");
    const ch = await fakeChallenge(a.task.id, routeManager, a.exact);
    const r = await call(b.task.id, passkeyBody(b.exact, ch));
    assert.equal(r.status, 409); assert.equal((await r.json()).error.code, "passkey_scope_mismatch");
    assert.equal((await getRecord(b.id, routeManager.workspace_id)).reservations.length, 0);
  });
  await t.test("an expired challenge is refused", async t2 => {
    const a = await liveMission(routeManager, "bypass-expired-0001");
    const ch = await fakeChallenge(a.task.id, routeManager, a.exact);
    const real = Date.now; t2.mock.method(Date, "now", () => real() + 6 * 60_000);
    const r = await call(a.task.id, passkeyBody(a.exact, ch));
    assert.equal(r.status, 409); assert.equal((await r.json()).error.code, "passkey_challenge_expired");
    assert.equal((await getRecord(a.id, routeManager.workspace_id)).reservations.length, 0);
  });
  await t.test("a passkey ceremony from another origin is refused even with a valid proof", async () => {
    for (const origin of ["https://attacker.example", "http://localhost:3004", null]) {
      const a = await liveMission(routeManager, `bypass-origin-${String(origin).replace(/[^a-z0-9]/gi, "")}-0001`);
      const ch = await fakeChallenge(a.task.id, routeManager, a.exact);
      const r = await call(a.task.id, passkeyBody(a.exact, ch), origin);
      assert.equal(r.status, 403, String(origin)); assert.equal((await r.json()).error.code, "invalid_origin");
      assert.equal((await getRecord(a.id, routeManager.workspace_id)).reservations.length, 0);
    }
  });
  await t.test("an assertion signed for a different challenge is refused", async () => {
    const a = await liveMission(routeManager, "bypass-otherchallenge-0001");
    const ch = await fakeChallenge(a.task.id, routeManager, a.exact);
    const r = await call(a.task.id, passkeyBody(a.exact, ch, "some-other-challenge"));
    assert.equal(r.status, 400); assert.equal((await r.json()).error.code, "passkey_verification_failed");
  });
  await t.test("a proposal changed after the prompt is refused", async () => {
    const a = await liveMission(routeManager, "bypass-stale-0001");
    const ch = await fakeChallenge(a.task.id, routeManager, a.exact);
    await mutateRecord(a.id, routeManager.workspace_id, r => { r.view.tasks[0].proposal!.title += " swapped"; });
    const r = await call(a.task.id, passkeyBody(a.exact, ch));
    assert.equal((await r.json()).error.code, "stale_proposal");
  });
  await t.test("another principal cannot use this manager's challenge", async () => {
    const a = await liveMission(routeManager, "bypass-principal-0001");
    const ch = await fakeChallenge(a.task.id, routeManager, a.exact);
    const other: Principal = { id: "demo-manager-2", workspace_id: "oct3-demo", role: "manager" };
    await assert.rejects(verifyApproval(a.task.id, other, a.exact, { challenge_id: ch.challenge_id, response: fakeAssertion(ch.challenge, FAKE_ORIGIN, ch.credential) }), code("passkey_challenge_invalid"));
  });
  await t.test("a hand-built proof with the right hash is refused", async () => {
    const a = await liveMission(routeManager, "bypass-forged-0001");
    const { action_hash } = await approvalRequirement(a.task.id, routeManager, a.exact);
    const forged = { via: "passkey" as const, action_hash, principal_id: routeManager.id, workspace_id: routeManager.workspace_id };
    await assert.rejects(decideTask(a.task.id, routeManager, a.exact, "approve", forged), code("passkey_required"));
    await assert.rejects(decideTask(a.task.id, routeManager, a.exact, "approve", Object.freeze({ ...forged })), code("passkey_required"));
    assert.equal((await getRecord(a.id, routeManager.workspace_id)).reservations.length, 0);
  });
  await t.test("a genuine proof for task A cannot approve task B directly", async () => {
    const a = await liveMission(routeManager, "bypass-direct-0001"), b = await liveMission(routeManager, "bypass-direct-0002");
    const proof = await fakeVerifiedApproval(a.task.id, routeManager, a.exact);
    await assert.rejects(decideTask(b.task.id, routeManager, b.exact, "approve", proof), code("passkey_required"));
  });
  await t.test("a genuine proof minted for one manager cannot approve as another", async () => {
    const otherManager: Principal = { id: "policy-test-manager", workspace_id: "oct3-demo", role: "manager" };
    const a = await liveMission(routeManager, "bypass-otherproof-0001");
    const proof = await fakeVerifiedApproval(a.task.id, routeManager, a.exact);
    await assert.rejects(decideTask(a.task.id, otherManager, a.exact, "approve", proof), code("passkey_required"));
  });
  await t.test("an approver not in the policy is refused even with a genuine proof", async t2 => {
    const pol = await policyFixture(); pol.approval.live_approvers = ["someone-else"];
    const other = join(directory, "other-approver.json"); await writeFile(other, JSON.stringify(pol));
    const a = await liveMission(routeManager, "bypass-approver-0001");
    const ch = await fakeChallenge(a.task.id, routeManager, a.exact);
    setEnv(t2, { OCT3_POLICY_FILE: other });
    const r = await call(a.task.id, passkeyBody(a.exact, ch));
    assert.equal(r.status, 403); assert.equal((await r.json()).error.code, "approver_not_allowed");
    assert.equal((await getRecord(a.id, routeManager.workspace_id)).reservations.length, 0);
  });
  await t.test("a missing, malformed or empty-approver policy refuses a live approval", async t2 => {
    const a = await liveMission(routeManager, "bypass-policy-0001");
    const proof = await fakeVerifiedApproval(a.task.id, routeManager, a.exact);
    const bad = join(directory, "bad.json"); await writeFile(bad, "{not json");
    const pol = await policyFixture(); pol.approval.live_approvers = [];
    const empty = join(directory, "empty.json"); await writeFile(empty, JSON.stringify(pol));
    setEnv(t2, { OCT3_POLICY_FILE: undefined });
    for (const file of [join(directory, "absent.json"), bad, empty]) {
      process.env.OCT3_POLICY_FILE = file;
      await assert.rejects(decideTask(a.task.id, routeManager, a.exact, "approve", proof), code("installation_policy_missing"), file);
    }
    assert.equal((await getRecord(a.id, routeManager.workspace_id)).reservations.length, 0);
  });
});

test("the WebAuthn test seam is refused in a deployment, a production build and outside the test runner", () => {
  for (const changes of [
    { VERCEL: "1", NODE_ENV: undefined },
    { VERCEL: undefined, NODE_ENV: "production" },
    // Outside the node test runner, with or without NODE_ENV=test.
    { VERCEL: undefined, NODE_ENV: undefined, NODE_TEST_CONTEXT: undefined },
    { VERCEL: undefined, NODE_ENV: "test", NODE_TEST_CONTEXT: undefined },
  ] as Array<Record<string, string | undefined>>) {
    const previous = { VERCEL: process.env.VERCEL, NODE_ENV: process.env.NODE_ENV, NODE_TEST_CONTEXT: process.env.NODE_TEST_CONTEXT };
    for (const [key, value] of Object.entries(changes)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    try { assert.throws(() => setWebAuthnLibraryForTests(fakeWebAuthn), /only available in tests/); }
    finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
  }
  // Inside the runner (this process) the seam works and hands back the library it replaced.
  assert.ok(process.env.NODE_TEST_CONTEXT);
  const previous = setWebAuthnLibraryForTests(fakeWebAuthn); setWebAuthnLibraryForTests(previous);
});

test("wallet gate: merchant lookalike hosts, charges and checkout totals", async t => {
  const directory = await mkdtemp(join(tmpdir(), "cue-wallet-bypass-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  setEnv(t, { OCT3_STATE_PATH: join(directory, "state.json"), SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined, VERCEL: undefined, OCT3_APP_URL: undefined });
  t.mock.method(globalThis, "fetch", () => { throw new Error("wallet bypass tests must not access the network"); });
  const manager: Principal = { id: "wallet-manager", workspace_id: "wallet-bypass", role: "manager" };
  const input: MissionInput = { objective: "Wallet bypass", currency: "USD", purchase_budget_minor: 900000, deadline: "2099-10-07T12:00:00Z", headcount: 1, requirements: { amazon: { category: "toothpaste", delivery_ref: "synthetic" } } };
  let seq = 0;
  async function prepared(change: Partial<Proposal>, observed: Array<number | undefined> = [undefined]) {
    const { record } = await createMission(structuredClone(input), manager, `wallet-bypass-${++seq}`, "live");
    const taskId = `${record.id}:amazon`;
    const proposal: Proposal = { id: `p-${seq}`, task_id: taskId, revision: 1, option_id: `o-${seq}`, merchant: "Amazon", title: "x", source_url: "https://www.amazon.com/dp/B0195UTBKA", quantity: 1, recipient_ref: "s", deadline: input.deadline, subtotal_minor: 399, tax_minor: 31, shipping_minor: 0, fees_minor: 0, total_minor: 430, currency: "USD", expires_at: "2099-10-03T00:00:00.000Z", ...change };
    await mutateRecord(record.id, manager.workspace_id, stored => {
      stored.view.service_payment = { status: "paid", amount_minor: 50, currency: "USD", mode: "test", reference: "s" };
      const task = stored.view.tasks.find(i => i.id === taskId)!;
      task.proposal = structuredClone(proposal); task.approval = { id: `a-${seq}`, proposal_id: proposal.id, revision: 1, state: "pending" }; task.status = "awaiting_approval";
      observed.forEach((amount, index) => task.evidence.push({ id: `c${index}-${seq}`, task_id: taskId, source_url: proposal.source_url, observed_at: "2026-10-03T00:00:00.000Z", title: "c", detail: "c", mode: "live", kind: "checkout_preview", proposal_id: proposal.id, revision: 1, amount_minor: amount ?? proposal.total_minor }));
    });
    await approveWithFakePasskey(taskId, manager, { proposal_id: proposal.id, revision: 1 });
    const rec = await getRecord(record.id, manager.workspace_id);
    return () => walletAction(rec, taskId, { proposal_id: proposal.id, revision: 1 });
  }
  for (const url of ["https://www.amazon.com.evil.example/dp/B0195UTBKA", "https://evil.www.amazon.com/dp/B0195UTBKA", "https://evilamazon.com/dp/B0195UTBKA", "https://xn--amazn-mua.com/dp/B0195UTBKA", "https://www.amazon.com./dp/B0195UTBKA", "https://WWW.AMAZON.COM@evil.example/dp/x"]) {
    await t.test(`lookalike host ${url} is refused`, async () => {
      assert.throws(await prepared({ source_url: url }), (e: unknown) => e instanceof AppError && ["merchant_not_allowed", "invalid_proposal"].includes(e.code));
    });
  }
  await t.test("an allowed host in upper case is normalized and passes", async () => { (await prepared({ source_url: "https://WWW.AMAZON.COM/dp/B0195UTBKA" }))(); });
  await t.test("every checkout observation must equal the approved total", async () => {
    (await prepared({}, [undefined, undefined]))();
    assert.throws(await prepared({}, [undefined, 530]), code("checkout_total_mismatch"));
    assert.throws(await prepared({}, [530, undefined]), code("checkout_total_mismatch"));
  });
  await t.test("total at the policy limit passes, one cent above fails, zero fails", async () => {
    (await prepared({ subtotal_minor: 50000, tax_minor: 0, total_minor: 50000 }))();
    assert.throws(await prepared({ subtotal_minor: 49970, tax_minor: 31, total_minor: 50001 }), code("wallet_limit_exceeded"));
    assert.throws(await prepared({ subtotal_minor: 0, tax_minor: 0, total_minor: 0 }, [0]), code("wallet_limit_exceeded"));
  });
  await t.test("unknown charges are refused", async () => {
    assert.throws(await prepared({ tax_minor: null, shipping_minor: null, fees_minor: null, total_minor: 399 }), code("charges_unknown"));
  });
});
