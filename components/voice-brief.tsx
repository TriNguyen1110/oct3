"use client";

import { useEffect, useRef, useState } from "react";
import type { MissionInput } from "@/src/shared/contracts";
import { recordingToWav } from "@/src/client/voice-audio";

export interface VoiceDraft {
  transcript: string; objective: string; purchase_budget_minor: number | null;
  food: NonNullable<MissionInput["requirements"]["food"]> | null;
  notes: string[]; model: "gemini-3.8-flash"; draft_only: true;
}
type Phase = "idle" | "requesting" | "recording" | "processing" | "ready" | "error";

function validateDraft(value: unknown): VoiceDraft {
  const draft = value as Partial<VoiceDraft> | null;
  if (!draft || draft.draft_only !== true || draft.model !== "gemini-3.8-flash" || typeof draft.transcript !== "string" || !draft.transcript.trim() || draft.transcript.length > 12000 || typeof draft.objective !== "string" || !draft.objective.trim() || draft.objective.length > 12000 || !Array.isArray(draft.notes) || !draft.notes.every(note => typeof note === "string")) throw new Error("The voice draft could not be verified. Please try again or type your brief.");
  if (draft.purchase_budget_minor !== null && (!Number.isSafeInteger(draft.purchase_budget_minor) || draft.purchase_budget_minor! <= 0)) throw new Error("The suggested budget was not valid. Please type your brief.");
  if (draft.food !== null && (!draft.food || typeof draft.food.query !== "string" || !draft.food.query.trim() || typeof draft.food.location !== "string" || !draft.food.location.trim() || !["pickup", "delivery"].includes(draft.food.fulfillment) || !Number.isInteger(draft.food.quantity) || draft.food.quantity < 1 || draft.food.quantity > 50)) throw new Error("The suggested food request was incomplete. Please type your brief.");
  return draft as VoiceDraft;
}

export function VoiceBrief({ onApply, onBusyChange }: { onApply: (draft: VoiceDraft) => void; onBusyChange: (busy: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const [applied, setApplied] = useState(false);
  const generation = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const request = useRef<AbortController | null>(null);

  function clearRecording() {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (clockTimer.current) clearInterval(clockTimer.current);
    stopTimer.current = null; clockTimer.current = null;
    const current = recorder.current; recorder.current = null;
    if (current && current.state !== "inactive") current.stop();
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
  }
  function cancel() {
    generation.current++; clearRecording(); request.current?.abort(); request.current = null;
    setPhase("idle"); setError(null); setDraft(null); setSeconds(0); setApplied(false); onBusyChange(false);
  }
  useEffect(() => () => { generation.current++; clearRecording(); request.current?.abort(); onBusyChange(false); }, [onBusyChange]);

  async function processRecording(audio: Blob, currentGeneration: number) {
    if (generation.current !== currentGeneration) return;
    setPhase("processing");
    const controller = new AbortController(); request.current = controller;
    let expired = false;
    const timeout = setTimeout(() => { expired = true; controller.abort(); }, 35_000);
    try {
      const wav = await recordingToWav(audio);
      if (generation.current !== currentGeneration) return;
      if (expired) throw new Error("Audio processing took too long. Try a shorter brief, or type it.");
      const body = new FormData(); body.append("audio", wav, "voice-brief.wav");
      const response = await fetch("/api/voice/draft", { method: "POST", body, credentials: "same-origin", signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof payload?.error?.message === "string" ? payload.error.message : "Voice drafting is unavailable. You can still type your brief.");
      const next = validateDraft(payload);
      if (generation.current !== currentGeneration) return;
      setDraft(next); setPhase("ready");
    } catch (cause) {
      if (generation.current !== currentGeneration) return;
      setError(expired ? "Voice drafting timed out. Try again, or type your brief." : cause instanceof Error ? cause.message : "Couldn’t create a voice draft. You can still type your brief."); setPhase("error");
    } finally {
      clearTimeout(timeout);
      if (generation.current === currentGeneration) { request.current = null; onBusyChange(false); }
    }
  }

  async function start() {
    if (["requesting", "recording", "processing"].includes(phase)) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("Voice recording isn’t available in this browser. You can still type your brief."); setPhase("error"); return; }
    const currentGeneration = ++generation.current;
    setDraft(null); setError(null); setApplied(false); setSeconds(0); setPhase("requesting"); onBusyChange(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true }, video: false });
      if (generation.current !== currentGeneration) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const format = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(type => MediaRecorder.isTypeSupported(type));
      const current = new MediaRecorder(media, format ? { mimeType: format } : undefined);
      recorder.current = current;
      const chunks: Blob[] = [];
      current.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      current.onstop = () => { if (generation.current !== currentGeneration) return; clearRecording(); void processRecording(new Blob(chunks, { type: current.mimeType }), currentGeneration); };
      current.onerror = () => {
        if (generation.current !== currentGeneration) return;
        generation.current++; clearRecording(); setPhase("error"); setError("The microphone stopped unexpectedly. Try again, or type your brief."); onBusyChange(false);
      };
      current.start(250); setPhase("recording");
      const startedAt = Date.now();
      clockTimer.current = setInterval(() => setSeconds(Math.min(20, Math.floor((Date.now() - startedAt) / 1000))), 250);
      stopTimer.current = setTimeout(() => clearRecording(), 20_000);
    } catch (cause) {
      if (generation.current !== currentGeneration) return;
      clearRecording(); setPhase("error"); onBusyChange(false);
      const name = cause instanceof Error ? cause.name : "";
      setError(name === "NotAllowedError" ? "Microphone access wasn’t granted. Allow it to record, or keep typing your brief." : name === "NotFoundError" ? "No microphone was found. You can still type your brief." : "Couldn’t start recording. Try again, or type your brief.");
    }
  }

  const active = ["requesting", "recording", "processing"].includes(phase);
  return <section className="voice-brief" aria-label="Voice brief">
    <div className="voice-heading"><span className={`voice-symbol ${phase === "recording" ? "is-recording" : ""}`} aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg></span><div><strong>Say it. Then shape it.</strong><p>A short voice note becomes an editable draft.</p></div><span className="voice-limit">20 SEC MAX</span></div>
    <div className="voice-actions">{phase === "recording" ? <button type="button" className="button secondary" onClick={clearRecording}>Stop &amp; draft</button> : <button type="button" className="button secondary" disabled={active} onClick={() => void start()}>{phase === "requesting" ? "Waiting for microphone…" : phase === "processing" ? "Creating your draft…" : draft || phase === "error" ? "Record again" : "Record a brief"}</button>}{(active || draft) && <button type="button" className="text-button" onClick={cancel}>{draft ? "Discard voice draft" : "Cancel"}</button>}{phase === "recording" && <span className="voice-timer" aria-label={`${seconds} of 20 seconds recorded`}>{String(seconds).padStart(2, "0")} / 20s</span>}</div>
    <p className="voice-status" role="status">{phase === "recording" ? "Recording now. Stops automatically at 20 seconds." : phase === "requesting" ? "Choose whether to allow your microphone. Recording starts after permission." : phase === "processing" ? "Microphone is off. Gemini is preparing a draft for your review." : applied ? "Draft added to the form. Review every worker before sending." : "Audio goes to Gemini to draft your brief. Cue does not save recordings."}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {draft && <div className="voice-review"><div><span className="eyebrow">WHAT WE HEARD</span><p>{draft.transcript}</p></div><div><span className="eyebrow">SUGGESTED BRIEF</span><p>{draft.objective}</p></div><dl>{draft.purchase_budget_minor !== null && <div><dt>Purchase budget</dt><dd>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(draft.purchase_budget_minor / 100)}</dd></div>}{draft.food && <div><dt>Food request</dt><dd>{draft.food.quantity} × {draft.food.query} · {draft.food.fulfillment}<br/>{draft.food.location}</dd></div>}</dl>{draft.notes.length > 0 && <ul>{draft.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}<p className="field-hint">Review every worker before sending. This only updates the form; it does not start a mission or approve anything.</p><button type="button" className="button primary" disabled={applied} onClick={() => { onApply(draft); setApplied(true); }}>{applied ? "Added to your brief" : "Use this draft"}</button></div>}
  </section>;
}
