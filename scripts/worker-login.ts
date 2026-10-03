/** Private, local-only account setup. Never print connection URLs or page contents. */
import { chromium, type Browser } from "playwright-core";
import { mkdir, writeFile, unlink, access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { acquireLane, releaseLane, storageMode } from "../src/server/store";

const lane = process.argv[2];
if (lane !== "amazon" && lane !== "fiverr") throw new Error("Choose amazon or fiverr.");
if (storageMode() !== "supabase") throw new Error("Durable Supabase locking is required.");
const base = new URL(process.env.SURFSKY_API_BASE_URL || "");
const token = process.env.SURFSKY_API_KEY || process.env.SURFSKY_API_TOKEN;
if (!token || base.protocol !== "https:" || !base.hostname.endsWith(".surfsky.io") || base.username || base.password || base.port || base.search || base.hash || base.pathname !== "/") throw new Error("Invalid Surfsky configuration.");
const owner = `private-login-${randomUUID()}`;
const directory = join(process.cwd(), ".data");
const donePath = join(directory, `worker-login-${lane}.done`);
const statePath = join(directory, `worker-login-${lane}.json`);
const handoffPath = join(directory, `worker-login-${lane}.html`);
const destination = lane === "amazon" ? "https://www.amazon.com/" : "https://www.fiverr.com/login";
const idValid = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
async function api(path: string, body?: unknown): Promise<any> {
  const response = await fetch(new URL(path, base), { method: body === undefined ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(20_000), headers: { "X-Cloud-Api-Token": token!, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok || result?.success === false) throw new Error(`Surfsky setup request failed (HTTP ${response.status}).`);
  return result;
}
async function profiles() {
  const matches: any[] = [];
  for (let index = 0; index < 10; index++) {
    const rows = await api(`/profiles?page=${index}&page_len=100&ordering=title`);
    if (!Array.isArray(rows)) throw new Error("Unexpected profile list.");
    matches.push(...rows.filter(row => row.title === `oct3-${lane}`));
    if (rows.length < 100) return matches;
  }
  throw new Error("Profile lookup exceeded its bound.");
}
function validInspector(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const target = new URL(value);
    const remote = target.searchParams.get("wss") || target.searchParams.get("ws");
    const socket = new URL(/^wss?:\/\//.test(remote || "") ? remote! : `wss://${remote}`);
    const native = target.protocol === "devtools:" && target.hostname === "devtools" && target.pathname === "/bundled/inspector.html";
    const hostedChrome = target.origin === "https://chrome-devtools-frontend.appspot.com" && /^\/serve_rev\/[^/]+\/inspector\.html$/.test(target.pathname);
    const hostedSurfsky = target.origin === base.origin && !target.username && !target.password;
    return (native || hostedChrome || hostedSurfsky) && socket.protocol === "wss:" && socket.hostname === base.hostname && !socket.username && !socket.password && !socket.hash;
  } catch { return false; }
}
async function writeHandoff(url: string) {
  const escaped = url.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const title = lane === "amazon" ? "Amazon" : "Fiverr";
  await writeFile(handoffPath, `<!doctype html><meta charset="utf-8"><title>Cue · private ${title} sign-in</title><style>body{background:#101518;color:#f9edd7;font:22px system-ui;max-width:820px;margin:10vh auto;padding:30px}a{display:inline-block;background:#f1c978;color:#181414;padding:20px 30px;border-radius:18px;text-decoration:none;font-weight:700}p{line-height:1.7;color:#c4ccc9}</style><h1>Connect your ${title} worker</h1><p>Open your private worker below. In DevTools, click the small screen icon at the top left (Toggle screencast) to reveal the live page. Sign in to ${title} there.</p><a href="${escaped}">Open private ${title} browser →</a><p>Tell Cue when sign-in is complete. This session lasts ten minutes. No purchase is placed by this setup step. Keep this local file private.</p>`, { mode: 0o600 });
}
await mkdir(directory, { recursive: true, mode: 0o700 });
await unlink(donePath).catch(() => {});
if (!await acquireLane("oct3-demo", lane, owner)) throw new Error("This worker is busy; no browser was started.");
let browser: Browser | undefined;
let internal: string | undefined;
let profileId: string | undefined;
let startAttempted = false;
let stopped = false;
let cancelled = false;
let renewFailed = false;
let renewInFlight: Promise<void> | undefined;
let phase = "profile";
const cancel = () => { cancelled = true; };
process.on("SIGINT", cancel);
process.on("SIGTERM", cancel);
const renewal = setInterval(() => {
  if (renewInFlight) return;
  renewInFlight = acquireLane("oct3-demo", lane, owner).then(ok => { if (!ok) renewFailed = true; }).catch(() => { renewFailed = true; }).finally(() => { renewInFlight = undefined; });
}, 60_000);
try {
  const matches = await profiles();
  if (matches.length !== 1 || !idValid(matches[0].uuid) || matches[0].status !== "stopped") throw new Error("The exact worker profile must exist and be stopped.");
  profileId = matches[0].uuid;
  phase = "start";
  await writeFile(statePath, JSON.stringify({ lane, owner, profile_uuid: profileId, pid: process.pid, start_requested_at: new Date().toISOString() }), { mode: 0o600 });
  startAttempted = true;
  const started = await api(`/profiles/${profileId}/start`, { browser_settings: { inactive_kill_timeout: 900 }, anti_captcha: { enabled: true }, ...(process.env.SURFSKY_PROXY_COUNTRY ? { proxy: { tier: "shared", country: process.env.SURFSKY_PROXY_COUNTRY } } : {}) });
  if (!idValid(started.internal_uuid)) throw new Error("Start was not confirmed; reconcile before retrying.");
  internal = started.internal_uuid;
  await writeFile(statePath, JSON.stringify({ lane, owner, internal_uuid: internal, profile_uuid: profileId, pid: process.pid, started_at: new Date().toISOString() }), { mode: 0o600 });
  const socket = new URL(started.ws_url);
  if (socket.protocol !== "wss:" || socket.hostname !== base.hostname || socket.username || socket.password || socket.port || socket.hash) throw new Error("Unexpected browser connection.");
  phase = "connect";
  browser = await chromium.connectOverCDP(socket.href, { timeout: 40_000 });
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();
  const cdp = await context.newCDPSession(page);
  const { targetInfo } = await cdp.send("Target.getTargetInfo");
  let navigationStatus: number | null = null;
  phase = "navigate";
  try { navigationStatus = (await page.goto(destination, { waitUntil: "domcontentloaded", timeout: 40_000 }))?.status() || null; } catch { /* User can inspect the live browser. */ }
  // Reuse only an inspector URL returned by Surfsky, matched to the actual target.
  phase = "discovery";
  const discovery = await api(`/proxy/${internal}/json/list`);
  const targets = Array.isArray(discovery) ? discovery : [];
  const target = targets.find(row => row.id === targetInfo.targetId);
  let inspector = target?.devtoolsFrontendUrl;
  if (!validInspector(inspector)) inspector = (started.inspector?.pages || []).find((row: any) => typeof row.devtools_url === "string" && row.devtools_url.includes(targetInfo.targetId))?.devtools_url;
  if (!validInspector(inspector)) {
    phase = "inspector";
    const inspectorUrl = new URL(started.inspector?.list || "");
    if (inspectorUrl.origin !== base.origin || inspectorUrl.pathname !== `/proxy/${internal}/inspector`) throw new Error("Unexpected inspector endpoint.");
    const listing = await api(inspectorUrl.pathname);
    const pages = Array.isArray(listing) ? listing : Array.isArray(listing?.pages) ? listing.pages : Array.isArray(listing?.inspector) ? listing.inspector : Array.isArray(listing?.inspector?.pages) ? listing.inspector.pages : [];
    inspector = pages.find((row: any) => typeof row.devtools_url === "string" && row.devtools_url.includes(targetInfo.targetId))?.devtools_url;
  }
  if (!validInspector(inspector)) throw new Error("No validated private inspector URL was returned.");
  phase = "handoff";
  await writeHandoff(inspector);
  phase = "waiting";
  console.log(JSON.stringify({ lane, state: "private_handoff_ready", initial_http: navigationStatus, max_minutes: 10, local_file: handoffPath, instruction: "Open the private local handoff file, then use Chrome DevTools screencast to sign in." }));
  const deadline = Date.now() + 600_000;
  let lastKeepalive = 0;
  while (!cancelled && !renewFailed && Date.now() < deadline) {
    try { await access(donePath); break; } catch { /* Wait for explicit completion. */ }
    if (Date.now() - lastKeepalive > 30_000) { await cdp.send("Browser.getVersion"); lastKeepalive = Date.now(); }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log(JSON.stringify({ lane, state: renewFailed ? "lease_renewal_failed" : cancelled ? "cancelled" : Date.now() >= deadline ? "time_limit" : "user_finished" }));
} catch (error) {
  const message = error instanceof Error ? error.message : "";
  const reason = /timeout|timed out/i.test(message) ? "timeout" : /ECONN|closed|socket|connect/i.test(message) ? "connection" : /^Unexpected|^No validated|^The exact|^Could not open|^Start was not|^Surfsky setup/.test(message) ? message : "unclassified";
  console.log(JSON.stringify({ lane, state: "private_login_setup_failed", phase, reason, start_attempted: startAttempted }));
  process.exitCode = 1;
} finally {
  clearInterval(renewal);
  await renewInFlight;
  await browser?.close().catch(() => {});
  await unlink(handoffPath).catch(() => {});
  if (internal) {
    try { stopped = (await api(`/profiles/${internal}/stop`, {})).success === true; } catch { /* Read-only reconciliation below. */ }
    if (!stopped) {
      try { const matches = await profiles(); stopped = matches.length === 1 && matches[0].uuid === profileId && matches[0].status === "stopped"; } catch { /* Preserve the lane hold if unknown. */ }
    }
  }
  if (!startAttempted || stopped) {
    await releaseLane("oct3-demo", lane, owner);
    await unlink(statePath).catch(() => {});
    await unlink(donePath).catch(() => {});
  }
  console.log(JSON.stringify({ lane, cleanup: !startAttempted ? "not_started" : stopped ? "confirmed" : "unconfirmed", lane_released: !startAttempted || stopped }));
}
