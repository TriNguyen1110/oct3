import { chromium, type Browser, type Page } from "playwright-core";
import type { Lane } from "../shared/contracts";
import type { BrowserBlockerCode } from "./types";

const SAFE_CODES = new Set(["namespace_not_allowed", "not_authorized", "parallel_browsers_limit_reached", "insufficient_balance", "insufficient_funds", "proxy_required", "proxy_pool_unavailable", "rate_limit_exceeded", "region_not_chosen"]);
const laneLocks = new Set<Lane>();
export class BrowserIssue extends Error {
  cleanup: "confirmed" | "not_started" | "unconfirmed" = "not_started";
  constructor(public code: BrowserBlockerCode, message: string) { super(message); this.name = "BrowserIssue"; }
}
export function surfskyConfigured(): boolean {
  return Boolean((process.env.SURFSKY_API_KEY || process.env.SURFSKY_API_TOKEN) && process.env.SURFSKY_API_BASE_URL);
}
function configuration() {
  const token = (process.env.SURFSKY_API_KEY || process.env.SURFSKY_API_TOKEN)?.trim();
  let base: URL;
  try { base = new URL(process.env.SURFSKY_API_BASE_URL || ""); } catch { throw new BrowserIssue("configuration", "Set the assigned Surfsky API base URL."); }
  if (!token || base.protocol !== "https:" || !base.hostname.endsWith(".surfsky.io") || base.username || base.password || base.search || base.hash || base.port || base.pathname !== "/") {
    throw new BrowserIssue("configuration", "Surfsky credentials or assigned API base URL are missing or invalid.");
  }
  return { token, base };
}
async function api(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<unknown> {
  const { token, base } = configuration();
  let response: Response;
  try {
    response = await fetch(new URL(path, base), { method, redirect: "error", signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(signal ? [signal] : [])]), headers: { "X-Cloud-Api-Token": token, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  } catch {
    if (signal?.aborted) throw new BrowserIssue("cancelled", "Browser work was cancelled or timed out.");
    throw new BrowserIssue("provider_error", "Surfsky could not be reached. No automatic start retry was attempted.");
  }
  let data: unknown;
  try { data = await response.json(); } catch { throw new BrowserIssue("provider_error", "Surfsky returned an unreadable response."); }
  const record = data as Record<string, unknown>;
  if (!response.ok || record?.success === false) {
    const code = typeof record?.code === "string" && SAFE_CODES.has(record.code) ? record.code : "provider_error";
    if (response.status === 401 || response.status === 403) throw new BrowserIssue("provider_auth", "Surfsky rejected this account key or assigned region.");
    if (response.status === 402 || code === "insufficient_balance" || code === "insufficient_funds") throw new BrowserIssue("provider_credit", "Surfsky needs available account credit before starting a browser.");
    if (code === "parallel_browsers_limit_reached" || response.status === 429) throw new BrowserIssue("provider_capacity", "Surfsky has no available browser slot; retry after existing work ends.");
    throw new BrowserIssue("provider_error", `Surfsky returned ${code} (HTTP ${response.status}).`);
  }
  return data;
}
function validId(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value); }
interface Profile { uuid: string; title: string; status: "started" | "stopped" }
async function ensureProfile(lane: Lane, signal: AbortSignal): Promise<Profile> {
  const title = `oct3-${lane}`;
  const matches: Profile[] = [];
  for (let page = 0; page < 10; page++) {
    const data = await api(`/profiles?page=${page}&page_len=100&ordering=title`, "GET", undefined, signal);
    if (!Array.isArray(data)) throw new BrowserIssue("provider_error", "Surfsky profile listing had an unexpected shape.");
    for (const row of data) if (row?.title === title && validId(row?.uuid)) matches.push({ uuid: row.uuid, title, status: row.status });
    if (data.length < 100) break;
    if (page === 9) throw new BrowserIssue("profile_conflict", "The Surfsky profile listing exceeded the bounded lookup. Configure this worker profile manually.");
  }
  if (matches.length > 1) throw new BrowserIssue("profile_conflict", "Duplicate oct3 worker profiles require reconciliation before starting.");
  if (matches[0]) {
    if (matches[0].status === "started") throw new BrowserIssue("profile_busy", "This oct3 worker browser is already running. Wait for its run or reconcile it before retrying.");
    return matches[0];
  }
  const created = await api("/profiles", "POST", { title, fingerprint: { os: "win" }, storage_options: { cookies: true, localstorage: true, passwords: false, bookmarks: false, history: false } }, signal) as { data?: { uuid?: unknown } };
  if (!validId(created?.data?.uuid)) throw new BrowserIssue("provider_error", "Surfsky did not confirm the new profile identifier. Reconcile before retrying.");
  return { uuid: created.data.uuid, title, status: "stopped" };
}
export interface SurfskyRun<T> { value: T; cleanup: "confirmed" | "unconfirmed" }
/** Caller must additionally serialize same-lane jobs in durable storage across app instances. */
export async function withSurfskyPage<T>(lane: Lane, signal: AbortSignal, work: (page: Page) => Promise<T>): Promise<SurfskyRun<T>> {
  if (laneLocks.has(lane)) throw new BrowserIssue("profile_busy", "This worker already has a browser run in progress.");
  laneLocks.add(lane);
  let sessionId: string | undefined;
  let browser: Browser | undefined;
  let cleanup: "confirmed" | "unconfirmed" = "unconfirmed";
  let value: T;
  let failure: BrowserIssue | undefined;
  let startAttempted = false;
  try {
    const profile = await ensureProfile(lane, signal);
    startAttempted = true;
    const started = await api(`/profiles/${profile.uuid}/start`, "POST", { browser_settings: { inactive_kill_timeout: 120 }, anti_captcha: { enabled: true }, ...(process.env.SURFSKY_PROXY_COUNTRY ? { proxy: { tier: "shared", country: process.env.SURFSKY_PROXY_COUNTRY } } : {}) }, signal) as { success?: boolean; internal_uuid?: unknown; ws_url?: unknown };
    if (!validId(started.internal_uuid)) throw new BrowserIssue("provider_error", "Surfsky session start was not confirmed. Reconcile the profile before retrying.");
    sessionId = started.internal_uuid;
    const { base } = configuration();
    let ws: URL;
    try { ws = new URL(String(started.ws_url)); } catch { throw new BrowserIssue("provider_error", "Surfsky returned an invalid browser connection."); }
    if (started.success !== true || ws.protocol !== "wss:" || ws.hostname !== base.hostname || ws.username || ws.password || ws.hash || ws.port !== base.port) throw new BrowserIssue("provider_error", "Surfsky returned an invalid browser connection.");
    try { browser = await chromium.connectOverCDP(ws.href, { timeout: 20_000 }); } catch { throw new BrowserIssue("provider_error", "The remote Surfsky browser connection failed."); }
    const context = browser.contexts()[0];
    if (!context) throw new BrowserIssue("provider_error", "Surfsky did not expose its persistent browser context.");
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(40_000);
    const onAbort = () => { void page.close().catch(() => {}); };
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      if (signal.aborted) throw new BrowserIssue("cancelled", "Browser work was cancelled.");
      value = await work(page);
    } finally {
      signal.removeEventListener("abort", onAbort);
      await page.close().catch(() => {});
    }
  } catch (error) {
    failure = error instanceof BrowserIssue ? error : new BrowserIssue(signal.aborted ? "timeout" : "provider_error", signal.aborted ? "The remote browser reached its time limit." : "The merchant navigation or page inspection failed.");
  } finally {
    // Playwright close only disconnects CDP. Stop the exact owned session explicitly.
    await browser?.close().catch(() => {});
    if (sessionId) {
      try { const stopped = await api(`/profiles/${sessionId}/stop`, "POST") as { success?: boolean }; if (stopped.success === true) cleanup = "confirmed"; } catch { /* Caller receives cleanup status; idle timeout is a backstop. */ }
    }
    laneLocks.delete(lane);
  }
  if (failure) { failure.cleanup = startAttempted ? cleanup : "not_started"; throw failure; }
  return { value: value!, cleanup };
}
/** Read-only account check; returns no identifiers, tokens or connection URLs. */
export async function surfskyHealth(): Promise<{ ready: boolean; active_sessions?: number; detail: string }> {
  try {
    const result = await api("/profiles/active") as { success?: boolean; data?: unknown[] };
    if (result.success !== true || !Array.isArray(result.data)) throw new BrowserIssue("provider_error", "Unexpected active-session response.");
    return { ready: true, active_sessions: result.data.length, detail: "Surfsky account authenticated." };
  } catch (error) { return { ready: false, detail: error instanceof BrowserIssue ? error.message : "Surfsky readiness check failed." }; }
}

/** Reconcile only the exact existing oct3 lane; never starts or stops a browser. */
export async function verifyLaneStopped(lane: Lane): Promise<{confirmed:boolean;detail:string}> {
  if(!["amazon","fiverr","event_tickets"].includes(lane))return {confirmed:false,detail:"Unknown browser lane."};
  try{
    const signal=AbortSignal.timeout(15_000);
    const matches:{status:unknown}[]=[];
    let exhausted=true;
    for(let page=0;page<10;page++){
      const rows=await api(`/profiles?page=${page}&page_len=100&ordering=title`,"GET",undefined,signal);
      if(!Array.isArray(rows))return {confirmed:false,detail:"The saved-profile response could not establish the lane state."};
      for(const row of rows)if(row?.title===`oct3-${lane}`){
        if(!validId(row?.uuid))return {confirmed:false,detail:"The exact lane profile identifier could not be validated."};
        matches.push({status:row.status});
      }
      if(rows.length<100){exhausted=false;break;}
    }
    if(exhausted)return {confirmed:false,detail:"The bounded profile lookup could not establish the lane state."};
    if(matches.length!==1)return {confirmed:false,detail:matches.length?"Multiple lane profiles require reconciliation.":"No exact saved lane profile was found; the earlier start outcome remains unconfirmed."};
    if(matches[0].status!=="stopped")return {confirmed:false,detail:"The exact lane profile is still running or its terminal state is unknown."};
    return {confirmed:true,detail:"The exact saved lane profile is stopped."};
  }catch(error){return {confirmed:false,detail:error instanceof BrowserIssue?error.message:"The lane state could not be verified."};}
}
