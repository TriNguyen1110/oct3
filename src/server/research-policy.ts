import { createHash } from "node:crypto";
import type { ResearchTaskResult } from "../browser/types";
import { AppError } from "./errors";
import type { MissionRecord } from "./model";

const COOLDOWN_MS = 15000;
const MAX_ATTEMPTS = 2;
// Bump only after a real local worker repair; production also binds its commit.
const RESEARCH_RUNTIME_VERSION = "read-only-research-v1";

export function researchFingerprint(): string {
  return createHash("sha256").update(JSON.stringify([
    RESEARCH_RUNTIME_VERSION, process.env.VERCEL_GIT_COMMIT_SHA || "local",
    process.env.SURFSKY_API_BASE_URL || "", process.env.SURFSKY_PROXY_COUNTRY || "",
    process.env.SURFSKY_API_KEY || process.env.SURFSKY_API_TOKEN || "",
  ])).digest("hex");
}

/** Same gate runs at the API and worker boundary; model retries cannot bypass it. */
export function researchGate(record: MissionRecord, taskId: string, now = Date.now()): AppError | null {
  const task = record.view.tasks.find(x => x.id === taskId)!;
  if (["executing", "confirmed"].includes(task.status) || record.reservations.some(x => x.task_id === taskId && x.state !== "released")) return new AppError(409, "task_busy", "This worker has allocated spending or a commitment. Reconcile it before researching again.");
  const claim = record.research_claims[taskId];
  if (claim && Date.parse(claim.expires_at) > now) return new AppError(409, "task_busy", "This worker already has an active research attempt.");
  const prior = record.research_attempts?.[taskId];
  if (claim || prior?.last_cleanup === "unconfirmed") return new AppError(409, "research_reconciliation_required", "The previous browser start or cleanup is uncertain. Retry this same task only after the server verifies its Surfsky profile is stopped.");
  if (prior?.revision === record.view.revision && prior.fingerprint === researchFingerprint() && prior.attempts >= MAX_ATTEMPTS && prior.last_blocker_code) return new AppError(409, "research_retry_exhausted", `Research stopped after ${prior.attempts} attempts (${prior.last_blocker_code}). Correct the Surfsky configuration or repair and redeploy the worker, then retry this same task. Unchanged retries will not open another browser.`);
  if (prior && Date.parse(prior.cooldown_until) > now) return new AppError(429, "research_cooldown", `Wait until ${prior.cooldown_until} before retrying this worker. Other lanes can continue.`);
  return null;
}

export function beginResearchAttempt(record: MissionRecord, taskId: string, now = Date.now()): number {
  const gate = researchGate(record, taskId, now);
  if (gate) throw gate;
  record.research_attempts ||= {};
  const prior = record.research_attempts[taskId], fingerprint = researchFingerprint();
  const same = prior?.revision === record.view.revision && prior.fingerprint === fingerprint;
  const attempts = same ? prior.attempts + 1 : 1;
  record.research_attempts[taskId] = { revision: record.view.revision, attempts, fingerprint, last_cleanup: "unconfirmed", cooldown_until: new Date(now + COOLDOWN_MS).toISOString() };
  return attempts;
}

export function finishResearchAttempt(record: MissionRecord, taskId: string, revision: number, result: Pick<ResearchTaskResult, "blocker_code" | "cleanup">, now = Date.now()) {
  const prior = record.research_attempts?.[taskId];
  if (!prior || prior.revision !== revision) return;
  prior.last_blocker_code = result.blocker_code;
  prior.last_cleanup = result.cleanup;
  prior.cooldown_until = new Date(now + COOLDOWN_MS).toISOString();
  if (record.research_claims[taskId]?.revision === revision) delete record.research_claims[taskId];
}
