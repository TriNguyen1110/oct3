import { createHash } from "node:crypto";
import type { Evidence, Lane, Option } from "../shared/contracts";
import { collectCandidates, detectAccessBlocker, publicSourceUrl, researchUrl } from "./extract";
import { BrowserIssue, withSurfskyPage } from "./surfsky";
import { rankCandidates } from "./rank";
import { createComponentToolkit, type ComponentSnapshot } from "./components";
import type { ExecuteApprovedTaskInput, ExecuteApprovedTaskResult, ResearchTaskInput, ResearchTaskResult } from "./types";

export type * from "./types";
export { surfskyConfigured, surfskyHealth, verifyLaneStopped } from "./surfsky";
export { createComponentTools } from "./component-tools";
export { createComponentToolkit } from "./components";
export type { ComponentSnapshot, ComponentPolicy, TaskComponent } from "./components";
const merchant: Record<Lane, string> = { amazon: "Amazon", fiverr: "Fiverr", event_tickets: "event provider" };
function providerName(lane: Lane, source?: string): string {
  if (lane !== "event_tickets") return merchant[lane];
  if (!source) return "Eventbrite or Luma";
  const host = new URL(source).hostname.toLowerCase();
  return host === "luma.com" || host === "www.luma.com" || host === "lu.ma" || host === "www.lu.ma" ? "Luma" : "Eventbrite";
}
function id(...parts: string[]) { return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0,24); }
function evidence(input: ResearchTaskInput, source: string, title: string, detail: string, readOnly = false): Evidence {
  const at = new Date().toISOString();
  return { id: id(input.task_id,input.attempt_key,title,at), task_id: input.task_id, source_url: source, observed_at: at, title, detail: readOnly ? `Read-only observation (readOnly=true): ${detail}` : detail, mode: "live", ...(readOnly ? { kind: "observation" as const } : {}) };
}
async function progress(input: ResearchTaskInput, message: string) {
  await input.onProgress?.({ task_id: input.task_id, lane: input.lane, at: new Date().toISOString(), message });
}
function runSignal(input: ResearchTaskInput) {
  return AbortSignal.any([AbortSignal.timeout(Math.max(10_000,Math.min(input.timeout_ms ?? 90_000,120_000))), ...(input.signal ? [input.signal] : [])]);
}
export async function researchTask(input: ResearchTaskInput): Promise<ResearchTaskResult> {
  const started = Date.now();
  let source: string | undefined;
  const observations: Evidence[] = [];
  let inspection: ComponentSnapshot | undefined;
  try {
    if (input.connection_ref && input.connection_ref !== `oct3-${input.lane}`) throw new BrowserIssue("configuration", "The worker connection is not authorized for this lane.");
    source = researchUrl(input);
    const provider = providerName(input.lane, source);
    await progress(input, `Starting ${provider} research in its persistent Surfsky browser.`);
    const signal = runSignal(input);
    const run = await withSurfskyPage(input.lane, signal, async page => {
      const response = await page.goto(source!, { waitUntil: "domcontentloaded" });
      if (response && response.status() >= 400) throw new BrowserIssue("provider_error", `${provider} returned HTTP ${response.status()} before readable options were available.`);
      // Allow client-rendered marketplace cards; bounded, no forms or commitments.
      const selector = input.lane === "amazon" ? '[data-component-type="s-search-result"]' : input.lane === "fiverr" ? 'a[href*="/search/"]' : 'script[type="application/ld+json"]';
      await page.locator(selector).first().waitFor({state:"attached",timeout:5_000}).catch(() => {});
      await detectAccessBlocker(page);
      publicSourceUrl(page.url(), input.lane); // reject redirects outside the selected merchant
      const components=createComponentToolkit(page,{task_id:input.task_id,allowedOrigins:[new URL(page.url()).origin],readOnly:true,signal});
      const inspected=await components.inspectTaskPage();
      if(inspected.ok){
        inspection=inspected.snapshot;
        observations.push(evidence(input,source!,"Page components inspected",`Observed ${inspection.controls.length} supported preparatory controls; ${inspection.excluded_required_count} required controls excluded by policy. No fields were filled.`,true));
      }
      await progress(input, `${provider} loaded. Reading visible prices and source links.`);
      const candidates = await collectCandidates(page, input.lane, input);
      const deduped = [...new Map(candidates.filter(candidate => Number.isSafeInteger(candidate.amount_minor) && candidate.amount_minor >= 0 && candidate.available !== false).map(candidate => [candidate.source_url + ":" + candidate.amount_minor,candidate])).values()];
      if (deduped.length > 1) await progress(input,"Comparing observed options against the brief and shared budget.");
      const ranked = await rankCandidates(deduped,input,signal);
      if (signal.aborted) throw new BrowserIssue("cancelled", "Browser research was cancelled before its result was finalized.");
      const options: Option[] = ranked.candidates.map((candidate,index) => {
        const proof = evidence(input,candidate.source_url,candidate.title,`${candidate.price_text}. ${candidate.description}`,true);
        observations.push(proof);
        const reason = ranked.usedClaude ? "Claude selected this from observed merchant options for the brief and budget. Final scope and checkout total still need verification." : index===0?"Lowest displayed price among the observed options; checkout total and deadline still need verification.":"Alternative observed on the merchant page; compare scope and final total before approval.";
        return { id: id(input.task_id,candidate.source_url,String(candidate.amount_minor)), title:candidate.title, description:candidate.description, source_url:candidate.source_url, merchant:providerName(input.lane,candidate.source_url), amount_minor:candidate.amount_minor,currency:"USD",quantity:candidate.quantity,delivery_date:candidate.delivery_date,available:candidate.available,recommended:index===0,reason:input.lane === "event_tickets" ? `${reason} This read-only result does not claim a registration request or confirmed RSVP.` : reason,evidence_ids:[proof.id] };
      });
      if (!options.length) {
        observations.push(evidence(input,source!,`${provider} page inspected`,"The page was accessible, but no supported USD options with a grounded title, source and price could be extracted. No purchase or registration was attempted.",true));
        return {options,blocker:"No verifiable USD options were found in this page layout. Open the source for a manager handoff.",blocker_code:"no_options" as const};
      }
      return { options };
    });
    const message = run.value.options.length ? `Observed ${run.value.options.length} ${providerName(input.lane,source)} option${run.value.options.length === 1 ? "" : "s"}. Prices are research estimates, not checkout totals; event research does not confirm an RSVP.` : run.value.blocker!;
    await progress(input,message);
    return { ...run.value,...(inspection?{inspection}:{}),evidence:observations,progress:message,elapsed_ms:Date.now()-started,cleanup:run.cleanup,...(run.cleanup === "unconfirmed"?{blocker:"Browser cleanup could not be confirmed. Reconcile this worker session before another run.",blocker_code:"provider_error" as const}:{}) };
  } catch (error) {
    const issue = error instanceof BrowserIssue ? error : new BrowserIssue(input.signal?.aborted?"cancelled":"provider_error","The browser worker could not finish this read-only research run.");
    if (source) observations.push(evidence(input,source,`${providerName(input.lane,source)} research needs attention`,issue.message + " No order, message, registration or booking was submitted.",true));
    return {options:[],...(inspection?{inspection}:{}),evidence:observations,blocker:issue.message,blocker_code:issue.code,progress:issue.message,elapsed_ms:Date.now()-started,cleanup:issue.cleanup};
  }
}

/**
 * This first merchant adapter rechecks an approved source but makes no commitment.
 * Backend is the authorization boundary; this function additionally rejects stale
 * action proofs and cannot infer a merchant purchase from a Link authorization.
 */
export async function executeApprovedTask(input: ExecuteApprovedTaskInput): Promise<ExecuteApprovedTaskResult> {
  const {proposal,authorization}=input;
  const expiresAt = new Date(proposal.expires_at).getTime();
  if (!authorization.approved || authorization.proposal_id !== proposal.id || authorization.revision !== proposal.revision || proposal.task_id !== input.task_id || !authorization.reservation_id || authorization.attempt_key !== input.attempt_key || !["approved","succeeded"].includes(authorization.link_status) || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || proposal.currency !== "USD" || !Number.isSafeInteger(proposal.total_minor) || proposal.total_minor < 0) {
    return {status:"needs_human",evidence:[],blocker:"Execution requires the current exact proposal, held reservation, unexpired approval and verified Link approval.",blocker_code:"approval_invalid",uncertain:false};
  }
  let source: string;
  try { source=publicSourceUrl(proposal.source_url,input.lane); } catch { return {status:"needs_human",evidence:[],blocker:"The approved merchant URL is not supported.",blocker_code:"unsupported_url",uncertain:false}; }
  try {
    const run=await withSurfskyPage(input.lane,runSignal(input),async page=>{
      const response=await page.goto(source,{waitUntil:"domcontentloaded"});
      if(response && response.status()>=400) throw new BrowserIssue("provider_error",`The approved merchant page returned HTTP ${response.status()}.`);
      await detectAccessBlocker(page);
      publicSourceUrl(page.url(),input.lane);
      return evidence(input,source,`${providerName(input.lane,source)} approval handoff`,"The approved source was reopened in Surfsky. A verified final checkout total, recipient and merchant confirmation are still required. No payment credentials were consumed and no order, freelancer message or booking was submitted. No event registration or RSVP was submitted or confirmed.");
    });
    return {status:"needs_human",evidence:[run.value],blocker:run.cleanup === "confirmed"?"Complete the merchant checkout with the manager. This adapter has not verified a supported final purchase flow.":"Browser cleanup is unconfirmed; reconcile its session before continuing checkout.",blocker_code:"checkout_handoff",uncertain:false};
  } catch(error) {
    const issue=error instanceof BrowserIssue?error:new BrowserIssue("provider_error","Approved-source verification could not finish.");
    return {status:"needs_human",evidence:[evidence(input,source,"Approved action paused",issue.message+" No commitment was attempted.")],blocker:issue.message,blocker_code:issue.code,uncertain:false};
  }
}
