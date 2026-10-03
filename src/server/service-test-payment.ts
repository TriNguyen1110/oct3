import { Challenge, Credential } from "mppx";
import { Mppx, stripe } from "mppx/client";
import { AppError } from "./errors";
import {
  gateMissionServicePayment,
  type MissionPaymentGateResult,
} from "./service-payment-gate";
import { servicePaymentReadiness } from "./service-payments";
import { getRecord, mutateRecord } from "./store";
import type { MissionRecord, MissionServicePaymentState } from "./model";

const TEST_PAYMENT_METHOD = "pm_card_visa";
const STRIPE_PREVIEW_VERSION = "2026-07-29.preview";
const STRIPE_TEST_SPT_URL = "https://api.stripe.com/v1/test_helpers/shared_payment/granted_tokens";
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;
const MINIMUM_CREDENTIAL_LIFETIME_MS = 5_000;

type StoredTestPaymentCredential = NonNullable<MissionServicePaymentState["test_payment_credential"]>;
type SandboxConfiguration = { secretKey: string; profileId: string; mppSecretKey: string };

type CompletedMissionPaymentGateResult = Exclude<MissionPaymentGateResult, { kind: "challenge" }>;

export type MissionTestPaymentResult = CompletedMissionPaymentGateResult | {
  kind: "failed";
  record: MissionRecord;
  status: number;
  code: string;
  message: string;
};

function sandboxConfiguration() {
  if (process.env.OCT3_TEST_PAYMENT_ENABLED !== "true") {
    throw new AppError(403, "test_payment_disabled", "The developer-supplied sandbox payment is not enabled.");
  }
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const profileId = process.env.STRIPE_PROFILE_ID?.trim();
  const mppSecretKey = process.env.MPP_SECRET_KEY?.trim();
  const readiness = servicePaymentReadiness();
  if (!readiness.ready || readiness.mode !== "test" || !secretKey?.startsWith("sk_test_") || !profileId?.startsWith("profile_test_") || !mppSecretKey) {
    throw new AppError(503, "test_payment_setup_required", "The Stripe sandbox payer is not configured.");
  }
  return { secretKey, profileId, mppSecretKey };
}

function tokenBody(parameters: {
  amount: string;
  currency: string;
  expiresAt: number;
  metadata?: Record<string, string>;
  networkId?: string;
}, includeOptional: boolean) {
  const body = new URLSearchParams({
    payment_method: TEST_PAYMENT_METHOD,
    "usage_limits[currency]": parameters.currency,
    "usage_limits[max_amount]": parameters.amount,
    "usage_limits[expires_at]": String(parameters.expiresAt),
  });
  if (includeOptional && parameters.networkId) body.set("seller_details[network_id]", parameters.networkId);
  if (includeOptional && parameters.metadata) {
    for (const [key, value] of Object.entries(parameters.metadata)) body.set(`metadata[${key}]`, value);
  }
  return body;
}

async function requestSandboxToken(
  secretKey: string,
  parameters: {
    amount: string;
    currency: string;
    expiresAt: number;
    metadata?: Record<string, string>;
    networkId?: string;
  },
) {
  const send = (includeOptional: boolean) => fetch(STRIPE_TEST_SPT_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      "stripe-version": STRIPE_PREVIEW_VERSION,
    },
    body: tokenBody(parameters, includeOptional),
    signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
  });

  let response = await send(true);
  if (!response.ok && (parameters.networkId || parameters.metadata)) {
    const problem = await response.clone().json().catch(() => null) as { error?: { message?: unknown } } | null;
    if (typeof problem?.error?.message === "string" && problem.error.message.includes("Received unknown parameter")) {
      response = await send(false);
    }
  }
  if (!response.ok) throw new AppError(502, "test_payment_token_failed", "Stripe could not issue the sandbox payment credential.");
  const payload = await response.json().catch(() => null) as { id?: unknown } | null;
  if (typeof payload?.id !== "string" || payload.id.length < 4) {
    throw new AppError(502, "test_payment_token_invalid", "Stripe returned an invalid sandbox payment credential.");
  }
  return payload.id;
}

async function failure(id: string, workspace: string, error: unknown): Promise<MissionTestPaymentResult> {
  const record = await getRecord(id, workspace);
  if (error instanceof AppError) {
    return { kind: "failed", record, status: error.status, code: error.code, message: error.message };
  }
  return {
    kind: "failed",
    record,
    status: 502,
    code: "test_payment_failed",
    message: "The Stripe sandbox payment could not complete. The saved mission has not started research.",
  };
}

function validateStoredCredential(
  stored: StoredTestPaymentCredential,
  configuration: Pick<SandboxConfiguration, "profileId" | "mppSecretKey">,
  externalId: string,
  now: number,
): "valid" | "expired" | "invalid" {
  try {
    const challenge = Challenge.deserialize(stored.challenge);
    const credential = Credential.deserialize<{ spt?: unknown; externalId?: unknown }>(stored.credential);
    const expiresAt = Date.parse(stored.expires_at);
    if (!Challenge.verify(challenge, { secretKey: configuration.mppSecretKey })
      || challenge.method !== "stripe"
      || challenge.intent !== "charge"
      || challenge.expires !== stored.expires_at
      || Challenge.credentialHeader(challenge) !== stored.credential_header
      || challenge.request.amount !== "50"
      || typeof challenge.request.currency !== "string"
      || challenge.request.currency.toLowerCase() !== "usd"
      || challenge.request.externalId !== externalId
      || (challenge.request.methodDetails as { networkId?: unknown } | undefined)?.networkId !== configuration.profileId
      || Credential.extractPaymentScheme(stored.credential) === null
      || Challenge.serialize(credential.challenge) !== stored.challenge
      || typeof credential.payload?.spt !== "string"
      || credential.payload.spt.length < 4
      || credential.payload.externalId !== externalId
      || !Number.isFinite(expiresAt)) {
      return "invalid";
    }
    return expiresAt > now + MINIMUM_CREDENTIAL_LIFETIME_MS ? "valid" : "expired";
  } catch {
    return "invalid";
  }
}

async function selectCredential(
  id: string,
  workspace: string,
  configuration: Pick<SandboxConfiguration, "profileId" | "mppSecretKey">,
  candidate: StoredTestPaymentCredential,
) {
  const now = Date.now();
  return mutateRecord(id, workspace, record => {
    if (record.service_payment?.proof) {
      delete record.service_payment.test_payment_credential;
      return;
    }
    const state = record.service_payment;
    if (!state?.external_id) {
      throw new AppError(409, "payment_binding_missing", "The saved mission is missing its service-payment binding.");
    }
    const existing = state.test_payment_credential;
    if (existing) {
      const validity = validateStoredCredential(existing, configuration, state.external_id, now);
      if (validity === "valid") return;
      if (validity === "invalid") {
        throw new AppError(409, "test_payment_credential_invalid", "The saved sandbox payment credential is invalid and requires reconciliation.");
      }
      if (state.first_credential_attempt_at) {
        throw new AppError(409, "payment_reconciliation_required", "The prior Stripe payment attempt used an expired credential. Reconcile its PaymentIntent before retrying.");
      }
    }
    if (validateStoredCredential(candidate, configuration, state.external_id, now) !== "valid") {
      throw new AppError(409, "test_payment_challenge_expired", "The Stripe sandbox payment challenge expired before it could be saved.");
    }
    state.test_payment_credential = candidate;
  });
}

function canonicalPaymentRequest(request: Request, id: string, origin: string) {
  const headers = new Headers({ "content-type": "application/json" });
  for (const name of ["authorization", "cookie", "origin"] as const) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Request(new URL(`/api/missions/${encodeURIComponent(id)}/service-payment`, origin), {
    method: "POST",
    headers,
    body: JSON.stringify({ mode: "test" }),
  });
}

/**
 * Pays the fixed sandbox service fee through the same MPP verifier used by
 * external callers. This function never dispatches work and never fabricates a
 * receipt; callers may dispatch only after it returns `ready`.
 */
export async function payMissionServiceFeeForTest(
  request: Request,
  id: string,
  workspace: string,
  origin: string,
): Promise<MissionTestPaymentResult> {
  try {
    const configuration = sandboxConfiguration();
    const saved = await getRecord(id, workspace);
    if (saved.view.mode !== "live") {
      throw new AppError(409, "test_payment_not_applicable", "Sandbox service payment applies only to live missions.");
    }

    // Both public entry points use one canonical internal payment request. A
    // persisted credential can therefore be retried with the exact method, URL
    // and body that produced its challenge, while bearer/cookie auth survives.
    const canonicalRequest = canonicalPaymentRequest(request, id, origin);
    const challengeRequest = canonicalRequest.clone();
    const retryRequest = canonicalRequest.clone();
    const initial = await gateMissionServicePayment(challengeRequest, id, workspace, origin);
    if (initial.kind !== "challenge") return initial;

    const challenges = Challenge.fromResponseList(initial.response);
    const challenge = challenges.find(candidate => candidate.method === "stripe" && candidate.intent === "charge");
    if (!challenge) throw new AppError(502, "test_payment_challenge_invalid", "The saved mission did not return a Stripe payment challenge.");

    const credentialState = (await getRecord(id, workspace)).service_payment;
    const externalId = credentialState?.external_id;
    if (!externalId) throw new AppError(409, "payment_binding_missing", "The saved mission is missing its service-payment binding.");

    let selected = credentialState.test_payment_credential;
    if (selected) {
      const validity = validateStoredCredential(selected, configuration, externalId, Date.now());
      if (validity === "expired" && credentialState.first_credential_attempt_at) {
        throw new AppError(409, "payment_reconciliation_required", "The prior Stripe payment attempt used an expired credential. Reconcile its PaymentIntent before retrying.");
      }
      if (validity === "invalid") {
        throw new AppError(409, "test_payment_credential_invalid", "The saved sandbox payment credential is invalid and requires reconciliation.");
      }
      if (validity === "expired") selected = undefined;
    }

    if (!selected) {
      const payer = Mppx.create({
        methods: stripe({
          paymentMethod: TEST_PAYMENT_METHOD,
          createToken: async parameters => {
            if (parameters.amount !== "50"
              || parameters.currency.toLowerCase() !== "usd"
              || parameters.networkId !== configuration.profileId
              || parameters.paymentMethod !== TEST_PAYMENT_METHOD) {
              throw new AppError(502, "test_payment_challenge_mismatch", "The Stripe challenge does not match the fixed sandbox service fee.");
            }
            return requestSandboxToken(configuration.secretKey, parameters);
          },
        }),
        polyfill: false,
      });
      const credential = await payer.createCredential(initial.response);
      const expiresAt = challenge.expires;
      if (!expiresAt || Date.parse(expiresAt) <= Date.now() + MINIMUM_CREDENTIAL_LIFETIME_MS) {
        throw new AppError(409, "test_payment_challenge_expired", "The Stripe sandbox payment challenge expired before it could be saved.");
      }
      const candidate: StoredTestPaymentCredential = {
        credential,
        challenge: Challenge.serialize(challenge),
        credential_header: Challenge.credentialHeader(challenge),
        expires_at: expiresAt,
      };
      const selectedRecord = await selectCredential(id, workspace, configuration, candidate);
      if (selectedRecord.service_payment?.proof) {
        const completed = await gateMissionServicePayment(retryRequest, id, workspace, origin);
        if (completed.kind === "challenge") {
          throw new AppError(409, "payment_reconciliation_required", "The verified sandbox payment proof could not be replayed safely.");
        }
        return completed;
      }
      selected = selectedRecord.service_payment?.test_payment_credential;
    }
    if (!selected || validateStoredCredential(selected, configuration, externalId, Date.now()) !== "valid") {
      throw new AppError(409, "payment_reconciliation_required", "The saved sandbox payment credential cannot be retried safely.");
    }
    retryRequest.headers.delete("payment-receipt");
    retryRequest.headers.set(selected.credential_header, selected.credential);
    const verified = await gateMissionServicePayment(retryRequest, id, workspace, origin);
    if (verified.kind === "challenge") {
      throw new AppError(502, "test_payment_rejected", "Stripe rejected the sandbox payment credential.");
    }
    return verified;
  } catch (error) {
    return failure(id, workspace, error);
  }
}
