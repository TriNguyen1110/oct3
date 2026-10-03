import type { MissionInput, MissionView } from "../shared/contracts";
import type { BrowserBlockerCode, ResearchTaskResult } from "../browser/types";
export interface ResearchAttempt {
  revision: number; attempts: number; fingerprint: string;
  last_blocker_code?: BrowserBlockerCode;
  last_cleanup: ResearchTaskResult["cleanup"];
  cooldown_until: string;
}
export interface Reservation {
  id: string; task_id: string; proposal_id: string; amount_minor: number;
  state: "reserved" | "committed" | "released" | "uncertain";
}
export interface MissionRecord {
  id: string; workspace_id: string; idempotency_key: string; request_hash: string;
  version: number; input: MissionInput; view: MissionView; reservations: Reservation[];
  attempts: Record<string, { state: "claimed" | "finished" | "uncertain"; started_at: string }>;
  research_claims: Record<string, { revision: number; expires_at: string }>;
  /** Private operational metadata; never included in MissionView or model output. */
  research_attempts?: Record<string, ResearchAttempt>;
  eve_session_id?: string;
}
