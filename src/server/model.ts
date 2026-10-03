import type { MissionInput, MissionView } from "../shared/contracts";
import type { FreeRegistrationSnapshot, RegistrationAttendee } from "../shared/registration";
import type { BrowserBlockerCode, ResearchTaskResult } from "../browser/types";
import type { VerifiedServicePaymentProof } from "./service-payments";
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
export interface MissionServicePaymentState {
  external_id?: string;
  scope?: string;
  first_credential_attempt_at?: string;
  /** Private sandbox credential selected by CAS; never expose through MissionView. */
  test_payment_credential?: {
    credential: string;
    challenge: string;
    credential_header: string;
    expires_at: string;
  };
  proof?: VerifiedServicePaymentProof;
}
export interface EveDispatchState {
  revision: number;
  state: "claimed" | "sent" | "uncertain";
  claim_id: string;
  claimed_at: string;
}
export interface MissionRecord {
  id: string; workspace_id: string; idempotency_key: string; request_hash: string;
  version: number; input: MissionInput; view: MissionView; reservations: Reservation[];
  attempts: Record<string, { state: "claimed" | "finished" | "uncertain"; started_at: string }>;
  research_claims: Record<string, { revision: number; expires_at: string }>;
  /** Private operational metadata; never included in MissionView or model output. */
  research_attempts?: Record<string, ResearchAttempt>;
  approved_action_hashes?: Record<string, string>;
  /** Provider references and approval binding only. Never card data or wallet tokens. */
  wallet_spends?: Record<string, {
    proposal_id: string; revision: number; action_hash: string; idempotency_key: string;
    test_mode: boolean; state: string; claim_id: string; request_id?: string;
    checked_at: string;
  }>;
  /** Private attendee data and provider identifiers; never copy into MissionView. */
  prepared_registrations?: Record<string, {
    revision: number;
    proposal_id: string;
    snapshot: FreeRegistrationSnapshot;
    attendee: RegistrationAttendee;
    profile_hash: string;
    action_hash: string;
    prepared_at: string;
  }>;
  service_payment?: MissionServicePaymentState;
  eve_dispatch?: EveDispatchState;
  eve_session_id?: string;
}
