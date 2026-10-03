"use client";

import { useEffect, useState } from "react";
import type { Task } from "@/src/shared/contracts";
import { FREE_REGISTRATION_EVENT_URL } from "@/src/shared/registration";
import { api } from "@/src/client/api";

interface RegistrationReview {
  proposal_id: string; revision: number; attendee: { name: string; email: string };
  event_title: string; event_start_at: string; ticket_name: string;
  source_url: string; total_minor: number; expires_at: string; profile_unchanged: boolean;
}

export function FreeRegistrationReview({ task, busy, onAction, passkeyRequired = false, passkeyReady = false }: {
  task: Task; busy: boolean; passkeyRequired?: boolean; passkeyReady?: boolean; onAction: (action: "approve" | "reject" | "resume") => Promise<void>;
}) {
  const [review, setReview] = useState<RegistrationReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const proposal = task.proposal!;
  useEffect(() => {
    let active = true; setReview(null); setError(null); setLoading(true);
    api<RegistrationReview>(`/api/tasks/${encodeURIComponent(task.id)}/registration-review`)
      .then(next => { if (active) setReview(next); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Pinned registration details are unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [task.id, proposal.id, proposal.revision, task.approval?.state]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const valid = !!review && review.proposal_id === proposal.id && review.revision === proposal.revision && review.profile_unchanged === true && review.total_minor === 0 && proposal.total_minor === 0 && proposal.quantity === 1 && !!proposal.action_hash && review.source_url === FREE_REGISTRATION_EVENT_URL && proposal.source_url === review.source_url && review.expires_at === proposal.expires_at && Date.parse(review.expires_at) > now && !!review.attendee?.name && !!review.attendee?.email;
  const protectedAttempt = task.status === "executing" || task.status === "needs_human";
  const approved = task.approval?.state === "approved" && task.approval.proposal_id === proposal.id && task.approval.revision === proposal.revision;
  return <section className="registration-review" aria-labelledby="registration-review-title">
    <div className="evidence-heading"><h4 id="registration-review-title">Review your free RSVP</h4><span>1 ticket · $0 USD</span></div>
    {loading && <p className="field-hint" role="status">Loading the pinned attendee and event…</p>}
    {review && <div className="proposal-details">
      <div><span>Attendee · pinned for this approval</span><strong>{review.attendee.name}</strong><strong>{review.attendee.email}</strong></div>
      <div><span>Event</span><strong>{review.event_title}</strong></div>
      <div><span>Event starts</span><strong>{new Date(review.event_start_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" })} PT</strong></div>
      <div><span>Ticket</span><strong>{review.ticket_name} · quantity 1</strong></div>
    </div>}
    {!loading && !valid && <p className="form-error" role="alert">{error || "The pinned details are missing, expired, or no longer match your saved profile or this proposal."} Prepare the free RSVP again before approving.</p>}
    {protectedAttempt ? <p className="field-hint" role="status">{task.status === "executing" ? "Registration is in progress. Wait for the saved provider result." : "This registration needs a manual check. An uncertain attempt must be reconciled before another submission."}</p> : <>
      <p className="field-hint">Preparation does not fill or submit the form. Approval binds this attendee, event and free ticket. “Register now” submits the actual RSVP; no Link payment is needed.</p>
      {approved ? <><p className="approved-status">Free RSVP approved for these exact details.</p><button className="button primary full" disabled={busy || loading || !valid} onClick={() => void onAction("resume")}>{busy ? "Checking registration…" : "Register now"}</button></> : <div className="action-row"><button className="button secondary" disabled={busy} onClick={() => void onAction("reject")}>Decline plan</button><button className="button primary" disabled={busy || loading || !valid || task.approval?.state === "rejected" || (passkeyRequired && !passkeyReady)} onClick={() => void onAction("approve")}>{busy ? "Confirming…" : passkeyRequired ? "Confirm with passkey" : "Approve free RSVP"}</button></div>}
    </>}
  </section>;
}
