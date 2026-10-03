import { presentMission } from "@/src/server/presentation";
import { z } from "zod";
import { verifyLaneStopped } from "@/src/browser";
import { requireAuth } from "@/src/server/auth";
import { dispatchMission } from "@/src/server/dispatch";
import { AppError, handle } from "@/src/server/errors";
import { activity, refresh } from "@/src/server/missions";
import { researchGate } from "@/src/server/research-policy";
import { findTask, mutateRecord } from "@/src/server/store";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const principal = requireAuth(request);
    const { expected_revision } = z.object({ expected_revision: z.number().int().min(1) }).parse(await request.json());
    const taskId = (await context.params).id;
    const found = await findTask(taskId, principal.workspace_id);
    if (found.view.revision !== expected_revision) throw new AppError(409, "revision_conflict", "Review the latest mission before retrying.");
    const priorGate = found.view.mode === "live" ? researchGate(found, taskId) : null;
    let stoppedVerified = false;
    if (priorGate?.code === "research_reconciliation_required") {
      const result = await verifyLaneStopped(found.view.tasks.find(x => x.id === taskId)!.lane);
      if (!result.confirmed) throw new AppError(409, "research_reconciliation_required", result.detail);
      stoppedVerified = true;
    } else if (priorGate) throw priorGate;
    const record = await mutateRecord(found.id, principal.workspace_id, mission => {
      if (mission.view.revision !== expected_revision) throw new AppError(409, "revision_conflict", "Review the latest mission before retrying.");
      const task = mission.view.tasks.find(x => x.id === taskId)!;
      const activeClaim = mission.research_claims[taskId];
      if (task.status === "queued" || (activeClaim && Date.parse(activeClaim.expires_at) > Date.now()) || task.status === "executing" || task.status === "confirmed" || mission.reservations.some(x => x.task_id === taskId && x.state !== "released")) throw new AppError(409, "task_busy", "This worker is active or has allocated spending. Reconcile it before retrying research.");
      if (mission.view.mode === "fixture") { activity(mission, `${task.lane}: fixture research is already loaded. No remote browser exists for this run.`, "info", task.lane); return; }
      if (stoppedVerified) {
        const prior = mission.research_attempts?.[taskId];
        if (prior?.attempts !== found.research_attempts?.[taskId]?.attempts || activeClaim?.expires_at !== found.research_claims[taskId]?.expires_at) throw new AppError(409, "research_state_changed", "The worker changed while its browser was checked. Read the latest status before retrying.");
        if (prior) { prior.last_cleanup = "confirmed"; prior.last_blocker_code ||= "provider_error"; }
        delete mission.research_claims[taskId];
        activity(mission, `${task.lane}: Surfsky verified the exact existing profile is stopped before retry.`, "info", task.lane);
      }
      const gate = researchGate(mission, taskId);
      if (gate) throw gate;
      task.status = "queued"; task.blocker = undefined; task.progress = "Read-only research retry requested";
      task.proposal = undefined; if (task.approval) task.approval.state = "stale";
      activity(mission, `${task.lane}: ${principal.role} requested read-only research again. Other workers are unchanged.`, "info", task.lane); refresh(mission);
    });
    const view = record.view.mode === "fixture" ? record.view : await dispatchMission(record.id, principal.workspace_id, new URL(request.url).origin, taskId);
    return Response.json(presentMission(view, new URL(request.url).origin), { status: 202, headers: { "cache-control": "no-store" } });
  });
}
