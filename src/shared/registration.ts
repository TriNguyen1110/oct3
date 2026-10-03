import type { Evidence } from "./contracts";

/** Narrow demo capability. No general merchant mutation permission is granted. */
export const FREE_REGISTRATION_EVENT_URL = "https://luma.com/OpenTogether";

export interface FreeRegistrationSnapshot {
  provider: "luma";
  source_url: string;
  event_api_id: string;
  ticket_type_api_id: string;
  event_title: string;
  event_start_at: string;
  ticket_name: string;
  quantity: 1;
  total_minor: 0;
  currency: "USD";
  requires_approval: false;
  observed_at: string;
}

export interface RegistrationAttendee { name: string; email: string }

export interface PrepareRegistrationInput {
  task_id: string;
  source_url: string;
  attempt_key: string;
  expected_event_date: string;
  signal?: AbortSignal;
}

export interface PrepareRegistrationResult {
  snapshot?: FreeRegistrationSnapshot;
  evidence: Evidence[];
  blocker?: string;
  cleanup: "confirmed" | "not_started" | "unconfirmed";
}

export interface ExecuteRegistrationInput extends PrepareRegistrationInput {
  snapshot: FreeRegistrationSnapshot;
  attendee: RegistrationAttendee;
  authorization: {
    approved: boolean;
    proposal_id: string;
    revision: number;
    reservation_id: string;
    attempt_key: string;
    action_hash: string;
    expires_at: string;
  };
}

export interface ExecuteRegistrationResult {
  status: "confirmed" | "needs_human";
  evidence: Evidence[];
  confirmation_ref?: string;
  blocker?: string;
  uncertain: boolean;
  cleanup: "confirmed" | "not_started" | "unconfirmed";
}
