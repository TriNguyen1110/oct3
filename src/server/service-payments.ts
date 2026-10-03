import { createHash, createHmac } from "node:crypto";
import { Credential, Receipt } from "mppx";
import { Mppx, stripe } from "mppx/server";
import Stripe from "stripe";

export const MISSION_SERVICE_FEE_MINOR = 50 as const;
export const MISSION_SERVICE_FEE_CURRENCY = "USD" as const;

export type ServicePaymentMode = "test" | "live";

export interface ServicePaymentReadiness {
  ready: boolean;
  missing: Array<"STRIPE_SECRET_KEY" | "STRIPE_PROFILE_ID" | "MPP_SECRET_KEY">;
  mode?: ServicePaymentMode;
  detail: string;
}

export interface ServicePaymentBindingInput {
  workspaceId: string;
  idempotencyKey: string;
  requestHash: string;
}

export interface ServicePaymentBinding {
  externalId: string;
  scope: string;
}

export interface VerifiedServicePaymentProof {
  reference: string;
  external_id: string;
  amount_minor: typeof MISSION_SERVICE_FEE_MINOR;
  currency: typeof MISSION_SERVICE_FEE_CURRENCY;
  mode: ServicePaymentMode;
  verified_at: string;
}

export type MissionServicePaymentResult =
  | { kind: "challenge"; response: Response }
  | {
      kind: "paid";
      proof: VerifiedServicePaymentProof;
      withReceipt(response: Response): Response;
    };

export class ServicePaymentSetupError extends Error {
  readonly readiness: ServicePaymentReadiness;

  constructor(readiness: ServicePaymentReadiness) {
    super(readiness.detail);
    this.name = "ServicePaymentSetupError";
    this.readiness = readiness;
  }
}

interface PaymentRuntime {
  mode: ServicePaymentMode;
  charge(request: Request, binding: ServicePaymentBinding): Promise<
    | { status: 402; challenge: Response }
    | { status: 200; receipt: Receipt.Receipt }
  >;
}

let cachedRuntime: { key: string; value: PaymentRuntime } | undefined;
const PAYMENT_CHALLENGE_WINDOW_MS = 15 * 60 * 1000;

function stripeMode(secretKey: string): ServicePaymentMode | undefined {
  if (secretKey.startsWith("sk_test_")) return "test";
  if (secretKey.startsWith("sk_live_")) return "live";
  return undefined;
}

function profileMatchesMode(profileId: string, mode: ServicePaymentMode) {
  return mode === "test"
    ? profileId.startsWith("profile_test_")
    : profileId.startsWith("profile_") && !profileId.startsWith("profile_test_");
}

export function servicePaymentReadiness(
  env: NodeJS.ProcessEnv = process.env,
): ServicePaymentReadiness {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const profileId = env.STRIPE_PROFILE_ID?.trim();
  const mppSecretKey = env.MPP_SECRET_KEY?.trim();
  const missing: ServicePaymentReadiness["missing"] = [];
  if (!secretKey) missing.push("STRIPE_SECRET_KEY");
  if (!profileId) missing.push("STRIPE_PROFILE_ID");
  if (!mppSecretKey) missing.push("MPP_SECRET_KEY");
  if (missing.length) {
    return {
      ready: false,
      missing,
      detail: `Stripe MPP setup is incomplete: ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} required.`,
    };
  }

  const mode = stripeMode(secretKey!);
  if (mode !== "test") {
    return {
      ready: false,
      missing: [],
      ...(mode ? { mode } : {}),
      detail: "Cue service payments require a Stripe sandbox server key; live charging is disabled.",
    };
  }
  if (Buffer.byteLength(mppSecretKey!, "utf8") < 32) {
    return {
      ready: false,
      missing: [],
      mode,
      detail: "MPP_SECRET_KEY must contain at least 32 bytes for challenge binding.",
    };
  }
  if (!profileMatchesMode(profileId!, mode)) {
    return {
      ready: false,
      missing: [],
      mode,
      detail: `STRIPE_PROFILE_ID does not match the Stripe ${mode} mode key.`,
    };
  }
  return {
    ready: true,
    missing: [],
    mode,
    detail: `Stripe MPP ${mode} mode is configured for the $0.50 mission service fee.`,
  };
}

export function servicePaymentBinding(
  input: ServicePaymentBindingInput,
  env: NodeJS.ProcessEnv = process.env,
): ServicePaymentBinding {
  const mppSecretKey = env.MPP_SECRET_KEY?.trim();
  if (!mppSecretKey || Buffer.byteLength(mppSecretKey, "utf8") < 32) {
    throw new ServicePaymentSetupError({
      ready: false,
      missing: mppSecretKey ? [] : ["MPP_SECRET_KEY"],
      detail: "MPP_SECRET_KEY must contain at least 32 bytes for durable mission binding.",
    });
  }
  const digest = createHmac("sha256", mppSecretKey)
    .update("cue:mission-service-fee:v1\0")
    .update(input.workspaceId)
    .update("\0")
    .update(input.idempotencyKey)
    .update("\0")
    .update(input.requestHash)
    .digest("base64url");
  return {
    externalId: `cue_mission_${digest}`,
    scope: `cue:mission:create:${digest}`,
  };
}

export function hasMissionPaymentCredential(request: Request): boolean {
  const header = request.headers.get("payment-authorization");
  return header ? Credential.extractPaymentScheme(header) !== null : false;
}

export function withStoredServicePaymentReceipt(
  response: Response,
  proof: VerifiedServicePaymentProof,
): Response {
  const headers = new Headers(response.headers);
  headers.set("Payment-Receipt", Receipt.serialize({
    method: "stripe",
    status: "success",
    timestamp: proof.verified_at,
    reference: proof.reference,
    externalId: proof.external_id,
  }));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function runtime(env: NodeJS.ProcessEnv): PaymentRuntime {
  const readiness = servicePaymentReadiness(env);
  if (!readiness.ready || !readiness.mode) throw new ServicePaymentSetupError(readiness);
  const secretKey = env.STRIPE_SECRET_KEY!.trim();
  const profileId = env.STRIPE_PROFILE_ID!.trim();
  const mppSecretKey = env.MPP_SECRET_KEY!.trim();
  const cacheKey = createHash("sha256")
    .update(secretKey)
    .update("\0")
    .update(profileId)
    .update("\0")
    .update(mppSecretKey)
    .digest("hex");
  if (cachedRuntime?.key === cacheKey) return cachedRuntime.value;

  const stripeSdk = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 10_000 });
  const stripeClient = {
    paymentIntents: {
      async create(...args: any[]) {
        const [parameters, suppliedOptions = {}] = args;
        const externalId = parameters?.metadata?.cue_payment_binding;
        if (typeof externalId !== "string" || !externalId.startsWith("cue_mission_")) {
          throw new Error("Cue service payment is missing its durable payment binding.");
        }
        // Stripe API v23 manages eligible methods through the Dashboard and
        // rejects the removed payment_method_types create parameter. mppx 0.13.1
        // does not currently send it, and this boundary strips it defensively.
        const { payment_method_types: _removedPaymentMethodTypes, ...compatibleParameters } = parameters;
        const paymentIntent = await stripeSdk.paymentIntents.create(compatibleParameters, {
          ...suppliedOptions,
          // One Stripe PaymentIntent per durable mission request, including after
          // response loss. Stripe rejects a reused key if payment inputs differ.
          idempotencyKey: `cue_service_${externalId}`,
        });
        return {
          id: paymentIntent.id,
          status: paymentIntent.status,
          // A successful Stripe idempotency replay proves the same bound payment.
          // mppx can therefore return its original PaymentIntent as the receipt.
          lastResponse: paymentIntent.lastResponse
            ? {
                headers: {
                  ...paymentIntent.lastResponse.headers,
                  "idempotent-replayed": "false",
                },
              }
            : undefined,
        };
      },
    },
  };
  const method = stripe.spt({
    client: stripeClient,
    networkId: profileId,
    currency: "usd",
    decimals: 2,
    paymentMethodTypes: ["card", "link"],
  });
  const payment = Mppx.create({
    methods: [method],
    requiresAuth: true,
    secretKey: mppSecretKey,
  });

  const value: PaymentRuntime = {
    mode: readiness.mode,
    async charge(request, binding) {
      const result = await payment.charge({
        amount: "0.50",
        description: "Cue durable mission service fee",
        expires: new Date(
          (Math.floor(Date.now() / PAYMENT_CHALLENGE_WINDOW_MS) + 1) *
            PAYMENT_CHALLENGE_WINDOW_MS,
        ),
        externalId: binding.externalId,
        paymentIntentOptions: {
          metadata: {
            cue_service: "mission",
            cue_payment_binding: binding.externalId,
          },
        },
        scope: binding.scope,
      })(request);
      if (result.status === 402) return { status: 402, challenge: result.challenge };
      // Read only the receipt mppx generated after successful server-side
      // verification. Never accept a caller-provided Payment-Receipt header.
      const wrapped = result.withReceipt(new Response(null, { status: 204 }));
      return { status: 200, receipt: Receipt.fromResponse(wrapped) };
    },
  };
  cachedRuntime = { key: cacheKey, value };
  return value;
}

export async function requireMissionServicePayment(
  request: Request,
  binding: ServicePaymentBinding,
  env: NodeJS.ProcessEnv = process.env,
): Promise<MissionServicePaymentResult> {
  const payment = runtime(env);
  const result = await payment.charge(request, binding);
  if (result.status === 402) return { kind: "challenge", response: result.challenge };

  const receipt = result.receipt;
  if (receipt.method !== "stripe"
    || receipt.status !== "success"
    || typeof receipt.reference !== "string"
    || !receipt.reference.startsWith("pi_")
    || receipt.externalId !== binding.externalId
    || typeof receipt.timestamp !== "string"
    || !Number.isFinite(Date.parse(receipt.timestamp))) {
    throw new Error("Stripe verified the service payment without returning the bound MPP receipt.");
  }
  return {
    kind: "paid",
    proof: {
      reference: receipt.reference,
      external_id: binding.externalId,
      amount_minor: MISSION_SERVICE_FEE_MINOR,
      currency: MISSION_SERVICE_FEE_CURRENCY,
      mode: payment.mode,
      verified_at: receipt.timestamp,
    },
    withReceipt: response => withStoredServicePaymentReceipt(response, {
      reference: receipt.reference,
      external_id: binding.externalId,
      amount_minor: MISSION_SERVICE_FEE_MINOR,
      currency: MISSION_SERVICE_FEE_CURRENCY,
      mode: payment.mode,
      verified_at: receipt.timestamp,
    }),
  };
}
