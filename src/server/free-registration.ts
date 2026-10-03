import { createHash, randomUUID } from "node:crypto";
import { executeFreeRegistration, prepareFreeRegistration } from "../browser/luma-registration";
import type { Evidence, Proposal, Task } from "../shared/contracts";
import { FREE_REGISTRATION_EVENT_URL, type FreeRegistrationSnapshot, type RegistrationAttendee } from "../shared/registration";
import type { Principal } from "./auth";
import { AppError } from "./errors";
import type { MissionRecord } from "./model";
import { getPreferences } from "./preferences";
import { assertMissionServicePaymentVerified } from "./service-payment-gate";
import { acquireLane, findTask, mutateRecord, releaseLane } from "./store";
import { activity, refresh } from "./missions";

const PREPARE_WINDOW_MS = 30 * 60 * 1000;
const FREE_REGISTRATION_LOCAL_DATE = "2026-10-16";

function assertPreparationUnlocked(record: MissionRecord, task: Task) {
  const attempt = record.attempts[task.id];
  if (["executing", "confirmed"].includes(task.status)
    || (attempt && ["claimed", "uncertain"].includes(attempt.state))
    || record.reservations.some(item => item.task_id === task.id && ["committed", "uncertain"].includes(item.state))) {
    throw new AppError(409, "execution_locked", "This registration has a protected commitment. Reconcile its outcome before preparing another action.");
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

function profileHash(profile: { name: string; email: string; company: string; role: string }, updatedAt: string | null) {
  return createHash("sha256").update(JSON.stringify(canonical({ profile, updated_at: updatedAt }))).digest("hex");
}

function actionHash(record: MissionRecord, task: Task, proposalId: string, snapshot: FreeRegistrationSnapshot, attendee: RegistrationAttendee, savedProfileHash: string) {
  return createHash("sha256").update(JSON.stringify({
    workspace_id: record.workspace_id,
    mission_id: record.id,
    task_id: task.id,
    revision: record.view.revision,
    proposal_id: proposalId,
    snapshot: canonical(snapshot),
    attendee: canonical(attendee),
    profile_hash: savedProfileHash,
  })).digest("hex");
}

function assertSnapshot(snapshot: FreeRegistrationSnapshot, expectedDate: string) {
  if (snapshot.provider !== "luma" || snapshot.source_url !== FREE_REGISTRATION_EVENT_URL || snapshot.quantity !== 1
    || snapshot.total_minor !== 0 || snapshot.currency !== "USD" || snapshot.requires_approval !== false
    || !snapshot.event_api_id || !snapshot.ticket_type_api_id || !snapshot.event_title || !snapshot.ticket_name
    || !Number.isFinite(Date.parse(snapshot.observed_at)) || !Number.isFinite(Date.parse(snapshot.event_start_at))
    || expectedDate.slice(0, 10) !== FREE_REGISTRATION_LOCAL_DATE) {
    throw new AppError(409, "registration_snapshot_invalid", "The observed free registration does not match the exact selected event, date and ticket.");
  }
}

export function assertPreparedFreeRegistration(record: MissionRecord, task: Task) {
  const prepared = record.prepared_registrations?.[task.id];
  const proposal = task.proposal;
  if (!prepared || !proposal || proposal.action_type !== "free_registration" || proposal.action_hash !== prepared.action_hash
    || prepared.proposal_id !== proposal.id || prepared.revision !== proposal.revision || proposal.revision !== record.view.revision
    || proposal.task_id !== task.id || proposal.currency !== "USD" || proposal.merchant !== "Luma"
    || proposal.option_id !== `luma:${prepared.snapshot.ticket_type_api_id}`
    || proposal.title !== `${prepared.snapshot.event_title} — ${prepared.snapshot.ticket_name}`
    || proposal.source_url !== FREE_REGISTRATION_EVENT_URL || proposal.recipient_ref !== "manager" || proposal.quantity !== 1
    || proposal.deadline !== prepared.snapshot.event_start_at
    || proposal.subtotal_minor !== 0 || proposal.tax_minor !== 0 || proposal.shipping_minor !== 0 || proposal.fees_minor !== 0 || proposal.total_minor !== 0
    || !Number.isFinite(Date.parse(proposal.expires_at)) || Date.parse(proposal.expires_at) <= Date.now()
    || prepared.action_hash !== actionHash(record, task, proposal.id, prepared.snapshot, prepared.attendee, prepared.profile_hash)) {
    throw new AppError(409, "registration_action_changed", "The prepared registration no longer matches the exact private action reviewed by the manager.");
  }
  assertSnapshot(prepared.snapshot, record.input.requirements.event_tickets.date);
  return prepared;
}

function boundEvidence(evidence: Evidence[], proposal: Proposal, kind: Evidence["kind"]): Evidence[] {
  return evidence.map(item => ({
    ...item,
    source_url: FREE_REGISTRATION_EVENT_URL,
    task_id: proposal.task_id,
    mode: "live" as const,
    kind,
    proposal_id: proposal.id,
    revision: proposal.revision,
  }));
}

export async function prepareFreeRegistrationTask(taskId: string, principal: Principal, expectedRevision: number) {
  if (principal.role !== "manager") throw new AppError(403, "manager_required", "A manager must prepare this registration.");
  const found = await findTask(taskId, principal.workspace_id);
  assertMissionServicePaymentVerified(found);
  const task = found.view.tasks.find(item => item.id === taskId)!;
  if (found.view.mode !== "live" || found.view.revision !== expectedRevision || task.lane !== "event_tickets"
    || found.input.requirements.event_tickets.event_url !== FREE_REGISTRATION_EVENT_URL
    || found.input.requirements.event_tickets.quantity !== 1 || found.input.requirements.event_tickets.attendee_ref !== "manager") {
    throw new AppError(409, "registration_not_eligible", "This action requires the current paid live one-person OpenTogether mission and manager profile.");
  }
  assertPreparationUnlocked(found, task);
  const preferences = await getPreferences(principal);
  if (!preferences.preferences) throw new AppError(409, "registration_profile_required", "Save the manager attendee profile before preparing registration.");
  const attendee = { name: preferences.preferences.name, email: preferences.preferences.email };
  const savedProfileHash = profileHash(preferences.preferences, preferences.updated_at);
  const existing = found.prepared_registrations?.[taskId];
  if (existing && task.proposal && existing.revision === expectedRevision && existing.profile_hash === savedProfileHash && Date.parse(task.proposal.expires_at) > Date.now()) {
    assertPreparedFreeRegistration(found, task);
    return found;
  }
  if (["queued", "researching"].includes(task.status) || (found.research_claims[taskId] && Date.parse(found.research_claims[taskId].expires_at) > Date.now())) {
    throw new AppError(409, "task_busy", "Wait for event research to finish before preparing registration.");
  }
  const owner = `${found.id}:${expectedRevision}:free-registration:${randomUUID()}`;
  if (!await acquireLane(principal.workspace_id, "event_tickets", owner)) throw new AppError(409, "registration_browser_busy", "The event browser is already in use.");
  try {
    const attemptKey = `${found.id}:${expectedRevision}:${taskId}:prepare:${randomUUID()}`;
    const result = await prepareFreeRegistration({ task_id: taskId, source_url: FREE_REGISTRATION_EVENT_URL, attempt_key: attemptKey, expected_event_date: found.input.requirements.event_tickets.date });
    if (!result.snapshot) {
      return await mutateRecord(found.id, principal.workspace_id, record => {
        if (record.view.revision !== expectedRevision) throw new AppError(409, "revision_conflict", "The mission changed while registration was inspected.");
        const current = record.view.tasks.find(item => item.id === taskId)!;
        assertPreparationUnlocked(record, current);
        current.evidence.push(...result.evidence);
        current.proposal = undefined;
        if (current.approval) current.approval.state = "stale";
        record.reservations.filter(item => item.task_id === taskId && item.state === "reserved").forEach(item => { item.state = "released"; });
        delete record.approved_action_hashes?.[taskId];
        current.status = "needs_human";
        current.progress = "Free registration preparation needs attention";
        current.blocker = result.blocker || "The exact free ticket could not be prepared. Start a new preparation after reviewing the event.";
        delete record.prepared_registrations?.[taskId];
        activity(record, `event_tickets: read-only registration preparation stopped; cleanup ${result.cleanup}. No RSVP was submitted.`, "warning", "event_tickets");
        refresh(record);
      });
    }
    assertSnapshot(result.snapshot, found.input.requirements.event_tickets.date);
    const proposalId = randomUUID();
    return await mutateRecord(found.id, principal.workspace_id, record => {
      if (record.view.revision !== expectedRevision) throw new AppError(409, "revision_conflict", "The mission changed while registration was inspected.");
      const current = record.view.tasks.find(item => item.id === taskId)!;
      assertPreparationUnlocked(record, current);
      record.reservations.filter(item => item.task_id === taskId && item.state === "reserved").forEach(item => { item.state = "released"; });
      if (current.approval) current.approval.state = "stale";
      if (record.approved_action_hashes) delete record.approved_action_hashes[taskId];
      if (record.attempts[taskId]?.state === "finished") delete record.attempts[taskId];
      const hash = actionHash(record, current, proposalId, result.snapshot!, attendee, savedProfileHash);
      const proposal: Proposal = {
        id: proposalId, task_id: taskId, revision: expectedRevision, option_id: `luma:${result.snapshot!.ticket_type_api_id}`,
        merchant: "Luma", title: `${result.snapshot!.event_title} — ${result.snapshot!.ticket_name}`,
        source_url: FREE_REGISTRATION_EVENT_URL, quantity: 1, recipient_ref: "manager",
        deadline: result.snapshot!.event_start_at, subtotal_minor: 0, tax_minor: 0, shipping_minor: 0, fees_minor: 0,
        total_minor: 0, currency: "USD", expires_at: new Date(Date.now() + PREPARE_WINDOW_MS).toISOString(),
        action_type: "free_registration", action_hash: hash,
      };
      record.prepared_registrations ||= {};
      record.prepared_registrations[taskId] = { revision: expectedRevision, proposal_id: proposalId, snapshot: result.snapshot!, attendee, profile_hash: savedProfileHash, action_hash: hash, prepared_at: new Date().toISOString() };
      current.proposal = proposal;
      current.approval = { id: randomUUID(), proposal_id: proposalId, revision: expectedRevision, state: "pending" };
      current.evidence.push(...boundEvidence(result.evidence, proposal, "checkout_preview"));
      current.status = "awaiting_approval"; current.progress = "Exact free registration ready for manager review"; current.blocker = undefined;
      activity(record, "event_tickets: exact free OpenTogether ticket and saved manager profile prepared for review. No RSVP was submitted.", "approval", "event_tickets");
      refresh(record);
    });
  } finally { await releaseLane(principal.workspace_id, "event_tickets", owner); }
}

export async function freeRegistrationReview(taskId: string, principal: Principal) {
  if (principal.role !== "manager") throw new AppError(403, "manager_required", "Only the manager can review the pinned attendee registration.");
  const record = await findTask(taskId, principal.workspace_id);
  const task = record.view.tasks.find(item => item.id === taskId)!;
  const prepared = assertPreparedFreeRegistration(record, task);
  const preferences = await getPreferences(principal);
  const unchanged = !!preferences.preferences && profileHash(preferences.preferences, preferences.updated_at) === prepared.profile_hash;
  return {
    proposal_id: task.proposal!.id,
    revision: task.proposal!.revision,
    attendee: { ...prepared.attendee },
    event_title: prepared.snapshot.event_title,
    event_start_at: prepared.snapshot.event_start_at,
    ticket_name: prepared.snapshot.ticket_name,
    source_url: FREE_REGISTRATION_EVENT_URL,
    total_minor: 0 as const,
    expires_at: task.proposal!.expires_at,
    profile_unchanged: unchanged,
  };
}

export async function resumeFreeRegistrationTask(taskId: string, principal: Principal, exact: { proposal_id: string; revision: number }) {
  const found = await findTask(taskId, principal.workspace_id);
  const current = found.view.tasks.find(item => item.id === taskId)!;
  if (current.status === "confirmed" || current.status === "executing" || found.reservations.some(item => item.task_id === taskId && item.state === "uncertain")) {
    if (current.proposal?.id !== exact.proposal_id || current.proposal.revision !== exact.revision) throw new AppError(409, "stale_proposal", "This request does not match the protected registration commitment.");
    return found;
  }
  const prepared = assertPreparedFreeRegistration(found, current);
  const preferences = await getPreferences(principal);
  if (!preferences.preferences || profileHash(preferences.preferences, preferences.updated_at) !== prepared.profile_hash) throw new AppError(409, "registration_profile_changed", "The saved attendee profile changed. Prepare and approve the registration again.");
  const attemptKey = `${found.id}:${exact.revision}:${taskId}:register:${randomUUID()}`;
  if (!await acquireLane(principal.workspace_id, "event_tickets", attemptKey)) throw new AppError(409, "registration_browser_busy", "The event browser is already in use. The approved registration has not been submitted.");
  try {
    let claimed = false;
    const claimedRecord = await mutateRecord(found.id, principal.workspace_id, record => {
      claimed = false;
      const task = record.view.tasks.find(item => item.id === taskId)!;
      const saved = assertPreparedFreeRegistration(record, task);
      if (task.approval?.state !== "approved" || task.approval.proposal_id !== exact.proposal_id || task.approval.revision !== exact.revision) throw new AppError(409, "approval_required", "Approve the exact prepared registration first.");
      if (record.approved_action_hashes?.[taskId] !== createHash("sha256").update(JSON.stringify({ workspace_id: record.workspace_id, task_id: task.id, proposal: Object.fromEntries(Object.entries(task.proposal!).sort(([a], [b]) => a.localeCompare(b))) })).digest("hex")) throw new AppError(409, "approved_action_changed", "The approved registration changed after review.");
      const held = record.reservations.filter(item => item.task_id === taskId && item.proposal_id === exact.proposal_id && item.amount_minor === 0 && item.state === "reserved");
      if (held.length !== 1) throw new AppError(409, "reservation_required", "The exact approved free action is not held.");
      if (record.attempts[taskId]) return;
      record.attempts[taskId] = { state: "claimed", started_at: new Date().toISOString() };
      task.status = "executing"; task.progress = "Submitting the one approved free registration"; task.blocker = undefined;
      activity(record, "event_tickets: exact approved free registration claimed once for submission.", "info", "event_tickets");
      refresh(record); claimed = true;
      void saved;
    });
    if (!claimed) return claimedRecord;
    const held = claimedRecord.reservations.find(item => item.task_id === taskId && item.proposal_id === exact.proposal_id && item.amount_minor === 0 && item.state === "reserved")!;
    let result;
    try {
      result = await executeFreeRegistration({
        task_id: taskId, source_url: FREE_REGISTRATION_EVENT_URL, expected_event_date: claimedRecord.input.requirements.event_tickets.date,
        attempt_key: attemptKey, snapshot: prepared.snapshot, attendee: prepared.attendee,
        authorization: { approved: true, proposal_id: exact.proposal_id, revision: exact.revision, reservation_id: held.id, attempt_key: attemptKey, action_hash: prepared.action_hash, expires_at: current.proposal!.expires_at },
      });
    } catch {
      result = { status: "needs_human" as const, evidence: [], blocker: "The provider response was lost or malformed. Do not submit this registration again.", uncertain: true, cleanup: "unconfirmed" as const };
    }
    return await mutateRecord(found.id, principal.workspace_id, record => {
      const task = record.view.tasks.find(item => item.id === taskId)!;
      if (record.attempts[taskId]?.state !== "claimed" || task.proposal?.id !== exact.proposal_id) return;
      const reservation = record.reservations.find(item => item.id === held.id)!;
      task.evidence.push(...boundEvidence(result.evidence, task.proposal!, result.status === "confirmed" ? "merchant_confirmation" : "observation"));
      if (result.status === "confirmed" && !result.uncertain && typeof result.confirmation_ref === "string" && result.confirmation_ref) {
        const proof = result.evidence.some(item => item.kind === "merchant_confirmation" && item.confirmation_ref === result.confirmation_ref && item.source_url === FREE_REGISTRATION_EVENT_URL
          && item.task_id === taskId && item.mode === "live"
          && (item.proposal_id === undefined || item.proposal_id === exact.proposal_id)
          && (item.revision === undefined || item.revision === exact.revision));
        if (!proof) throw new AppError(502, "registration_confirmation_invalid", "The provider response lacked matching registration confirmation evidence.");
        reservation.state = "committed"; record.attempts[taskId].state = "finished"; task.status = "confirmed"; task.confirmation_ref = result.confirmation_ref;
        task.completed_at = new Date().toISOString(); task.progress = "Free registration confirmed by Luma"; task.blocker = undefined;
        activity(record, "event_tickets: Luma confirmed the exact approved free registration.", "success", "event_tickets");
      } else if (result.uncertain) {
        reservation.state = "uncertain"; record.attempts[taskId].state = "uncertain"; task.status = "needs_human";
        task.progress = "Registration outcome requires reconciliation"; task.blocker = result.blocker || "The provider response was uncertain. Do not submit again.";
        activity(record, "event_tickets: registration outcome is uncertain; replay is blocked.", "warning", "event_tickets");
      } else {
        reservation.state = "released"; record.attempts[taskId].state = "finished"; task.status = "needs_human";
        task.progress = "Prepare a new registration review"; task.blocker = result.blocker || "The registration was not submitted. Prepare and approve a new action before retrying.";
        if (task.approval) task.approval.state = "stale";
        delete record.prepared_registrations?.[taskId]; delete record.approved_action_hashes?.[taskId];
        activity(record, "event_tickets: clean failure released the zero-dollar hold; a fresh review is required.", "warning", "event_tickets");
      }
      refresh(record);
    });
  } finally { await releaseLane(principal.workspace_id, "event_tickets", attemptKey); }
}
