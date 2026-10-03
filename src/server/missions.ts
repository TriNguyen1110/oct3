import { createHash, randomUUID } from "node:crypto";
import type { Lane, MissionInput, MissionView, Proposal, Task } from "../shared/contracts";
import type { Principal } from "./auth";
import { AppError } from "./errors";
import { fixtureResearch } from "./fixtures";
import type { MissionRecord } from "./model";
import { createRecord, findTask, getRecord, mutateRecord } from "./store";

const lanes: Lane[] = ["amazon", "fiverr", "event_tickets"];
const titles: Record<Lane, string> = { amazon: "Source booth supplies", fiverr: "Find a flyer designer", event_tickets: "Secure team event passes" };
export function activity(record: MissionRecord, text: string, kind: "info" | "decision" | "approval" | "warning" | "success" = "info", lane?: Lane) {
  record.view.activity.push({ id: randomUUID(), at: new Date().toISOString(), kind, text, ...(lane ? { lane } : {}) });
  record.view.activity = record.view.activity.slice(-100);
}

export function refresh(record: MissionRecord) {
  const view = record.view;
  const total = (state: string) => record.reservations.filter(x => x.state === state).reduce((sum, x) => sum + x.amount_minor, 0);
  const reserved = total("reserved"), committed = total("committed"), uncertain = total("uncertain");
  if (reserved + committed + uncertain > record.input.purchase_budget_minor) throw new AppError(409, "budget_exceeded", "The budget cannot cover this commitment.");
  view.budget = {
    limit_minor: record.input.purchase_budget_minor,
    proposed_minor: view.tasks.filter(x => x.proposal && !["confirmed", "executing"].includes(x.status)).reduce((sum, x) => sum + x.proposal!.total_minor, 0),
    reserved_minor: reserved, committed_minor: committed, uncertain_minor: uncertain,
    available_minor: record.input.purchase_budget_minor - reserved - committed - uncertain,
  };
  view.evidence = view.tasks.flatMap(x => x.evidence);
  view.blockers = view.tasks.flatMap(x => x.blocker ? [`${x.lane}: ${x.blocker}`] : []);
  const researching = view.tasks.some(x => x.status === "queued" || x.status === "researching");
  view.status = view.tasks.every(x => x.status === "confirmed") ? "completed" : researching ? "running" : view.blockers.length ? "needs_attention" : view.tasks.some(x => x.proposal && x.approval?.state !== "approved") ? "awaiting_approval" : "needs_attention";
  view.next_actions = researching ? ["Workers are comparing available options."] : view.tasks.filter(x => x.status !== "confirmed").map(x => x.blocker || (x.proposal ? `Review ${x.lane} proposal.` : `Choose an option for ${x.lane} and verify its full checkout total.`));
  if (view.mode === "fixture") view.next_actions.unshift("This is a fixture scenario. No merchant will be contacted or charged.");
}

function proposal(record: MissionRecord, task: Task, optionId: string): Proposal {
  const option = task.options.find(x => x.id === optionId)!;
  return {
    id: randomUUID(), task_id: task.id, revision: record.view.revision, option_id: option.id,
    merchant: option.merchant, title: option.title, source_url: option.source_url, quantity: option.quantity,
    recipient_ref: task.lane === "amazon" ? record.input.requirements.amazon.delivery_ref : task.lane === "event_tickets" ? record.input.requirements.event_tickets.attendee_ref : "manager-brief",
    deadline: record.input.deadline, subtotal_minor: option.amount_minor, tax_minor: 0, shipping_minor: 0, fees_minor: 0,
    total_minor: option.amount_minor, currency: "USD", expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}

function planFixture(record: MissionRecord) {
  const eligible = record.view.tasks.filter(x => !["confirmed", "executing"].includes(x.status) && !record.reservations.some(r => r.task_id === x.id && r.state === "uncertain"));
  const protectedSpend = record.reservations.filter(x => ["committed", "uncertain", "reserved"].includes(x.state)).reduce((n, x) => n + x.amount_minor, 0);
  const choices = eligible.map(task => ({ task, option: task.options[0] }));
  let cost = choices.reduce((n, x) => n + (x.option?.amount_minor || 0), 0);
  for (const choice of choices.filter(x => x.task.lane !== "event_tickets").sort((a, b) => b.option.amount_minor - a.option.amount_minor)) {
    if (cost <= record.input.purchase_budget_minor - protectedSpend) break;
    const cheapest = [...choice.task.options].sort((a, b) => a.amount_minor - b.amount_minor)[0];
    cost += cheapest.amount_minor - choice.option.amount_minor; choice.option = cheapest;
  }
  const fits = cost + protectedSpend <= record.input.purchase_budget_minor;
  for (const { task, option } of choices) {
    task.proposal = proposal(record, task, option.id);
    task.approval = { id: randomUUID(), proposal_id: task.proposal.id, revision: record.view.revision, state: "pending" };
    task.status = fits ? "awaiting_approval" : "needs_human";
    task.progress = fits ? "Illustrative plan ready for review" : "No illustrative plan fits the current constraints";
    task.blocker = fits ? undefined : `The lowest illustrative plan is $${((cost + protectedSpend) / 100).toFixed(2)}, above the mission budget.`;
    task.options.forEach(x => { x.recommended = x.id === option.id; });
  }
  activity(record, fits ? `Revision ${record.view.revision}: proposed $${(cost / 100).toFixed(2)} while preserving ${record.input.headcount} event passes.` : "No plan fits. No commitments were made.", fits ? "decision" : "warning");
}

export async function createMission(input: MissionInput, principal: Principal, key: string, mode: "fixture" | "live") {
  if (!/^[A-Za-z0-9_.:-]{8,160}$/.test(key)) throw new AppError(400, "idempotency_key_required", "Send an Idempotency-Key of 8–160 letters, numbers, dots, colons or dashes.");
  const id = randomUUID(), now = new Date().toISOString();
  const record: MissionRecord = {
    id, workspace_id: principal.workspace_id, idempotency_key: key,
    request_hash: createHash("sha256").update(JSON.stringify({ input, mode })).digest("hex"), version: 1, input,
    reservations: [], attempts: {}, research_claims: {},
    view: {
      mission_id: id, revision: 1, status: "queued", objective: input.objective, deadline: input.deadline,
      headcount: input.headcount, created_at: now, updated_at: now, mode,
      budget: { limit_minor: input.purchase_budget_minor, proposed_minor: 0, reserved_minor: 0, committed_minor: 0, uncertain_minor: 0, available_minor: input.purchase_budget_minor },
      service_payment: { status: mode === "fixture" ? "waived_fixture" : "not_configured", amount_minor: 50, currency: "USD", mode: mode === "fixture" ? "fixture" : "test" },
      tasks: lanes.map(lane => ({ id: `${id}:${lane}`, lane, title: titles[lane], status: "queued", progress: "Waiting to start", options: [], evidence: [] })), evidence: [], blockers: [], next_actions: [], activity: [],
    },
  };
  activity(record, mode === "fixture" ? "Fixture mission accepted. Service fee waived; all prices are illustrative." : "Mission accepted. Browser research is read-only; Stripe service payment is not configured.");
  refresh(record);
  return createRecord(record);
}

export async function runFixture(id: string, workspace: string) {
  return mutateRecord(id, workspace, record => {
    if (record.view.mode !== "fixture") throw new AppError(409, "not_fixture", "This is a live mission.");
    if (record.view.tasks.every(x => x.options.length)) return;
    for (const task of record.view.tasks) {
      const result = fixtureResearch(task.id, task.lane, record.input);
      task.options = result.options; task.evidence = result.evidence; task.started_at = new Date().toISOString();
      activity(record, `${task.lane}: illustrative options loaded; no browser action occurred.`, "info", task.lane);
    }
    planFixture(record); refresh(record);
  });
}

export async function reviseMission(id: string, principal: Principal, changes: { expected_revision: number; purchase_budget_minor: number; headcount?: number; deadline?: string }) {
  return mutateRecord(id, principal.workspace_id, record => {
    if (record.view.revision !== changes.expected_revision) throw new AppError(409, "revision_conflict", "This mission has changed. Review the latest revision.");
    if (record.view.tasks.some(x => x.status === "executing")) throw new AppError(409, "execution_in_flight", "An approved action is in flight. Reconcile it before changing constraints.");
    const protectedSpend = record.reservations.filter(x => ["committed", "uncertain"].includes(x.state)).reduce((n, x) => n + x.amount_minor, 0);
    if (changes.purchase_budget_minor < protectedSpend) throw new AppError(409, "allocated_budget", "The new budget is below committed or uncertain spending.");
    if (changes.headcount && changes.headcount !== record.input.headcount && record.view.tasks.some(x => x.status === "confirmed")) throw new AppError(409, "committed_headcount", "Headcount changes need manual reconciliation after a commitment.");
    record.input.purchase_budget_minor = changes.purchase_budget_minor;
    if (changes.headcount) { record.input.headcount = changes.headcount; record.input.requirements.event_tickets.quantity = changes.headcount; record.view.headcount = changes.headcount; }
    if (changes.deadline) { record.input.deadline = changes.deadline; record.view.deadline = changes.deadline; }
    record.view.revision++;
    for (const reservation of record.reservations) if (reservation.state === "reserved") reservation.state = "released";
    for (const task of record.view.tasks) {
      if (task.status === "confirmed" || record.reservations.some(x => x.task_id === task.id && x.state === "uncertain")) continue;
      if (task.approval) task.approval.state = "stale";
      task.proposal = undefined;
      if (record.view.mode === "fixture") {
        const result = fixtureResearch(task.id, task.lane, record.input); task.options = result.options; task.evidence = result.evidence;
      } else { task.status = "queued"; task.progress = "Constraints changed; researching the new revision"; task.blocker = undefined; }
    }
    activity(record, `Manager revised purchase budget to $${(changes.purchase_budget_minor / 100).toFixed(2)}. All unexecuted approvals invalidated.`, "decision");
    if (record.view.mode === "fixture") planFixture(record);
    refresh(record);
  });
}

function validateProposal(record: MissionRecord, taskId: string, exact: { proposal_id: string; revision: number }) {
  const task = record.view.tasks.find(x => x.id === taskId)!;
  if (!task.proposal || task.proposal.id !== exact.proposal_id || task.proposal.revision !== exact.revision || record.view.revision !== exact.revision) throw new AppError(409, "stale_proposal", "This proposal is stale. Review the current exact action.");
  if (Date.parse(task.proposal.expires_at) <= Date.now()) throw new AppError(409, "proposal_expired", "The proposal expired. Recheck its price and availability.");
  return task;
}

export async function decideTask(taskId: string, principal: Principal, exact: { proposal_id: string; revision: number }, decision: "approve" | "reject") {
  if (principal.role !== "manager") throw new AppError(403, "manager_required", "A manager must approve this action.");
  const found = await findTask(taskId, principal.workspace_id);
  return mutateRecord(found.id, principal.workspace_id, record => {
    const task = validateProposal(record, taskId, exact);
    if (task.status === "executing" || task.status === "confirmed" || record.reservations.some(x => x.task_id === taskId && x.state === "uncertain")) throw new AppError(409, "execution_locked", "Reconcile this commitment before changing its approval.");
    if (decision === "reject") {
      if (task.approval) task.approval.state = "rejected";
      record.reservations.filter(x => x.task_id === taskId && x.state === "reserved").forEach(x => { x.state = "released"; });
      task.status = "needs_human"; task.blocker = "Manager rejected this proposal. Revise constraints to prepare a new plan.";
    } else {
      if (task.approval?.state === "approved") return;
      if (task.blocker && task.blocker.startsWith("The lowest illustrative")) throw new AppError(409, "plan_infeasible", task.blocker);
      const cost = task.proposal!.total_minor;
      refresh(record);
      if (cost > record.view.budget.available_minor) throw new AppError(409, "budget_exceeded", "The remaining budget cannot cover this action.");
      record.reservations.push({ id: randomUUID(), task_id: taskId, proposal_id: exact.proposal_id, amount_minor: cost, state: "reserved" });
      task.approval = { id: task.approval?.id || randomUUID(), proposal_id: exact.proposal_id, revision: exact.revision, state: "approved", approved_at: new Date().toISOString(), link_state: record.view.mode === "fixture" ? "not_applicable_fixture" : "not_configured" };
      task.status = "prepared";
      task.progress = "Plan approved; merchant commitment has not occurred";
      task.blocker = record.view.mode === "fixture" ? "Fixture approval recorded. No merchant payment or order will be sent." : "Link Agent Wallet is not connected. Merchant spending requires separate verified Link approval.";
    }
    activity(record, `${task.lane}: manager ${decision === "approve" ? "approved the exact plan and reserved its budget" : "rejected the proposal"}.`, "approval", task.lane);
    refresh(record);
  });
}

export async function resumeTask(taskId: string, principal: Principal, exact: { proposal_id: string; revision: number }) {
  const found = await findTask(taskId, principal.workspace_id);
  return mutateRecord(found.id, principal.workspace_id, record => {
    const existing = record.view.tasks.find(x => x.id === taskId)!;
    const protectedCommitment = existing.status === "confirmed" || existing.status === "executing" || record.reservations.some(x => x.task_id === taskId && ["committed", "uncertain"].includes(x.state));
    if (protectedCommitment) {
      if (existing.proposal?.id !== exact.proposal_id || existing.proposal?.revision !== exact.revision) throw new AppError(409, "stale_proposal", "This request does not match the existing commitment.");
      // A replay observes the previous outcome. Expiry or a later mission
      // revision cannot undo a confirmed, in-flight or uncertain commitment.
      return;
    }
    const task = validateProposal(record, taskId, exact);
    if (task.approval?.state !== "approved") throw new AppError(409, "approval_required", "A manager must approve the current exact proposal first.");
    // Never trust a caller-supplied Link status. No live executor is reached until
    // a provider-verified spend request and tested merchant path are connected.
    task.status = "needs_human";
    task.blocker = record.view.mode === "fixture" ? "Fixture rehearsal ends at the handoff. No order, freelancer hire or ticket booking was made." : "Link Agent Wallet and exact merchant checkout verification must be connected before execution.";
    task.progress = "Waiting for manager handoff";
    activity(record, `${task.lane}: execution safely stopped before any merchant commitment.`, "warning", task.lane);
    refresh(record);
  });
}

export async function missionView(id: string, principal: Principal): Promise<MissionView> { return (await getRecord(id, principal.workspace_id)).view; }
