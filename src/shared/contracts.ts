export type Lane = "amazon" | "fiverr" | "event_tickets";
export type TaskStatus = "queued" | "researching" | "options_ready" | "prepared" | "awaiting_approval" | "executing" | "confirmed" | "needs_human" | "failed";
export type MissionStatus = "queued" | "running" | "awaiting_approval" | "completed" | "needs_attention" | "failed";
export type EvidenceMode = "live" | "test" | "fixture" | "replay";

export interface Evidence {
  id: string; task_id: string; source_url: string; observed_at: string;
  title: string; detail: string; mode: EvidenceMode;
  artifact_url?: string; confirmation_ref?: string;
  /** Set only by an adapter after observing the corresponding provider page. */
  kind?: "observation" | "checkout_preview" | "merchant_confirmation" | "merchant_receipt";
  proposal_id?: string; revision?: number;
}
export interface Option {
  id: string; title: string; description: string; source_url: string; merchant: string;
  amount_minor: number; currency: "USD"; quantity: number; delivery_date?: string;
  available?: boolean; recommended: boolean; reason: string; evidence_ids: string[];
}
export interface Proposal {
  id: string; revision: number; task_id: string; option_id: string;
  merchant: string; title: string; source_url: string; quantity: number;
  recipient_ref: string; deadline: string; subtotal_minor: number; tax_minor: number;
  shipping_minor: number; fees_minor: number; total_minor: number;
  currency: "USD"; expires_at: string;
}
export interface Approval {
  id: string; proposal_id: string; revision: number;
  state: "pending" | "approved" | "rejected" | "stale";
  approved_at?: string; link_state?: string; link_approval_url?: string;
}
export interface TaskLinks {
  review_url: string;
  preview_url: string | null;
  preview_kind: "provider_page" | "checkout_preview" | "unavailable";
  confirmation_url: string | null;
  receipt_url: string | null;
  receipt_state: "not_ready" | "available" | "not_captured" | "example";
}
export interface Task {
  id: string; lane: Lane; title: string; status: TaskStatus; progress: string;
  options: Option[]; proposal?: Proposal; approval?: Approval; evidence: Evidence[];
  blocker?: string; confirmation_ref?: string; started_at?: string; completed_at?: string;
  links?: TaskLinks;
}
export interface Budget {
  limit_minor: number; proposed_minor: number; reserved_minor: number;
  committed_minor: number; uncertain_minor: number; available_minor: number;
}
export interface ServicePayment {
  status: "not_configured" | "payment_required" | "pending" | "paid" | "waived_fixture";
  amount_minor: number; currency: "USD"; mode: "test" | "live" | "fixture";
  reference?: string; checkout_url?: string;
}
export interface Activity {
  id: string; at: string; lane?: Lane;
  kind: "info" | "decision" | "approval" | "warning" | "success"; text: string;
}
export interface MissionInput {
  objective: string; currency: "USD"; purchase_budget_minor: number;
  deadline: string; headcount: number;
  requirements: {
    amazon: { category: string; delivery_ref: string };
    fiverr: { category: string; brief: string; due_date: string };
    event_tickets: { event_url: string; date: string; quantity: number; attendee_ref: string };
  };
}
export interface MissionView {
  mission_id: string; revision: number; status: MissionStatus; objective: string;
  deadline: string; headcount: number; created_at: string; updated_at: string;
  mode: EvidenceMode; budget: Budget; service_payment: ServicePayment;
  tasks: Task[]; evidence: Evidence[]; blockers: string[]; next_actions: string[];
  activity: Activity[];
  dashboard_url?: string; result_url?: string;
}
export interface RuntimeReadiness { service: string; ready: boolean; detail: string }
