import { randomUUID } from "node:crypto";
import { researchTask } from "../browser";
import type { Lane } from "../shared/contracts";
import { activity, refresh, runFixture } from "./missions";
import { beginResearchAttempt, finishResearchAttempt, researchFingerprint, researchGate } from "./research-policy";
import { assertMissionServicePaymentVerified } from "./service-payment-gate";
import { acquireLane, getRecord, mutateRecord, releaseLane } from "./store";

export async function runMissionResearch(id: string, workspace: string, onlyTaskId?: string) {
  const initial = await getRecord(id, workspace);
  if (initial.view.mode === "fixture") return (await runFixture(id, workspace)).view;
  assertMissionServicePaymentVerified(initial);
  const revision = initial.view.revision;
  await Promise.all(initial.view.tasks.filter(x => !onlyTaskId || x.id === onlyTaskId).map(async original => {
    const lane: Lane = original.lane;
    const owner = `${id}:${revision}:${lane}:${randomUUID()}`;
    const acquired = await acquireLane(workspace, lane, owner);
    if (!acquired) {
      await mutateRecord(id, workspace, record => {
        if (record.view.revision !== revision) return;
        const task = record.view.tasks.find(x => x.id === original.id)!;
        if (task.status !== "queued") return;
        record.research_attempts ||= {};
        if (!record.research_attempts[task.id] || record.research_attempts[task.id].revision !== revision) record.research_attempts[task.id] = { revision, attempts: 0, fingerprint: researchFingerprint(), last_cleanup: "not_started", cooldown_until: "" };
        finishResearchAttempt(record, task.id, revision, { blocker_code: "profile_busy", cleanup: "not_started" });
        task.status = "needs_human"; task.blocker = "This account's browser is already in use. Retry research after the other mission finishes.";
        refresh(record);
      });
      return;
    }
    let claimed = false, attempt = 0;
    try {
      await mutateRecord(id, workspace, record => {
        claimed = false;
        if (record.view.revision !== revision) return;
        const task = record.view.tasks.find(x => x.id === original.id)!;
        if (["confirmed", "executing", "options_ready", "awaiting_approval", "prepared", "needs_human"].includes(task.status)) return;
        const previous = record.research_claims[task.id];
        if (previous?.revision === revision && Date.parse(previous.expires_at) > Date.now() && task.status === "researching") return;
        const gate = researchGate(record, task.id);
        if (gate) {
          task.status = "needs_human"; task.blocker = gate.message; task.progress = "Research retry paused";
          activity(record, `${lane}: ${gate.code}. ${gate.message}`, "warning", lane); refresh(record); return;
        }
        attempt = beginResearchAttempt(record, task.id);
        record.research_claims[task.id] = { revision, expires_at: new Date(Date.now() + 150000).toISOString() };
        task.status = "researching"; task.started_at ||= new Date().toISOString(); task.blocker = undefined;
        task.progress = "Opening a persistent Surfsky browser";
        activity(record, `${lane}: read-only browser research attempt ${attempt} started.`, "info", lane); refresh(record); claimed = true;
      });
      if (!claimed) return;
      const result = await researchTask({
        task_id: original.id, lane, requirements: initial.input.requirements[lane]!,
        deadline: initial.input.deadline, budget_minor: initial.input.purchase_budget_minor,
        attempt_key: `${id}:${revision}:${lane}:research:${attempt}`, timeout_ms: 90000,
        onProgress: async event => {
          await mutateRecord(id, workspace, record => {
            if (record.view.revision !== revision) return;
            const task = record.view.tasks.find(x => x.id === original.id)!;
            task.progress = event.message;
            activity(record, event.message, "info", lane);
          });
        },
      });
      await mutateRecord(id, workspace, record => {
        finishResearchAttempt(record, original.id, revision, result);
        if (record.view.revision !== revision) return;
        const task = record.view.tasks.find(x => x.id === original.id)!;
        task.options = result.options; task.evidence = result.evidence;
        task.status = result.options.length ? "options_ready" : "needs_human";
        task.progress = result.progress || "Browser observations recorded";
        task.blocker = result.blocker || "Select an option and verify the final merchant checkout total, including fees, before a purchase proposal can be approved.";
        if (result.blocker_code || result.cleanup === "unconfirmed") {
          const gate = researchGate(record, task.id);
          if (gate) task.blocker += ` ${gate.message}`;
        }
        activity(record, `${lane}: attempt ${attempt}, ${result.options.length} grounded options in ${(result.elapsed_ms / 1000).toFixed(1)}s; cleanup ${result.cleanup}${result.blocker_code ? `; blocker ${result.blocker_code}` : ""}. No commitment made.`, result.options.length ? "success" : "warning", lane);
        refresh(record);
      });
    } catch {
      await mutateRecord(id, workspace, record => {
        if (claimed) finishResearchAttempt(record, original.id, revision, { blocker_code: "provider_error", cleanup: "unconfirmed" });
        if (record.view.revision !== revision) return;
        const task = record.view.tasks.find(x => x.id === original.id)!;
        task.status = "needs_human"; task.blocker = "Browser research could not finish. Its start or cleanup is uncertain; the server must verify this lane is stopped before another attempt. No purchase was attempted.";
        task.progress = "Browser needs attention"; refresh(record);
      });
    } finally { await releaseLane(workspace, lane, owner); }
  }));
  return (await getRecord(id, workspace)).view;
}
