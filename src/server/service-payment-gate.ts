import { AppError } from "./errors";
import { activity, refresh } from "./missions";
import type { MissionRecord } from "./model";
import {
  hasMissionPaymentCredential,
  MISSION_SERVICE_FEE_CURRENCY,
  MISSION_SERVICE_FEE_MINOR,
  requireMissionServicePayment,
  servicePaymentBinding,
  servicePaymentReadiness,
  withStoredServicePaymentReceipt,
  type ServicePaymentBinding,
  type VerifiedServicePaymentProof,
} from "./service-payments";
import { getRecord, mutateRecord } from "./store";

const AUTOMATIC_PAYMENT_RETRY_LIMIT_MS = 22 * 60 * 60 * 1000;

export type MissionPaymentGateResult =
  | {
      kind: "ready";
      record: MissionRecord;
      withReceipt(response: Response): Response;
    }
  | { kind: "challenge"; response: Response }
  | {
      kind: "blocked";
      record: MissionRecord;
      status: 409 | 503;
      code: "payment_reconciliation_required" | "payment_setup_required";
      message: string;
    };

function handleHeaders(record: MissionRecord, origin: string) {
  const resultUrl = new URL(`/api/missions/${encodeURIComponent(record.id)}`, origin).toString();
  const dashboardUrl = new URL(`/?mission=${encodeURIComponent(record.id)}`, origin).toString();
  return {
    "x-cue-mission-id": record.id,
    "x-cue-result-url": resultUrl,
    "x-cue-dashboard-url": dashboardUrl,
  };
}

function withHandle(response: Response, record: MissionRecord, origin: string): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(handleHeaders(record, origin))) headers.set(name, value);
  headers.set("cache-control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function expectedBinding(record: MissionRecord): ServicePaymentBinding {
  return servicePaymentBinding({
    workspaceId: record.workspace_id,
    idempotencyKey: record.idempotency_key,
    requestHash: record.request_hash,
  });
}

function proofMatches(
  proof: VerifiedServicePaymentProof | undefined,
  binding: ServicePaymentBinding,
): proof is VerifiedServicePaymentProof {
  return !!proof
    && typeof proof.reference === "string"
    && proof.reference.startsWith("pi_")
    && proof.external_id === binding.externalId
    && proof.amount_minor === MISSION_SERVICE_FEE_MINOR
    && proof.currency === MISSION_SERVICE_FEE_CURRENCY
    && proof.mode === "test"
    && typeof proof.verified_at === "string"
    && Number.isFinite(Date.parse(proof.verified_at));
}

export function assertMissionServicePaymentVerified(record: MissionRecord): void {
  if (record.view.mode === "fixture") {
    if (record.view.service_payment.status !== "waived_fixture") {
      throw new AppError(409, "fixture_payment_state_invalid", "Fixture service-payment state is invalid.");
    }
    return;
  }
  let binding: ServicePaymentBinding;
  try { binding = expectedBinding(record); }
  catch { throw new AppError(503, "payment_setup_required", "The service-payment verifier is not configured."); }
  if (record.service_payment?.external_id !== binding.externalId
    || record.service_payment.scope !== binding.scope
    || !proofMatches(record.service_payment.proof, binding)
    || record.view.service_payment.status !== "paid"
    || record.view.service_payment.reference !== record.service_payment.proof.reference) {
    throw new AppError(409, "service_payment_required", "A verified $0.50 test service payment is required before browser research can start.");
  }
}

function paymentAgeExpired(record: MissionRecord, now: number) {
  const started = record.service_payment?.first_credential_attempt_at;
  if (!started) return false;
  const parsed = Date.parse(started);
  if (!Number.isFinite(parsed) || parsed > now) return true;
  return now - parsed >= AUTOMATIC_PAYMENT_RETRY_LIMIT_MS;
}

async function markBlocked(
  id: string,
  workspace: string,
  kind: "setup" | "reconcile",
  message: string,
) {
  return mutateRecord(id, workspace, record => {
    if (record.service_payment?.proof) return;
    record.view.service_payment.status = kind === "setup" ? "not_configured" : "pending";
    record.view.status = "needs_attention";
    record.view.next_actions = [message];
    if (!record.view.blockers.includes(`service_payment: ${message}`)) {
      record.view.blockers.push(`service_payment: ${message}`);
    }
  });
}

export async function gateMissionServicePayment(
  request: Request,
  id: string,
  workspace: string,
  origin: string,
): Promise<MissionPaymentGateResult> {
  let record = await getRecord(id, workspace);
  if (record.view.mode === "fixture") {
    assertMissionServicePaymentVerified(record);
    return { kind: "ready", record, withReceipt: response => response };
  }

  const readiness = servicePaymentReadiness();
  if (!readiness.ready) {
    const message = `${readiness.detail} Mission ${record.id} is saved and has not started research.`;
    record = await markBlocked(id, workspace, "setup", message);
    return { kind: "blocked", record, status: 503, code: "payment_setup_required", message };
  }

  const binding = expectedBinding(record);
  record = await mutateRecord(id, workspace, current => {
    current.service_payment ||= {};
    if (current.service_payment.external_id && current.service_payment.external_id !== binding.externalId) {
      throw new AppError(409, "payment_binding_conflict", "The saved mission has a different service-payment binding.");
    }
    if (current.service_payment.scope && current.service_payment.scope !== binding.scope) {
      throw new AppError(409, "payment_binding_conflict", "The saved mission has a different service-payment scope.");
    }
    current.service_payment.external_id = binding.externalId;
    current.service_payment.scope = binding.scope;
    if (proofMatches(current.service_payment.proof, binding)) {
      delete current.service_payment.test_payment_credential;
    }
  });

  if (proofMatches(record.service_payment?.proof, binding)) {
    assertMissionServicePaymentVerified(record);
    return {
      kind: "ready",
      record,
      withReceipt: response => withStoredServicePaymentReceipt(response, record.service_payment!.proof!),
    };
  }

  const now = Date.now();
  if (paymentAgeExpired(record, now)) {
    const message = "The prior Stripe payment attempt is older than 22 hours. Reconcile its PaymentIntent before any automatic retry.";
    record = await markBlocked(id, workspace, "reconcile", message);
    return { kind: "blocked", record, status: 409, code: "payment_reconciliation_required", message };
  }

  const hasCredential = hasMissionPaymentCredential(request);
  record = await mutateRecord(id, workspace, current => {
    if (current.service_payment?.proof) return;
    current.service_payment ||= { external_id: binding.externalId, scope: binding.scope };
    if (paymentAgeExpired(current, now)) {
      throw new AppError(409, "payment_reconciliation_required", "Reconcile the prior Stripe payment attempt before retrying.");
    }
    if (hasCredential && !current.service_payment.first_credential_attempt_at) {
      current.service_payment.first_credential_attempt_at = new Date(now).toISOString();
      activity(current, "Stripe service-payment verification started. Browser research remains blocked until its receipt is saved.", "info");
    }
    current.view.service_payment.status = hasCredential ? "pending" : "payment_required";
    refresh(current);
  });

  if (record.service_payment?.proof) {
    assertMissionServicePaymentVerified(record);
    return {
      kind: "ready",
      record,
      withReceipt: response => withStoredServicePaymentReceipt(response, record.service_payment!.proof!),
    };
  }

  const payment = await requireMissionServicePayment(request, binding);
  if (payment.kind === "challenge") {
    const latest = await getRecord(id, workspace);
    if (proofMatches(latest.service_payment?.proof, binding)) {
      assertMissionServicePaymentVerified(latest);
      return {
        kind: "ready",
        record: latest,
        withReceipt: response => withStoredServicePaymentReceipt(response, latest.service_payment!.proof!),
      };
    }
    return { kind: "challenge", response: withHandle(payment.response, latest, origin) };
  }

  if (!proofMatches(payment.proof, binding)) {
    throw new AppError(502, "payment_proof_invalid", "Stripe returned a service-payment proof that did not match this mission.");
  }
  record = await mutateRecord(id, workspace, current => {
    current.service_payment ||= { external_id: binding.externalId, scope: binding.scope };
    const existing = current.service_payment.proof;
    if (existing && !proofMatches(existing, binding)) {
      throw new AppError(409, "payment_proof_conflict", "The saved service-payment proof conflicts with this mission.");
    }
    if (existing && existing.reference !== payment.proof.reference) {
      throw new AppError(409, "payment_proof_conflict", "This mission already has a different Stripe payment reference.");
    }
    current.service_payment.proof = payment.proof;
    // Once the verified proof is durable, the private sandbox credential is no
    // longer needed for replay and should not remain in mission state.
    delete current.service_payment.test_payment_credential;
    current.view.service_payment = {
      status: "paid",
      amount_minor: MISSION_SERVICE_FEE_MINOR,
      currency: MISSION_SERVICE_FEE_CURRENCY,
      mode: "test",
      reference: payment.proof.reference,
    };
    activity(current, "Verified Stripe test service fee saved. Merchant spending and confirmation remain separate.", "success");
    refresh(current);
  });
  assertMissionServicePaymentVerified(record);
  return { kind: "ready", record, withReceipt: payment.withReceipt };
}
