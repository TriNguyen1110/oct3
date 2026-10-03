/** Opt-in synthetic cloud proof. Never enrolls the actual demo manager or executes a merchant action. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { virtualPasskeyDevice } from "../tests/helpers/virtual-passkey";
import { registrationOptions, verifyRegistration, passkeyStatus, approvalOptions, verifyApproval } from "../src/server/passkeys";
import { createMission, runFixture, decideTask } from "../src/server/missions";
import { mutateRecord } from "../src/server/store";
import type { Principal } from "../src/server/auth";
import type { MissionInput } from "../src/shared/contracts";

if (process.argv[2] !== "--synthetic-cloud") throw new Error("Explicit --synthetic-cloud is required.");
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase credentials are required privately.");
process.env.OCT3_APP_URL = "http://localhost:3003";
const workspace = `synthetic-passkey-${randomUUID()}`;
const principal: Principal = { workspace_id: workspace, id: "synthetic-manager", role: "manager" };
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const report: Record<string, unknown> = { checked_at: new Date().toISOString(), synthetic: true, storage: "actual Supabase", authenticator: "Chromium virtual authenticator; no user hardware", merchant_actions: 0, real_manager_credential_changed: false };
const device = await virtualPasskeyDevice();
let failure = false;
try {
  assert.equal((await passkeyStatus(principal)).enrolled, false);
  const enrollment = await registrationOptions(principal);
  const attestation = await device.register(enrollment.options);
  assert.deepEqual(await verifyRegistration(principal, { challenge_id: enrollment.challenge_id, response: attestation }), { verified: true });
  assert.equal((await passkeyStatus(principal)).enrolled, true);
  report.registration_persisted = true;
  const input: MissionInput = { objective: "Synthetic passkey cloud verification — no merchant action", currency: "USD", purchase_budget_minor: 90000, deadline: "2026-10-16T18:00:00-07:00", headcount: 1, requirements: { amazon: { category: "synthetic", delivery_ref: "synthetic" }, fiverr: { category: "synthetic", brief: "synthetic", due_date: "2026-10-15T18:00:00-07:00" }, event_tickets: { event_url: "https://luma.com/OpenTogether", date: "2026-10-16T18:00:00-07:00", quantity: 1, attendee_ref: "synthetic" } } };
  const made = await createMission(input, principal, `synthetic-${randomUUID()}`, "fixture");
  const planned = await runFixture(made.record.id, workspace);
  // Only this isolated synthetic record exercises the live approval gate. No dispatch or resume.
  await mutateRecord(planned.id, workspace, record => { record.view.mode = "live"; });
  const task = planned.view.tasks[0];
  const exact = { proposal_id: task.proposal!.id, revision: task.proposal!.revision };
  await assert.rejects(decideTask(task.id, principal, exact, "approve"), (error: any) => error?.code === "passkey_required");
  report.missing_passkey_denied = true;
  const challenge = await approvalOptions(task.id, principal, exact);
  const assertion = await device.authenticate(challenge.options);
  const proofs = await Promise.allSettled([0, 1].map(() => verifyApproval(task.id, principal, exact, { challenge_id: challenge.challenge_id, response: assertion })));
  assert.equal(proofs.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(proofs.filter(result => result.status === "rejected").length, 1);
  report.concurrent_challenge_consume_winners = 1;
  const verified = proofs.find(result => result.status === "fulfilled") as PromiseFulfilledResult<string>;
  const approved = await decideTask(task.id, principal, exact, "approve", verified.value);
  assert.equal(approved.view.tasks[0].approval?.state, "approved");
  assert.equal(approved.reservations.filter(row => row.state === "reserved").length, 1);
  report.exact_signed_approval_persisted = true;
  const replay = await decideTask(task.id, principal, exact, "approve");
  assert.equal(replay.reservations.filter(row => row.state === "reserved").length, 1);
  report.idempotent_reservation = true;
  await assert.rejects(verifyApproval(task.id, principal, exact, { challenge_id: challenge.challenge_id, response: assertion }));
  report.assertion_replay_denied = true;
} catch (error) {
  failure = true;
  report.passed = false;
  report.failure_code = error instanceof Error && "code" in error ? String(error.code) : "assertion_or_provider_failure";
} finally {
  await device.close();
  const cleanup: Record<string, boolean> = {};
  // Exact random synthetic workspace only; never delete demo-manager records.
  if (!workspace.startsWith("synthetic-passkey-")) throw new Error("Cleanup namespace mismatch.");
  for (const table of ["oct3_passkey_challenges", "oct3_passkey_credentials", "oct3_missions"]) {
    const result = await db.from(table).delete().eq("workspace_id", workspace);
    cleanup[table] = !result.error;
  }
  report.synthetic_records_removed = Object.values(cleanup).every(Boolean);
  report.passed = !failure && report.synthetic_records_removed;
  await writeFile("reports/performance/passkey-cloud-proof.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
}
