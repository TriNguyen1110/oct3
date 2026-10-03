import type { Evidence, Lane, MissionInput, Option, Proposal } from "../shared/contracts";
import type { ComponentSnapshot } from "./components";

export type BrowserBlockerCode = "configuration" | "provider_auth" | "provider_capacity" | "provider_credit" | "profile_busy" | "profile_conflict" | "provider_error" | "timeout" | "cancelled" | "login_required" | "challenge" | "no_options" | "missing_event" | "unsupported_url" | "approval_invalid" | "merchant_changed" | "checkout_handoff";
export interface BrowserProgress { task_id: string; lane: Lane; at: string; message: string }
export interface ResearchTaskInput {
  task_id: string;
  lane: Lane;
  requirements: NonNullable<MissionInput["requirements"][Lane]>;
  deadline: string;
  budget_minor: number;
  attempt_key: string;
  /** Private server-side connection reference, never a caller-supplied URL. */
  connection_ref?: string;
  timeout_ms?: number;
  signal?: AbortSignal;
  onProgress?: (event: BrowserProgress) => void | Promise<void>;
}
export interface ResearchTaskResult {
  /** Read-only diagnostic metadata; snapshot tokens are valid only in their owning live page. */
  inspection?: ComponentSnapshot;
  options: Option[];
  evidence: Evidence[];
  blocker?: string;
  blocker_code?: BrowserBlockerCode;
  progress: string;
  elapsed_ms: number;
  cleanup: "confirmed" | "not_started" | "unconfirmed";
}
export interface ExecuteApprovedTaskInput extends ResearchTaskInput {
  proposal: Proposal;
  authorization: {
    proposal_id: string; revision: number; approved: boolean;
    reservation_id: string; link_status: string; attempt_key: string;
  };
}
export interface ExecuteApprovedTaskResult {
  status: "confirmed" | "needs_human" | "failed";
  evidence: Evidence[];
  confirmation_ref?: string;
  blocker?: string;
  blocker_code?: BrowserBlockerCode;
  uncertain?: boolean;
}
export interface ObservedCandidate {
  title: string; source_url: string; price_text: string; amount_minor: number;
  description: string; quantity: number; available?: boolean; delivery_date?: string;
}
