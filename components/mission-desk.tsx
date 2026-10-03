"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lane, MissionInput, MissionView, RuntimeReadiness, Task, TaskStatus } from "@/src/shared/contracts";
import { api, ApiError } from "@/src/client/api";
import { createPreview, defaultInput } from "@/src/client/preview";
import { FreeRegistrationReview } from "@/components/free-registration-review";
import { FREE_REGISTRATION_EVENT_URL } from "@/src/shared/registration";
import { SavedProfile } from "@/components/saved-profile";
import type { PreferencesView } from "@/src/shared/preferences";
import { CueMark } from "@/components/cue-mark";
import { WorkerArt } from "@/components/worker-art";
import { VoiceBrief } from "@/components/voice-brief";
import { CinematicHero } from "@/components/cinematic-hero";
import { FoodMissionFields, defaultFoodRequest } from "@/components/food-mission-fields";
import { PasskeyControl, confirmProposalWithPasskey, passkeyError } from "@/components/passkey-control";

type IconName = "grid" | "arrow" | "chevron" | "check" | "clock" | "people" | "plus" | "sliders" | "link" | "code" | "activity" | "close" | "external" | "copy" | "shield" | "spark" | "box" | "ticket" | "design" | "warning";
function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    arrow: <><path d="M4 12h15M13 6l6 6-6 6"/></>, chevron: <path d="m9 5 7 7-7 7"/>, check: <path d="m5 12 4 4L19 6"/>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, people: <><path d="M3 20v-2a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v2M16 14a4 4 0 0 1 5 4v2"/><circle cx="8.5" cy="6.5" r="3.5"/><path d="M16 3a3.5 3.5 0 0 1 0 7"/></>, plus: <path d="M12 5v14M5 12h14"/>,
    sliders: <><path d="M4 7h5m4 0h7M4 17h9m4 0h3"/><circle cx="11" cy="7" r="2"/><circle cx="15" cy="17" r="2"/></>, link: <><path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 -1)"/></>,
    code: <><path d="m7 6-6 6 6 6m10-12 6 6-6 6M14 3l-4 18"/></>, activity: <path d="M2 12h5l3-8 4 16 3-8h5"/>, close: <path d="m6 6 12 12M6 18 18 6"/>, external: <><path d="M14 3h7v7m0-7L10 14M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/></>, copy: <><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>, shield: <><path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/></>, spark: <path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2Z"/>, box: <><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v10l9 5 9-5V8M12 13v10M7.5 5.5l9 5"/></>, ticket: <><path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Z"/><path d="M15 5v3m0 3v2m0 3v3"/></>, design: <><path d="m14 4 6 6M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15l-1 5Z"/></>, warning: <><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v.1"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{paths[name]}</svg>;
}

const laneMeta: Record<Lane, { label: string; role: string; icon: IconName; domain: string; number: string }> = {
  food: { label: "Food & supplies", role: "Food & supplies worker", icon: "spark", domain: "Pickup menu", number: "04" },
  amazon: { label: "Logistics", role: "Logistics worker", icon: "box", domain: "Amazon", number: "01" },
  fiverr: { label: "Hiring", role: "Hiring worker", icon: "people", domain: "Fiverr", number: "02" },
  event_tickets: { label: "Travel", role: "Events & tickets worker", icon: "ticket", domain: "Event provider", number: "03" },
};
const statusText: Record<TaskStatus, string> = { queued: "In the queue", researching: "Finding options", options_ready: "Options found", prepared: "Ready to review", awaiting_approval: "Your call", executing: "Working on it", confirmed: "Confirmed", needs_human: "Needs a hand", failed: "Couldn't complete" };
const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);
const readableDate = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }); };
const readableDateTime = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : `${date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })} PT`; };
const safeUrl = (value?: string) => { try { const url = new URL(value ?? ""); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined; } catch { return undefined; } };

function Modal({ children, title, onClose, wide = false }: { children: React.ReactNode; title: string; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? "modal-wide" : ""}`} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="dialog-title">
    <div className="modal-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></button></div>{children}
  </dialog>;
}

export default function MissionDesk() {
  const [mission, setMission] = useState<MissionView>(() => createPreview());
  const [authenticated, setAuthenticated] = useState(false);
  const [services, setServices] = useState<RuntimeReadiness[]>([]);
  const [modal, setModal] = useState<"auth" | "new" | "budget" | "connections" | "result" | "connect" | "task" | "history" | "profile" | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [draft, setDraft] = useState<MissionInput>(() => ({ ...defaultInput, requirements: { ...defaultInput.requirements, food: defaultInput.requirements.food ?? { ...defaultFoodRequest } } }));
  const [budget, setBudget] = useState("650");
  const [busy, setBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hasSavedProfile, setHasSavedProfile] = useState(false);
  const [online, setOnline] = useState(true);
  const [createMode, setCreateMode] = useState<"fixture" | "live">("fixture");
  const [copied, setCopied] = useState(false);
  const pendingSubmission = useRef<{ body: string; key: string; missionId?: string } | null>(null);
  const landing = useRef<{ missionId: string; taskId: string | null } | null>(null);
  const [linkedRevision, setLinkedRevision] = useState<number | null>(null);
  const [missionError, setMissionError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [savedMissionId, setSavedMissionId] = useState<string | null>(null);
  const [history, setHistory] = useState<MissionView[]>([]);
  const preview = mission.mission_id.startsWith("preview-");
  const selectedTask = mission.tasks.find(task => task.id === selectedTaskId);

  const refreshServices = useCallback(async () => {
    try { const response = await api<{ services: RuntimeReadiness[] }>("/api/readiness"); setServices(response.services ?? []); } catch { /* The access screen explains unconfigured connections. */ }
  }, []);

  const loadLandingMission = useCallback(async () => {
    const target = landing.current;
    const next = target
      ? await api<MissionView>(`/api/missions/${encodeURIComponent(target.missionId)}`)
      : (await api<{ mission: MissionView | null }>("/api/missions?latest=1")).mission;
    if (!next) return false;
    setMission(next); setMissionError(null);
    if (target?.taskId) {
      if (next.tasks.some(task => task.id === target.taskId)) {
        setSelectedTaskId(target.taskId); setModal("task");
      } else { setModal(null); setMissionError("This worker link is not part of the requested mission. Choose a worker below."); }
    } else setModal(null);
    return true;
  }, []);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const missionId = params.get("mission");
    if (missionId) {
      if (!/^[a-f0-9-]{36}$/i.test(missionId)) { setMissionError("This mission link is invalid."); return; }
      landing.current = { missionId, taskId: params.get("task") };
      const revision = Number(params.get("revision"));
      if (Number.isSafeInteger(revision) && revision > 0) setLinkedRevision(revision);
    }
    api<{ authenticated: boolean; role?: string }>("/api/auth").then(async result => {
      if (!active) return;
      if (!result.authenticated) { if (landing.current) setModal("auth"); return; }
      setAuthenticated(true); void refreshServices();
      await loadLandingMission();
    }).catch(cause => { if (active) setMissionError(cause instanceof Error ? cause.message : "Couldn't open this mission."); });
    return () => { active = false; };
  }, [refreshServices, loadLandingMission]);

  useEffect(() => {
    if (!authenticated || missionError) return;
    let active = true;
    const refresh = async () => {
      try {
        const targetId = preview ? landing.current?.missionId : mission.mission_id;
        const fresh = targetId ? await api<MissionView>(`/api/missions/${encodeURIComponent(targetId)}`) : (await api<{ mission: MissionView | null }>("/api/missions?latest=1")).mission;
        if (active && fresh) { setMission(previous => previous.mission_id !== fresh.mission_id || fresh.revision > previous.revision || (fresh.revision === previous.revision && fresh.updated_at >= previous.updated_at) ? fresh : previous); setOnline(true); }
      }
      catch (cause) { if (active) { setOnline(false); if (cause instanceof ApiError && cause.status === 401) setAuthenticated(false); } }
    };
    const timer = setInterval(refresh, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [mission.mission_id, preview, authenticated, missionError]);

  useEffect(() => {
    if (!authenticated) { setHasSavedProfile(false); return; }
    let active = true;
    api<PreferencesView>("/api/preferences").then(view => { if (active) setHasSavedProfile(Boolean(view.preferences)); }).catch(() => { /* Profile settings expose any load error when opened. */ });
    return () => { active = false; };
  }, [authenticated]);

  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(null), 5500); return () => clearTimeout(timeout); }, [toast]);
  const open = (next: typeof modal) => { setError(null); setModal(next); };
  const close = () => { if (!busy) { setModal(null); setError(null); } };
  const inspectTask = (task: Task) => { setSelectedTaskId(task.id); open("task"); };

  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await api("/api/auth", { method: "POST", body: JSON.stringify({ token, role: "manager" }) });
      setToken(""); setAuthenticated(true); await refreshServices();
      if (!await loadLandingMission()) setModal("new");
      setToast("Manager access connected.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't connect manager access."); }
    finally { setBusy(false); }
  }

  async function createMission(event: React.FormEvent) {
    event.preventDefault(); if (voiceBusy) return; setBusy(true); setError(null);
    try {
      if (!authenticated) { setModal("auth"); return; }
      const input = { ...draft, mode: createMode, requirements: { ...draft.requirements, event_tickets: { ...draft.requirements.event_tickets, attendee_ref: createMode === "live" && hasSavedProfile && draft.requirements.event_tickets.attendee_ref === "demo-team" ? "manager" : draft.requirements.event_tickets.attendee_ref, quantity: draft.headcount, event_url: draft.requirements.event_tickets.event_url || (createMode === "fixture" ? "https://www.eventbrite.com/" : "") } } };
      const body = JSON.stringify(input);
      if (!pendingSubmission.current || pendingSubmission.current.body !== body) pendingSubmission.current = { body, key: crypto.randomUUID() };
      const created = pendingSubmission.current.missionId
        ? await api<MissionView>(`/api/missions/${pendingSubmission.current.missionId}`)
        : await api<MissionView>("/api/missions", { method: "POST", headers: { "Idempotency-Key": pendingSubmission.current.key }, body });
      pendingSubmission.current = null;
      selectMission(created); setToast(createMode === "fixture" ? "Preview run created. All results will be labeled as examples." : "Mission dispatched. Your workers are on it.");
    } catch (cause) {
      const savedId = cause instanceof ApiError ? cause.metadata.missionId : undefined;
      if (savedId) {
        if (pendingSubmission.current) pendingSubmission.current.missionId = savedId;
        setSavedMissionId(savedId);
        const url = new URL(window.location.href);
        url.search = new URLSearchParams({ mission: savedId }).toString();
        window.history.replaceState(null, "", url);
        try {
          selectMission(await api<MissionView>(`/api/missions/${savedId}`));
          setPaymentError(cause instanceof ApiError && cause.status === 402 ? null : cause instanceof Error ? cause.message : "Service payment needs attention.");
          setToast("Mission saved. Continue service payment below.");
        } catch {
          setModal(null);
          setMissionError("Your mission is saved. Reopen it to check payment and worker status; do not submit a new mission.");
        }
      } else setError(cause instanceof Error ? cause.message : "Couldn't start this mission. Retry this same brief to reuse its submission key.");
    }
    finally { setBusy(false); }
  }

  async function servicePayment(checkOnly = false) {
    if (preview || !authenticated) return;
    setBusy(true); setPaymentError(null);
    const id = mission.mission_id;
    try {
      const next = await api<MissionView>(`/api/missions/${id}${checkOnly ? "" : "/service-payment"}`, checkOnly ? {} : { method: "POST", body: JSON.stringify({ mode: "test" }) });
      setMission(current => current.mission_id === id ? next : current);
      setToast(next.service_payment.status === "paid" ? "Service payment verified. Worker status is updating." : "Saved payment status refreshed.");
    } catch (cause) {
      setPaymentError(`${cause instanceof Error ? cause.message : "Payment could not be verified."} Check saved status before retrying. Continue on this mission; no new mission is needed.`);
      try {
        const next = await api<MissionView>(`/api/missions/${id}`);
        setMission(current => current.mission_id === id ? next : current);
      } catch { /* Keep the saved mission and offer an explicit status refresh. */ }
    } finally { setBusy(false); }
  }

  async function reopenSavedMission() {
    if (!savedMissionId) return;
    setBusy(true);
    try { selectMission(await api<MissionView>(`/api/missions/${savedMissionId}`)); }
    catch { setMissionError("The saved mission is temporarily unavailable. Try reopening it again, or reload this dashboard link."); }
    finally { setBusy(false); }
  }

  async function reviseBudget(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    const amount = Math.round(Number(budget) * 100);
    if (!Number.isSafeInteger(amount) || amount <= 0) { setError("Enter a budget greater than zero."); setBusy(false); return; }
    try {
      if (preview) { setMission(createPreview(amount, mission.revision + 1)); setToast("Example plan revised. This is a preview; no browser workers ran."); }
      else { const revised = await api<MissionView>(`/api/missions/${mission.mission_id}/constraints`, { method: "PATCH", body: JSON.stringify({ expected_revision: mission.revision, purchase_budget_minor: amount }) }); setMission(revised); setToast("Budget updated. Uncommitted plans will be reviewed again."); }
      setModal(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't update the budget."); }
    finally { setBusy(false); }
  }

  async function prepareRegistration() {
    if (!selectedTask || busy) return;
    setBusy(true); setError(null);
    try {
      const next = await api<MissionView>(`/api/tasks/${encodeURIComponent(selectedTask.id)}/prepare-registration`, { method: "POST", body: JSON.stringify({ expected_revision: mission.revision }) });
      setMission(next);
      setToast(next.tasks.find(task => task.id === selectedTask.id)?.proposal?.action_type === "free_registration" ? "Free RSVP prepared. Review the pinned attendee and event before approving." : "Preparation returned a handoff. Review the worker’s blocker before continuing.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not prepare the RSVP. No registration is confirmed."); }
    finally { setBusy(false); }
  }

  async function taskAction(action: "approve" | "reject" | "resume") {
    if (!selectedTask?.proposal || preview) return;
    setBusy(true); setError(null);
    try {
      const proposal = selectedTask.proposal;
      const passkey = action === "approve" && mission.mode === "live" ? await confirmProposalWithPasskey(selectedTask.id, proposal.id, proposal.revision) : undefined;
      const next = await api<MissionView>(`/api/tasks/${selectedTask.id}/${action}`, { method: "POST", body: JSON.stringify({ proposal_id: proposal.id, revision: proposal.revision, ...(passkey ? { passkey } : {}) }) });
      setMission(next);
      setToast(action === "approve" ? selectedTask.proposal.action_type === "free_registration" ? "Free RSVP approved. Review the pinned details, then choose Register now." : "Plan decision saved. Payment approval may still be required." : action === "reject" ? "Plan declined. No new purchase was authorized." : "Approval checked. Worker status is updating.");
    } catch (cause) { setError(passkeyError(cause)); }
    finally { setBusy(false); }
  }

  function selectMission(next: MissionView) {
    landing.current = null; setLinkedRevision(null); setMissionError(null); setSavedMissionId(null); setPaymentError(null);
    setMission(next); setSelectedTaskId(null); setModal(null);
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ mission: next.mission_id }).toString();
    window.history.replaceState(null, "", url);
  }

  async function openHistory() {
    if (!authenticated) { open("auth"); return; }
    open("history"); setBusy(true);
    try { setHistory((await api<{ missions: MissionView[] }>("/api/missions")).missions); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't load past missions."); }
    finally { setBusy(false); }
  }

  async function copyDashboard() {
    if (!mission.dashboard_url) return;
    try { await navigator.clipboard.writeText(mission.dashboard_url); setToast("Dashboard link copied. Manager sign-in is required."); }
    catch { setToast("Copy is unavailable. Your agent result includes the dashboard link."); }
  }

  async function copyResult() {
    try { await navigator.clipboard.writeText(JSON.stringify(mission, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError("Copy isn't available in this browser. Select the result text below."); }
  }

  const proposedOver = Math.max(0, mission.budget.proposed_minor + mission.budget.committed_minor + mission.budget.uncertain_minor - mission.budget.limit_minor);
  const unallocated = Math.max(0, mission.budget.limit_minor - mission.budget.proposed_minor - mission.budget.committed_minor - mission.budget.uncertain_minor);
  const reviewedCount = mission.tasks.filter(task => task.approval?.state === "approved" || task.status === "confirmed").length;
  const needsReview = mission.tasks.filter(task => task.proposal && task.approval?.state !== "approved" && task.status !== "confirmed").length;
  const workingCount = mission.tasks.filter(task => task.status === "researching" || task.status === "executing").length;

  return <div className="app-shell">
    <aside className="sidebar">
      <a href="/" className="brand" aria-label="Cue home"><CueMark/><span className="brand-wordmark">cue</span></a>
      <div className="workspace-picker"><span className="workspace-icon">S</span><span><strong>Studio workspace</strong><small>Your work, in good hands</small></span></div>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="Main navigation">
        <button className="nav-item active" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}><Icon name="grid"/>Mission desk<span className="nav-count">1</span></button>
        <button className="nav-item" onClick={() => document.getElementById("activity")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" })}><Icon name="activity"/>Activity</button>
        <button className="nav-item" onClick={() => void openHistory()}><Icon name="clock"/>Past missions</button>
        <button className="nav-item" onClick={() => open("connect")}><Icon name="code"/>Connect your agent<Icon name="external" size={12}/></button>
      </nav>
      <div className="sidebar-note"><div className="note-symbol"><Icon name="spark" size={21}/></div><p>A brief from your agent.<br/>A team to get it done.</p><span>{mission.tasks.length} workers. One shared plan.</span></div>
      <div className="sidebar-bottom">
        <button className="nav-item" onClick={() => { if (authenticated) void refreshServices(); open("connections"); }}><Icon name="link"/>Connections<span className={`connection-dot ${services.length && services.every(service => service.ready) ? "connected" : ""}`}/></button>
        <button className="nav-item" onClick={() => open(authenticated ? "profile" : "auth")} aria-label="Saved profile"><Icon name="people"/>Saved profile</button>
        <button className="profile" onClick={() => authenticated ? open("profile") : open("auth")}><span className="avatar">{authenticated ? "M" : "G"}</span><span><strong>{authenticated ? "Manager" : "Guest preview"}</strong><small>{authenticated ? "Workspace access" : "Connect to start a mission"}</small></span><Icon name="chevron" size={14}/></button>
      </div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>Mission desk</strong></div><div className="topbar-right"><span className="today">SAT, OCT 03</span><span className={`environment-pill ${mission.mode === "live" ? "live" : ""}`}><span/>{preview ? "Preview workspace" : mission.mode === "live" ? "Live mission" : `${mission.mode === "fixture" ? "Example" : mission.mode} mission`}</span></div></header>

      <main>
        <CinematicHero onNewMission={() => open(authenticated ? "new" : "auth")} onConnect={() => open("connect")}/>

        <ul className="capability-strip" aria-label="What Cue helps with">
          <li className="capability capability-hiring"><Icon name="people" size={20}/><div><strong>Hiring</strong><span>Talent &amp; services</span></div></li>
          <li className="capability capability-logistics"><Icon name="box" size={20}/><div><strong>Logistics</strong><span>Purchases &amp; delivery</span></div></li>
          <li className="capability capability-food"><Icon name="spark" size={20}/><div><strong>Food &amp; supplies</strong><span>Meals &amp; pickup options</span></div></li>
          <li className="capability capability-travel"><Icon name="ticket" size={20}/><div><strong>Travel</strong><span>Events &amp; tickets</span></div></li>
        </ul>

        {missionError && <div className="inline-notice error" role="alert"><Icon name="warning" size={17}/>{missionError}{savedMissionId && <button className="button secondary" disabled={busy} onClick={() => void reopenSavedMission()}>Reopen saved mission</button>}</div>}
        {linkedRevision !== null && !preview && linkedRevision !== mission.revision && <div className="inline-notice" role="status"><Icon name="warning" size={17}/>This link was for revision {linkedRevision}. You’re reviewing the current plan, revision {mission.revision}.</div>}
        {landing.current && preview && !authenticated && <div className="inline-notice"><Icon name="shield" size={17}/>Sign in to view the mission your agent shared.</div>}

        <section className="mission-brief" aria-labelledby="mission-title">
          <div className="mission-heading"><div className="mission-symbol"><Icon name="spark" size={22}/></div><div><div className="brief-eyebrow">{preview ? "EXAMPLE MISSION" : "CURRENT MISSION"}<span>REV {String(mission.revision).padStart(2, "0")}</span></div><h2 id="mission-title">{/\bexpo\b/i.test(mission.objective) ? "Get the team expo-ready." : "Your mission, in motion."}</h2></div><span className="mission-status"><span className={workingCount > 0 ? "pulse" : ""}/>{mission.mode === "live" && mission.service_payment.status !== "paid" ? "Awaiting service payment" : mission.status === "completed" ? "Mission complete" : workingCount ? `${workingCount} workers active` : mission.status === "needs_attention" ? "Needs your attention" : needsReview ? "Ready for your review" : "In progress"}</span></div>
          <p className="mission-objective">{mission.objective}</p>
          <div className="mission-facts"><span><Icon name="people" size={15}/>{mission.headcount} teammates</span><span><Icon name="clock" size={15}/>By {readableDate(mission.deadline)}</span><span><Icon name="shield" size={15}/>You approve every commitment</span>{!preview && mission.dashboard_url && <button onClick={() => void copyDashboard()}><Icon name="link" size={14}/>Copy dashboard link</button>}<button onClick={() => { setBudget(String(mission.budget.limit_minor / 100)); open("budget"); }}><Icon name="sliders" size={14}/>Edit constraints</button></div>
        </section>

        {!preview && mission.mode === "live" && <section className="service-payment-panel" aria-labelledby="service-payment-title">
          <div><span className="eyebrow">SEPARATE SERVICE FEE · {mission.service_payment.mode === "test" ? "STRIPE TEST MODE" : "PAYMENT STATUS"}</span>
            <h3 id="service-payment-title">{mission.service_payment.status === "paid" ? "Service payment verified" : mission.service_payment.status === "pending" ? "Payment needs reconciliation" : "Your mission is saved. Ready to start?"}</h3>
            <p>{mission.service_payment.status === "paid" ? `${money(mission.service_payment.amount_minor)} service fee verified${mission.service_payment.mode === "test" ? " in test mode. Zero real funds were charged" : ""}. This is not a merchant payment, order or RSVP confirmation.` : mission.service_payment.status === "pending" ? "A payment attempt is pending. Check payment to reconcile the existing attempt and continue this saved mission. The server must verify it before workers start." : "Start research with a developer-supplied Stripe sandbox payment. Zero real funds. This does not use your real wallet or pay any merchant."}</p>
            {mission.service_payment.status === "paid" && mission.service_payment.reference && <p className="service-payment-reference">Service receipt reference: <code>{mission.service_payment.reference}</code></p>}
            {paymentError && <p className="form-error" role="alert">{paymentError}</p>}
          </div>
          {mission.service_payment.status !== "paid" && <div className="service-payment-actions">
            <button className="button primary" disabled={busy || !authenticated} onClick={() => void servicePayment()}>{busy ? "Checking payment…" : mission.service_payment.status === "pending" ? "Check payment & continue" : `Pay ${money(mission.service_payment.amount_minor)} in test mode & start`}</button>
            <button className="button secondary" disabled={busy || !authenticated} onClick={() => void servicePayment(true)}>Check saved status</button>
          </div>}
        </section>}

        {!online && <div className="inline-notice error"><Icon name="warning" size={17}/>Updates paused. Showing the last saved mission state.</div>}
        {preview && <div className="preview-notice"><span className="preview-badge">PREVIEW</span><span>A look at how a mission comes together. These are example plans; no workers have run or purchases been made.</span></div>}

        <div className="desk-grid">
          <div className="work-column">
            <div className="section-heading"><h3>Your workers <span>{String(mission.tasks.length).padStart(2, "0")}</span></h3><div className="parallel-label"><span className="parallel-lines">≋</span>Working together, in parallel</div></div>
            <section className={`worker-grid${mission.tasks.length > 3 ? " worker-grid-many" : ""}`} aria-label="Browser workers" onPointerMove={event => {
              if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
              const card = (event.target as HTMLElement).closest<HTMLElement>(".worker-card");
              if (!card) return;
              const bounds = card.getBoundingClientRect();
              card.style.setProperty("--spot-x", `${event.clientX - bounds.left}px`);
              card.style.setProperty("--spot-y", `${event.clientY - bounds.top}px`);
            }}>
              {mission.tasks.map(task => {
                const meta = laneMeta[task.lane]; const option = task.options.find(item => item.id === task.proposal?.option_id) ?? task.options[0];
                return <article className={`worker-card lane-${task.lane}`} data-running={!preview && (task.status === "researching" || task.status === "executing")} key={task.id}>
                  <div className="worker-card-top"><span className={`merchant-icon ${task.lane}`}><Icon name={meta.icon} size={21}/></span><div><h4>{meta.label}</h4><span>{option?.merchant ?? meta.domain}</span></div><span className="worker-number">{meta.number}</span></div>
                  <WorkerArt lane={task.lane}/>
                  <div className="worker-content"><div className="worker-intent">{task.title}</div><h5>{option?.title ?? (task.blocker ? "A quick handoff" : task.status === "queued" ? "Ready when you are" : "Finding the right fit")}</h5><p className="option-description">{option?.description ?? task.progress}</p><div className="option-meta"><span>{task.lane === "event_tickets" ? `${task.proposal?.quantity ?? mission.headcount} passes` : task.lane === "fiverr" ? "One clear brief" : task.lane === "food" ? "Menu price estimate" : "Purchases & delivery"}</span><strong>{task.proposal ? money(task.proposal.total_minor) : option && option.amount_minor > 0 ? money(option.amount_minor) : "—"}{task.proposal && <small> total</small>}</strong></div><div className={`task-progress ${task.status}`}><span className="status-dot"/><span>{preview ? "Example plan" : statusText[task.status]}</span>{task.evidence.length > 0 && <button aria-label={`View ${meta.label} evidence`} onClick={() => inspectTask(task)}>{task.evidence.length} {task.evidence.length === 1 ? "source" : "sources"}<Icon name="external" size={10}/></button>}</div></div>
                  <button className="worker-action" onClick={() => inspectTask(task)}>{task.status === "confirmed" ? "View confirmation" : task.blocker ? "View handoff" : task.approval?.state === "approved" ? "View approved plan" : task.proposal ? "Review plan" : "View worker"}<Icon name="arrow" size={16}/></button>
                </article>;
              })}
            </section>

            <section className="activity-panel" id="activity"><div className="section-heading"><h3>The moving pieces</h3><span className="subtle-label">{preview ? "HOW IT WORKS" : "MISSION ACTIVITY"}</span></div><div className="activity-list">{mission.activity.slice(-3).map((item, index) => <div className="activity-item" key={item.id}><span className={`activity-icon ${item.kind}`}><Icon name={item.kind === "approval" ? "shield" : item.kind === "decision" ? "spark" : item.kind === "warning" ? "warning" : item.kind === "success" ? "check" : "activity"} size={14}/></span><p>{item.text}</p><time>{preview ? `0${index + 1}` : new Date(item.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })}</time></div>)}</div></section>
          </div>

          <aside className="mission-aside">
            <section className="budget-panel"><div className="budget-heading"><h3>One shared budget</h3><button aria-label="Edit purchase budget" className="icon-button" onClick={() => { setBudget("650"); open("budget"); }}><Icon name="sliders" size={16}/></button></div><div className="budget-total">{money(mission.budget.limit_minor)}<span>USD</span></div><p className="budget-caption">For the whole mission.</p><div className="budget-chart" aria-label={`Proposed plan ${money(mission.budget.proposed_minor)} of ${money(mission.budget.limit_minor)}`}>{mission.tasks.map(task => <span className={task.lane} key={task.id} style={{ width: `${Math.min(100, ((task.proposal?.total_minor ?? 0) / Math.max(1, mission.budget.limit_minor)) * 100)}%` }}/>)}</div><div className="budget-lanes">{mission.tasks.map(task => <div key={task.id}><span><i className={task.lane}/>{laneMeta[task.lane].label}</span><strong>{task.proposal ? money(task.proposal.total_minor) : "—"}</strong></div>)}</div><div className="budget-divider"/><dl className="budget-breakdown"><div><dt>Proposed plan</dt><dd>{money(mission.budget.proposed_minor)}</dd></div><div><dt>Reserved</dt><dd>{money(mission.budget.reserved_minor)}</dd></div><div><dt>Committed</dt><dd>{money(mission.budget.committed_minor)}</dd></div>{mission.budget.uncertain_minor > 0 && <div className="uncertain"><dt>Awaiting confirmation</dt><dd>{money(mission.budget.uncertain_minor)}</dd></div>}<div className={`budget-remaining ${proposedOver ? "over-budget" : ""}`}><dt>{proposedOver ? "Over budget by" : "Room in the plan"}</dt><dd>{money(proposedOver || unallocated)}</dd></div></dl><button className="button budget-edit" onClick={() => { setBudget("650"); open("budget"); }}><Icon name="sliders" size={15}/>Adjust the budget<Icon name="arrow" size={14}/></button><p className="budget-footnote">Plans reserve funds only after approval. {money(mission.budget.available_minor)} currently available.</p></section>
            <section className="control-note"><span className="control-icon"><Icon name="shield" size={19}/></span><h3>You're still in control.</h3><p>Workers find the fit. You review the details before anything is ordered, hired, or booked.</p><div className="approval-progress"><span>{reviewedCount} of {mission.tasks.length} plans approved</span><div>{mission.tasks.map((_, i) => <i key={i} className={i < reviewedCount ? "filled" : ""}/>)}</div></div></section>
            <button className="handoff-card" onClick={() => open("result")}><span className="handoff-icon"><Icon name="code" size={20}/></span><span><strong>Built for your agent</strong><small>Structured results, ready to use</small></span><Icon name="arrow" size={16}/></button>
          </aside>
        </div>

        {mission.blockers.length > 0 && <section className="blocker-panel"><Icon name="warning" size={20}/><div><h3>A few things need your attention</h3>{mission.blockers.map((blocker, index) => <p key={index}>{blocker}</p>)}</div></section>}
        <footer className="workspace-footer"><span><span className="tiny-brand">◒</span> Made for the work between the work.</span><span>Service fee {money(mission.service_payment.amount_minor)} · {mission.service_payment.status === "paid" ? `${mission.service_payment.mode === "test" ? "test payment" : "paid"}` : mission.service_payment.status === "waived_fixture" ? "waived for example run" : mission.service_payment.status === "not_configured" ? "payment setup pending" : mission.service_payment.status.replaceAll("_", " ")}</span></footer>
      </main>
    </div>

    {modal === "auth" && <Modal title="Connect your workspace" onClose={close}><p className="modal-description">Use your manager access key to start missions and review commitments.</p><form onSubmit={signIn}><label className="field">Manager access key<input type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} placeholder="Enter your workspace key" required autoFocus/></label><p className="field-hint">Your access key stays private. It isn't included in a mission or sent to a worker.</p>{error && <p className="form-error" role="alert">{error}</p>}<button type="submit" className="button primary full" disabled={busy || !token.trim()}>{busy ? "Connecting…" : "Connect workspace"}<Icon name="arrow" size={16}/></button></form></Modal>}

    {modal === "new" && <Modal title="What needs doing?" onClose={close} wide><p className="modal-description">One brief for your workers. Set the boundaries, then let them find a plan.</p><form onSubmit={createMission}><label className="field">The brief<textarea value={draft.objective} onChange={event => setDraft({ ...draft, objective: event.target.value })} rows={3} required/></label><VoiceBrief onBusyChange={setVoiceBusy} onApply={voice => setDraft(previous => ({ ...previous, objective: voice.objective, ...(voice.purchase_budget_minor !== null ? { purchase_budget_minor: voice.purchase_budget_minor } : {}), requirements: { ...previous.requirements, ...(voice.food ? { food: voice.food } : {}) } }))}/><div className="form-row"><label className="field">Purchase budget · USD<input type="number" min="1" step="0.01" value={draft.purchase_budget_minor / 100} onChange={event => setDraft({ ...draft, purchase_budget_minor: Math.round(Number(event.target.value) * 100) })} required/></label><label className="field">Team size<input type="number" min="1" max="50" value={draft.headcount} onChange={event => setDraft({ ...draft, headcount: Number(event.target.value) })} required/></label></div><label className="field">Event page URL<input type="url" value={draft.requirements.event_tickets.event_url} placeholder="https://eventbrite.com/e/your-event" onChange={event => setDraft({ ...draft, requirements: { ...draft.requirements, event_tickets: { ...draft.requirements.event_tickets, event_url: event.target.value } } })} required={createMode === "live"}/></label><div className="form-row"><label className="field">Supplies to find<input value={draft.requirements.amazon.category} onChange={event => setDraft({ ...draft, requirements: { ...draft.requirements, amazon: { ...draft.requirements.amazon, category: event.target.value } } })} required/></label><label className="field">Needed by<input type="date" value={draft.deadline.slice(0, 10)} onChange={event => setDraft({ ...draft, deadline: `${event.target.value}T09:00:00-07:00`, requirements: { ...draft.requirements, event_tickets: { ...draft.requirements.event_tickets, date: `${event.target.value}T09:00:00-07:00` } } })} required/></label></div><FoodMissionFields value={draft.requirements.food} onChange={food => setDraft({ ...draft, requirements: { ...draft.requirements, food } })}/><div className="mode-picker" role="group" aria-label="Mission mode"><button type="button" className={createMode === "fixture" ? "selected" : ""} onClick={() => setCreateMode("fixture")}><strong>Example run</strong><span>Explore the flow with labeled fixtures</span></button><button type="button" className={createMode === "live" ? "selected" : ""} onClick={() => setCreateMode("live")}><strong>Live workers</strong><span>Research the actual sites</span></button></div><p className="field-hint">{createMode === "fixture" ? "Example data only. No actual site activity or purchases." : "Research does not purchase anything. Every commitment requires your review."} The service fee is separate from your purchase budget.</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full" type="submit" disabled={busy || voiceBusy}>{busy ? "Starting mission…" : createMode === "fixture" ? "Start example mission" : "Send in the workers"}<Icon name="arrow" size={16}/></button></form></Modal>}

    {modal === "profile" && authenticated && <Modal title="Saved profile" onClose={close}><SavedProfile onProfileChange={setHasSavedProfile}/><PasskeyControl/></Modal>}

    {modal === "history" && <Modal title="The work so far" onClose={close} wide><p className="modal-description">Your workspace’s latest 20 missions, with their plans, evidence, and recorded receipts.</p>{busy ? <p className="field-hint">Loading past missions…</p> : history.length ? <div className="mission-history">{history.map(item => <button className="history-item" key={item.mission_id} onClick={() => selectMission(item)}><div><span className="mode-tag">{item.mode === "fixture" ? "EXAMPLE" : item.mode.toUpperCase()}</span><time>{readableDate(item.created_at)}</time></div><strong>{item.objective}</strong><span>{item.tasks.filter(task => task.status === "confirmed").length} of {item.tasks.length} confirmed · {item.tasks.filter(task => task.links?.receipt_state === "available").length} receipts <Icon name="arrow" size={16}/></span></button>)}</div> : <p className="field-hint">Your first mission will appear here once it’s saved.</p>}{error && <p className="form-error" role="alert">{error}</p>}</Modal>}

    {modal === "budget" && <Modal title="A change of plans?" onClose={close}><p className="modal-description">Give the workers a new spending limit. The team still needs {mission.headcount} event passes.</p><form onSubmit={reviseBudget}><label className="field">New purchase budget · USD<div className="money-input"><span>$</span><input type="number" value={budget} min="1" step="0.01" onChange={event => setBudget(event.target.value)} autoFocus required/></div></label><div className="budget-suggestion"><Icon name="spark" size={17}/><span>Try <button type="button" onClick={() => setBudget("650")}>$650</button> and keep all {mission.headcount} tickets.</span></div><p className="field-hint">Uncommitted plans will need fresh approval. Existing purchases and funds awaiting confirmation stay protected.{preview && " This updates the example only; no workers will run."}</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full" type="submit" disabled={busy}>{busy ? "Updating plan…" : preview ? "Revise example plan" : "Update budget & replan"}<Icon name="arrow" size={16}/></button></form></Modal>}

    {modal === "connections" && <Modal title="The team behind the work" onClose={close}><p className="modal-description">Live missions need a connected browser, shared workspace, and payment setup.</p><div className="connection-list">{services.length ? services.map(service => <div className="connection-row" key={service.service}><span className={`connection-service-icon ${service.ready ? "ready" : ""}`}><Icon name={service.ready ? "check" : "link"} size={18}/></span><div><strong>{service.service}</strong><p>{service.detail}</p></div><span className={service.ready ? "ready-label" : "pending-label"}>{service.ready ? "Ready" : "Pending"}</span></div>) : <div className="empty-state"><Icon name="link" size={28}/><h3>{authenticated ? "Connection status isn't available yet" : "Connect manager access first"}</h3><p>{authenticated ? "The workspace is being prepared. You can still explore the example mission." : "Your workspace connections are visible after you sign in."}</p></div>}</div>{!authenticated && <button className="button primary full" onClick={() => open("auth")}>Connect workspace<Icon name="arrow" size={16}/></button>}</Modal>}

    {modal === "connect" && <Modal title="Your agent. Our extra hands." onClose={close} wide><p className="modal-description">Send a brief from your agent, then get a structured result back. Choose the connection that fits your setup.</p><div className="connect-method"><div className="connect-method-title"><span className="connection-service-icon ready"><Icon name="code" size={19}/></span><div><h3>Command line</h3><p>From the oct3 repository · Node 24</p></div><span className="mode-tag">CLI</span></div><pre className="connection-code">{`npm run cli -- submit examples/expo.json --key expo-demo-001
npm run cli -- status <mission-id>
npm run cli -- list`}</pre><p className="field-hint">The example runs with labeled fixtures. Configure OCT3_AGENT_TOKEN privately in your environment. Use the same mission key when retrying a submission.</p></div><div className="connect-method"><div className="connect-method-title"><span className="connection-service-icon ready"><Icon name="link" size={19}/></span><div><h3>Model Context Protocol</h3><p>Connect a client that supports Streamable HTTP</p></div><span className="mode-tag">MCP</span></div><div className="endpoint-field"><span>Server URL</span><code>{typeof window !== "undefined" ? window.location.origin : ""}/api/mcp</code></div><p className="field-hint">Add an Authorization: Bearer header through your client's secret settings. Your agent can submit missions, check results, and list work. Spending decisions stay with you.</p><div className="mcp-tools"><code>submit_mission</code><code>mission_status</code><code>list_missions</code></div></div><button className="button secondary full" onClick={() => open("result")}>See an agent result<Icon name="arrow" size={16}/></button></Modal>}

    {modal === "result" && <Modal title="A useful answer for your agent" onClose={close} wide><p className="modal-description">One structured result: plans, actual outcomes, costs, evidence, and anything that still needs a hand.</p><div className="result-summary"><span className={`environment-pill ${mission.mode === "live" ? "live" : ""}`}><span/>{preview ? "Preview data" : `${mission.mode} data`}</span><span>{mission.tasks.length} workers · revision {mission.revision}</span><button className="text-button" onClick={copyResult}><Icon name={copied ? "check" : "copy"} size={15}/>{copied ? "Copied" : "Copy JSON"}</button></div><pre className="result-code" tabIndex={0}>{JSON.stringify(mission, null, 2)}</pre>{error && <p className="form-error" role="alert">{error}</p>}<p className="field-hint">{preview ? "This is an example response, not evidence of browser work or completed purchases." : "The caller can retrieve this result from the authenticated mission endpoint."}</p></Modal>}

    {modal === "task" && selectedTask && <Modal title={laneMeta[selectedTask.lane].role} onClose={close} wide><TaskDetail task={selectedTask} mission={mission} onPrepare={prepareRegistration} preview={preview} mode={mission.mode} busy={busy} onAction={taskAction}/>{error && <p className="form-error" role="alert">{error}</p>}</Modal>}
    {toast && <div className="toast" role="status"><Icon name="check" size={17}/><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)}><Icon name="close" size={15}/></button></div>}
  </div>;
}

function TaskDetail({ task, mission, onPrepare, preview, mode, busy, onAction }: { task: Task; mission: MissionView; onPrepare: () => Promise<void>; preview: boolean; mode: MissionView["mode"]; busy: boolean; onAction: (action: "approve" | "reject" | "resume") => Promise<void> }) {
  const [passkeyReady, setPasskeyReady] = useState(false);
  const proposal = task.proposal;
  const freeRegistration = proposal?.action_type === "free_registration";
  const knownEvent = [proposal?.source_url, task.links?.preview_url, ...task.options.map(option => option.source_url), ...task.evidence.map(item => item.source_url)].includes(FREE_REGISTRATION_EVENT_URL);
  const canPrepare = !preview && mode === "live" && mission.service_payment.status === "paid" && task.lane === "event_tickets" && mission.headcount === 1 && knownEvent && !["researching", "executing", "confirmed"].includes(task.status) && !(freeRegistration && task.status === "needs_human") && mission.budget.uncertain_minor === 0;
  const providerPreview = safeUrl(task.links?.preview_url ?? (preview ? proposal?.source_url ?? task.options[0]?.source_url : undefined));
  return <div className="task-detail"><div className="detail-title"><span className={`merchant-icon ${task.lane}`}><Icon name={laneMeta[task.lane].icon} size={23}/></span><div><span className="eyebrow">{laneMeta[task.lane].label.toUpperCase()}</span><h3>{proposal?.title ?? task.title}</h3></div></div><div className="detail-status"><span className={`status-dot ${task.status}`}/>{preview ? "Example plan — not researched or purchased" : statusText[task.status]}<span className="mode-tag">{mode === "fixture" ? "EXAMPLE DATA" : mode.toUpperCase()}</span></div><p className="modal-description">{task.progress}</p>
    <div className="review-links">
      {providerPreview && <a className="button secondary" href={providerPreview} target="_blank" rel="noopener noreferrer">{preview ? "Example provider page" : task.links?.preview_kind === "checkout_preview" ? "Preview checkout" : "View provider page"}<Icon name="external" size={15}/></a>}
      {safeUrl(task.links?.confirmation_url ?? undefined) && <a className="button secondary" href={task.links!.confirmation_url!} target="_blank" rel="noopener noreferrer">View confirmation<Icon name="external" size={15}/></a>}
      {safeUrl(task.links?.receipt_url ?? undefined) && <a className="button primary" href={task.links!.receipt_url!} target="_blank" rel="noopener noreferrer">Open receipt<Icon name="external" size={15}/></a>}
    </div>
    {task.lane === "food" && <p className="field-hint food-research-note">Food research only. Menu prices are estimates, and checkout totals and availability are not verified. Opening a menu does not place an order.</p>}
    {providerPreview && task.status !== "confirmed" && <p className="field-hint">{task.links?.preview_kind === "checkout_preview" ? "Review the prepared checkout and exact plan before approving." : "This opens the provider page. It is not a confirmed order or a prepared checkout."} The provider may ask you to sign in.</p>}
    {task.status === "confirmed" && !task.links?.receipt_url && <p className="field-hint">{mode !== "live" ? "Example outcome. No real merchant receipt exists." : "A merchant receipt link has not been captured yet."}</p>}
    {task.blocker && <div className="inline-notice error"><Icon name="warning" size={18}/><span>{task.blocker}</span></div>}
    {canPrepare && <div className="registration-prepare"><button className="button secondary full" disabled={busy} onClick={() => void onPrepare()}>{busy ? "Preparing free RSVP…" : "Prepare free RSVP"}</button><p className="field-hint">Read-only preparation for one free ticket at OpenTogether. No attendee fields are filled and no registration is submitted.</p></div>}
    {!preview && mode === "live" && proposal && task.status !== "confirmed" && task.approval?.state !== "approved" && <PasskeyControl onReady={setPasskeyReady} disabled={busy}/>}
    {freeRegistration && task.status !== "confirmed" && <FreeRegistrationReview key={proposal!.id} task={task} busy={busy} onAction={onAction} passkeyRequired={!preview && mode === "live"} passkeyReady={passkeyReady}/>}
    {proposal && <><div className="proposal-details"><div><span>Merchant</span><strong>{proposal.merchant}</strong></div><div><span>Quantity</span><strong>{proposal.quantity}</strong></div><div><span>For</span><strong>{proposal.recipient_ref.replaceAll("-", " ")}</strong></div><div><span>Needed by</span><strong>{readableDateTime(proposal.deadline)}</strong></div></div><dl className="approval-costs"><div><dt>Items / service</dt><dd>{money(proposal.subtotal_minor)}</dd></div><div><dt>Tax</dt><dd>{money(proposal.tax_minor)}</dd></div><div><dt>Shipping</dt><dd>{money(proposal.shipping_minor)}</dd></div><div><dt>Provider fees</dt><dd>{money(proposal.fees_minor)}</dd></div><div className="approval-total"><dt>Exact amount to approve</dt><dd>{money(proposal.total_minor)} <small>USD</small></dd></div></dl><div className="approval-binding"><Icon name="shield" size={16}/><span>Approval applies to this item, recipient, quantity, deadline, and exact total in revision {proposal.revision}. Changes need a new decision. Review expires {readableDateTime(proposal.expires_at)}.</span></div></>}
    {!proposal && task.options.length > 0 && <div className="research-options"><div className="evidence-heading"><h4>Options to consider</h4><span>{task.options.length} found</span></div>{task.options.map(option => <div className="research-option" key={option.id}><div><h4>{option.title}</h4><strong>{option.amount_minor > 0 ? money(option.amount_minor) : "Price to confirm"}</strong></div><p>{option.description}</p><p>{option.reason}</p>{safeUrl(option.source_url) && <a href={safeUrl(option.source_url)} target="_blank" rel="noopener noreferrer">View option<Icon name="external" size={12}/></a>}</div>)}<p className="field-hint">These are research results. A final checkout total and exact plan are needed before a purchase can be approved.</p></div>}
    {task.confirmation_ref && <div className="confirmation"><Icon name="check"/><div><strong>Provider confirmation</strong><code>{task.confirmation_ref}</code></div></div>}
    <div className="evidence-heading"><h4>{preview ? "About this example" : "What the worker found"}</h4><span>{task.evidence.length} {task.evidence.length === 1 ? "source" : "sources"}</span></div><div className="evidence-list">{task.evidence.length ? task.evidence.map(evidence => <div className="evidence-item" key={evidence.id}><div><strong>{evidence.title}</strong><span className="mode-tag">{evidence.mode === "fixture" ? "EXAMPLE" : evidence.mode.toUpperCase()}</span></div><p>{evidence.detail}</p>{safeUrl(evidence.source_url) && <a href={safeUrl(evidence.source_url)} target="_blank" rel="noopener noreferrer">{preview ? "Visit provider" : "Open source"}<Icon name="external" size={12}/></a>}<time>{new Date(evidence.observed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })} PT</time></div>) : <p className="field-hint">Evidence will appear here as the worker makes progress.</p>}</div>
    {proposal && !freeRegistration && task.status !== "confirmed" && <div className="approval-actions">{preview ? <p className="preview-approval"><Icon name="shield" size={17}/>Example plans can't authorize a purchase. Start a mission to review real work.</p> : task.approval?.state === "approved" ? <><div className="approved-status"><Icon name="check" size={18}/><span>Plan approved{task.approval.link_state ? ` · Payment ${task.approval.link_state.replaceAll("_", " ")}` : ""}</span></div>{safeUrl(task.approval.link_approval_url) && <a href={safeUrl(task.approval.link_approval_url)} className="button primary full" target="_blank" rel="noopener noreferrer">Review payment with Link<Icon name="external" size={16}/></a>}<button className="button secondary full" disabled={busy || task.status === "executing"} onClick={() => void onAction("resume")}>{busy ? "Checking…" : task.status === "executing" ? "Worker is executing" : "Check approval & continue"}<Icon name="arrow" size={16}/></button></> : <><p className="field-hint">{mode === "fixture" ? "This example approval only updates fixture state. It cannot purchase, hire, or book anything." : "Approving reserves this amount. A separate payment approval may be needed before the worker can commit."}</p><div className="action-row"><button className="button secondary" disabled={busy} onClick={() => void onAction("reject")}>Decline plan</button><button className="button primary" disabled={busy || task.approval?.state === "rejected" || (mode === "live" && !passkeyReady)} onClick={() => void onAction("approve")}>{busy ? "Confirming…" : task.approval?.state === "rejected" ? "Plan declined" : `${mode === "fixture" ? "Approve example" : "Confirm with passkey"} · ${money(proposal.total_minor)}`}<Icon name="check" size={16}/></button></div></>}</div>}
  </div>;
}
