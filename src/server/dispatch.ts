import { randomUUID } from "node:crypto";
import { Client } from "eve/client";
import { activity, refresh, runFixture } from "./missions";
import { assertMissionServicePaymentVerified } from "./service-payment-gate";
import { getRecord, mutateRecord } from "./store";

export async function dispatchMission(id: string, workspace: string, origin: string, onlyTaskId?: string) {
  const record = await getRecord(id, workspace);
  if (record.view.mode === "fixture") return (await runFixture(id, workspace)).view;
  assertMissionServicePaymentVerified(record);
  if (!process.env.ANTHROPIC_API_KEY || !process.env.OCT3_AGENT_TOKEN) {
    return (await mutateRecord(id, workspace, mission => {
      for (const task of mission.view.tasks) if (task.status === "queued") { task.status = "needs_human"; task.blocker = "Configure Claude and the agent credential to start durable browser research."; }
      refresh(mission);
    })).view;
  }
  const claimId = randomUUID();
  let current = record;
  const needsClaim = !record.eve_session_id || !onlyTaskId;
  if (needsClaim) {
    current = await mutateRecord(id, workspace, mission => {
      assertMissionServicePaymentVerified(mission);
      // A replan cannot clear an ambiguous session creation. Reconcile that
      // first session before allowing any revision to create another one.
      if (!mission.eve_session_id && mission.eve_dispatch) return;
      if (mission.eve_dispatch?.revision === mission.view.revision) return;
      mission.eve_dispatch = {
        revision: mission.view.revision,
        state: "claimed",
        claim_id: claimId,
        claimed_at: new Date().toISOString(),
      };
    });
    if (current.eve_dispatch?.claim_id !== claimId) return current.view;
  }
  try {
    const client = new Client({ host: process.env.OCT3_APP_URL || origin, auth: { bearer: process.env.OCT3_AGENT_TOKEN }, redirect: "error" });
    const message = onlyTaskId
      ? `Retry read-only research for task ${onlyTaskId} in mission ${id}, revision ${current.view.revision}. Call research_task with this exact task_id. Do not restart any other lane.`
      : `Research mission ${id}, revision ${current.view.revision}. Call research_mission now. This is read-only research; return the actual persisted outcomes and handoffs.`;
    let sessionId = current.eve_session_id;
    if (sessionId) await client.sessions.attach(sessionId).send(message);
    else {
      const result = await client.sessions.create({ message });
      sessionId = result.session.state.sessionId;
    }
    return (await mutateRecord(id, workspace, mission => {
      assertMissionServicePaymentVerified(mission);
      if (needsClaim && mission.eve_dispatch?.claim_id !== claimId) return;
      mission.eve_session_id = sessionId;
      if (needsClaim) mission.eve_dispatch!.state = "sent";
      activity(mission, onlyTaskId ? "Claude accepted a retry of the selected worker in the existing mission." : `Claude accepted the mission in a durable Eve session. ${mission.view.tasks.length} browser workers will research concurrently.`);
    })).view;
  } catch {
    return (await mutateRecord(id, workspace, mission => {
      if (needsClaim && mission.eve_dispatch?.claim_id === claimId) mission.eve_dispatch.state = "uncertain";
      for (const task of mission.view.tasks) if (task.status === "queued") { task.status = "needs_human"; task.blocker = "The Eve runtime could not accept the job. Retry research after the runtime is ready."; }
      activity(mission, "Durable dispatch needs attention. Its external acceptance is uncertain, so the server will not create another Eve session automatically.", "warning");
      refresh(mission);
    })).view;
  }
}
