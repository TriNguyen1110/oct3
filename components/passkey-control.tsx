"use client";

import { useCallback, useEffect, useState } from "react";
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { api, ApiError } from "@/src/client/api";

type RegistrationOptions = Parameters<typeof startRegistration>[0]["optionsJSON"];
type AuthenticationOptions = Parameters<typeof startAuthentication>[0]["optionsJSON"];

export function passkeyError(cause: unknown) {
  if (cause instanceof ApiError) return cause.message;
  const name = cause instanceof Error ? cause.name : "";
  if (name === "NotAllowedError" || name === "AbortError") return "Device confirmation was cancelled or timed out. No approval was sent. Try again when you’re ready.";
  if (name === "InvalidStateError") return "This device may already have a passkey. Check passkey status, then try again.";
  return cause instanceof Error ? cause.message : "Device confirmation could not finish. No approval was sent.";
}

/** Returns only a native assertion; the server still verifies and approves the exact proposal. */
export async function confirmProposalWithPasskey(taskId: string, proposalId: string, revision: number) {
  if (!browserSupportsWebAuthn()) throw new Error("Passkeys are unavailable here. Open Cue in a supported browser over HTTPS.");
  const challenge = await api<{ challenge_id: string; options: AuthenticationOptions }>(`/api/tasks/${encodeURIComponent(taskId)}/approval-options`, {
    method: "POST", body: JSON.stringify({ proposal_id: proposalId, revision }),
  });
  const response = await startAuthentication({ optionsJSON: challenge.options });
  return { challenge_id: challenge.challenge_id, response };
}

export function PasskeyControl({ onReady, disabled = false }: { onReady?: (ready: boolean) => void; disabled?: boolean }) {
  const [state, setState] = useState<"loading" | "ready" | "missing" | "unsupported" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setState("loading"); setError(null); onReady?.(false);
    if (!browserSupportsWebAuthn()) { setState("unsupported"); return; }
    try {
      const status = await api<{ enrolled: boolean; required: boolean }>("/api/passkeys");
      setState(status.enrolled ? "ready" : "missing"); onReady?.(status.enrolled === true);
    } catch (cause) { setState("error"); setError(passkeyError(cause)); }
  }, [onReady]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function enroll() {
    setBusy(true); setError(null); onReady?.(false);
    try {
      const challenge = await api<{ challenge_id: string; options: RegistrationOptions }>("/api/passkeys/register/options", { method: "POST", body: "{}" });
      const response = await startRegistration({ optionsJSON: challenge.options });
      const result = await api<{ verified: boolean }>("/api/passkeys/register/verify", { method: "POST", body: JSON.stringify({ challenge_id: challenge.challenge_id, response }) });
      if (result.verified !== true) throw new Error("Passkey setup could not be verified. No plan was approved.");
      await refresh();
    } catch (cause) { setError(passkeyError(cause)); }
    finally { setBusy(false); }
  }

  return <section className="passkey-control" aria-label="Device confirmation">
    <svg className="passkey-glyph" width="29" height="29" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M7 15a9 9 0 0 1 18 0v4m-22-5a13 13 0 0 1 26 0M11 16a5 5 0 0 1 10 0v5c0 3-1 6-3 8M7 20c0 4-1 6-2 8m11-13v7c0 3-1 6-3 8m12-7c0 3-1 5-2 7M11 20v2c0 3-1 5-2 7"/></svg>
    <div><strong>{busy ? "Follow your device’s prompt" : state === "ready" ? "Passkey ready" : state === "loading" ? "Checking device confirmation…" : "Make approvals yours"}</strong>
      <p>Touch ID, face unlock, or device PIN.</p>
      {state === "ready" ? <p className="passkey-note">Confirm each exact plan separately. Setup never approves a mission.</p> : state === "unsupported" ? <p className="passkey-note">Passkeys need a supported browser and HTTPS. Live approval stays locked.</p> : state !== "loading" && <><p className="passkey-note">Set up once, then use your device to confirm a live approval.</p><button className="button secondary" type="button" disabled={busy || disabled} onClick={() => void (state === "error" ? refresh() : enroll())}>{busy ? "Waiting for your device…" : state === "error" ? "Check passkey status" : "Set up a passkey"}</button></>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {error && state !== "error" && <button className="text-button" type="button" disabled={busy || disabled} onClick={() => void refresh()}>Check passkey status</button>}
    </div>
  </section>;
}
