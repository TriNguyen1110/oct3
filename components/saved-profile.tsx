"use client";

import { useEffect, useState } from "react";
import { api } from "@/src/client/api";
import type { ManagerPreferences, PreferencesView } from "@/src/shared/preferences";

const empty: ManagerPreferences = { name: "", email: "", company: "", role: "" };

export function SavedProfile({ onProfileChange }: { onProfileChange: (exists: boolean) => void }) {
  const [draft, setDraft] = useState<ManagerPreferences>(empty);
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function reload() {
    setBusy(true); setError(null); setSaved(false);
    try {
      const view = await api<PreferencesView>("/api/preferences");
      setDraft(view.preferences ?? empty); setLoaded(true);
      setSaved(Boolean(view.preferences) && view.storage === "supabase");
      onProfileChange(Boolean(view.preferences));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't load your saved profile. Try reloading."); }
    finally { setBusy(false); }
  }

  useEffect(() => { void reload(); }, []); // Load only when the authenticated profile dialog opens.

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setSaved(false);
    try {
      const view = await api<PreferencesView>("/api/preferences", { method: "PUT", body: JSON.stringify(draft) });
      if (!view.preferences || view.storage !== "supabase") throw new Error("Save could not be confirmed. Reload your profile to check.");
      setDraft(view.preferences); setSaved(true); onProfileChange(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't save your profile. Your edits are still here."); }
    finally { setBusy(false); }
  }

  function change(field: keyof ManagerPreferences, value: string) {
    setDraft(current => ({ ...current, [field]: value })); setSaved(false);
  }

  return <form className="saved-profile-form" onSubmit={save}>
    <p className="modal-description">Keep your details in your private workspace for the next mission.</p>
    <label className="field">Name<input autoComplete="name" value={draft.name} onChange={event => change("name", event.target.value)} required maxLength={120} disabled={busy || !loaded}/></label>
    <label className="field">Email<input type="email" autoComplete="email" value={draft.email} onChange={event => change("email", event.target.value)} required maxLength={254} disabled={busy || !loaded}/></label>
    <div className="form-row">
      <label className="field">Company<input autoComplete="organization" value={draft.company} onChange={event => change("company", event.target.value)} maxLength={160} disabled={busy || !loaded}/></label>
      <label className="field">Role<input autoComplete="organization-title" value={draft.role} onChange={event => change("role", event.target.value)} maxLength={120} disabled={busy || !loaded}/></label>
    </div>
    <p className="field-hint">New live missions use a private profile reference, not these details in the brief. A saved profile never approves a purchase or registration.</p>
    {saved && <p className="field-hint" role="status">Saved in Supabase</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="action-row">
      <button type="button" className="button secondary" onClick={() => void reload()} disabled={busy}>Reload saved profile</button>
      <button type="submit" className="button primary" disabled={busy || !loaded}>{busy ? "Please wait…" : "Save profile"}</button>
    </div>
  </form>;
}
