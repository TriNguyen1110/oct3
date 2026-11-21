import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { approvalRequirement, createMission, decideTask, observedCharges, runFixture, walletAction } from "../src/server/missions";
import { getRecord, mutateRecord } from "../src/server/store";
import { AppError } from "../src/server/errors";
import type { Principal } from "../src/server/auth";
import type { Evidence, MissionInput, Proposal } from "../src/shared/contracts";
import { defaultInput } from "../src/client/preview";
import { approveWithFakePasskey } from "./helpers/fake-webauthn";

const manager: Principal = { id: "wallet-manager", workspace_id: "wallet-gate", role: "manager" };
const code = (value: string) => (error: unknown) => error instanceof AppError && error.code === value;
const input: MissionInput = {
  objective: "Synthetic wallet gate", currency: "USD", purchase_budget_minor: 900000,
  deadline: "2099-10-07T12:00:00Z", headcount: 1,
  requirements: { amazon: { category: "toothpaste", delivery_ref: "synthetic" } },
};
const exact = (proposal: Proposal) => ({ proposal_id: proposal.id, revision: proposal.revision });

function setEnv(t: { after: (fn: () => void) => void }, changes: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(changes)) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
}

test("walletAction needs every charge observed and the observed checkout total to equal the proposal", async t => {
  const directory = await mkdtemp(join(tmpdir(), "cue-wallet-gate-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  setEnv(t, { OCT3_STATE_PATH: join(directory, "state.json"), SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined, VERCEL: undefined });
  t.mock.method(globalThis, "fetch", () => { throw new Error("wallet gate tests must not access the network"); });

  let sequence = 0;
  /** An approved, paid live Amazon task with one checkout observation. */
  async function approvedTask(change: Partial<Proposal> = {}, checkout: Partial<Evidence> | null = {}) {
    const { record } = await createMission(structuredClone(input), manager, `wallet-gate-${++sequence}`, "live");
    const taskId = `${record.id}:amazon`;
    const proposal: Proposal = {
      id: `proposal-${sequence}`, task_id: taskId, revision: 1, option_id: `option-${sequence}`,
      merchant: "Amazon", title: "Synthetic toothpaste", source_url: "https://www.amazon.com/dp/B0195UTBKA", quantity: 1,
      recipient_ref: "synthetic", deadline: input.deadline,
      subtotal_minor: 399, tax_minor: 31, shipping_minor: 0, fees_minor: 0, total_minor: 430,
      currency: "USD", expires_at: "2099-10-03T00:00:00.000Z", ...change,
    };
    await mutateRecord(record.id, manager.workspace_id, stored => {
      stored.view.service_payment = { status: "paid", amount_minor: 50, currency: "USD", mode: "test", reference: "synthetic-fee" };
      const task = stored.view.tasks.find(item => item.id === taskId)!;
      task.proposal = structuredClone(proposal);
      task.approval = { id: `approval-${sequence}`, proposal_id: proposal.id, revision: 1, state: "pending" };
      task.status = "awaiting_approval";
      if (checkout) task.evidence.push({
        id: `checkout-${sequence}`, task_id: taskId, source_url: proposal.source_url, observed_at: "2026-10-03T00:00:00.000Z",
        title: "Synthetic checkout", detail: "Synthetic checkout preview only", mode: "live", kind: "checkout_preview",
        proposal_id: proposal.id, revision: proposal.revision, amount_minor: proposal.total_minor, ...checkout,
      });
    });
    await approveWithFakePasskey(taskId, manager, exact(proposal));
    const record2 = await getRecord(record.id, manager.workspace_id);
    return () => walletAction(record2, taskId, exact(proposal));
  }

  await t.test("a fully observed checkout that matches the proposal passes", async () => {
    const result = (await approvedTask())();
    assert.equal(result.proposal.total_minor, 430);
    assert.equal(result.proposal.tax_minor, 31);
  });
  await t.test("an observed checkout total that differs from the proposal is refused", async () => {
    assert.throws(await approvedTask({}, { amount_minor: 431 }), code("checkout_total_mismatch"));
  });
  await t.test("a checkout observation without a total is refused", async () => {
    assert.throws(await approvedTask({}, { amount_minor: undefined }), code("checkout_total_mismatch"));
  });
  await t.test("no checkout observation is refused", async () => {
    assert.throws(await approvedTask({}, null), code("checkout_required"));
  });
  for (const key of ["tax_minor", "shipping_minor", "fees_minor"] as const) {
    await t.test(`an unknown ${key} blocks the wallet instead of counting as 0`, async () => {
      const known = { tax_minor: 31, shipping_minor: 0, fees_minor: 0 };
      const total = 399 + Object.entries(known).filter(([name]) => name !== key).reduce((sum, [, value]) => sum + value, 0);
      assert.throws(await approvedTask({ [key]: null, total_minor: total }), code("charges_unknown"));
    });
  }
  await t.test("a total above the installation's wallet limit is refused", async () => {
    assert.throws(await approvedTask({ subtotal_minor: 50001, tax_minor: 0, total_minor: 50001 }), code("wallet_limit_exceeded"));
  });
  await t.test("a merchant missing from the installation's policy is refused", async t2 => {
    const policy = JSON.parse(await readFile(new URL("./fixtures/installation-policy.json", import.meta.url), "utf8"));
    policy.merchants.amazon = ["smile.amazon.com"];
    const path = join(directory, "narrow-policy.json"); await writeFile(path, JSON.stringify(policy));
    const run = await approvedTask();
    setEnv(t2, { OCT3_POLICY_FILE: path });
    assert.throws(run, code("merchant_not_allowed"));
  });
  await t.test("a missing installation policy refuses the wallet", async t2 => {
    const run = await approvedTask();
    setEnv(t2, { OCT3_POLICY_FILE: join(directory, "absent.json") });
    assert.throws(run, code("installation_policy_missing"));
  });
});

test("proposal charges come from evidence and are unknown when nothing observed them", async t => {
  const directory = await mkdtemp(join(tmpdir(), "cue-charges-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  setEnv(t, { OCT3_STATE_PATH: join(directory, "state.json"), SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined, VERCEL: undefined });
  const base: Evidence = { id: "e", task_id: "t", source_url: "https://www.amazon.com/", observed_at: "2026-10-03T00:00:00Z", title: "x", detail: "x", mode: "live" };
  assert.deepEqual(observedCharges([base]), { tax_minor: null, shipping_minor: null, fees_minor: null });
  assert.deepEqual(observedCharges([{ ...base, charges: { tax_minor: 31, shipping_minor: 0 } }]), { tax_minor: 31, shipping_minor: 0, fees_minor: null });
  assert.deepEqual(observedCharges([{ ...base, charges: { tax_minor: 31 } }, { ...base, charges: { tax_minor: 40 } }]).tax_minor, null);
  assert.equal(observedCharges([{ ...base, charges: { fees_minor: -1 } }]).fees_minor, null);

  const made = await createMission(structuredClone(defaultInput), manager, "charges-fixture-0001", "fixture");
  const planned = await runFixture(made.record.id, manager.workspace_id);
  for (const task of planned.view.tasks) {
    const proposal = task.proposal!;
    assert.equal(proposal.tax_minor, null); assert.equal(proposal.shipping_minor, null); assert.equal(proposal.fees_minor, null);
    assert.equal(proposal.total_minor, proposal.subtotal_minor);
  }
});
