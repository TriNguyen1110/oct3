#!/usr/bin/env node
import { constants } from "node:fs";
import { mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright-core";

const CONSENT_FLAG = "--confirm-profile-access";
const CONNECT_TIMEOUT_MS = 20_000;
const LIFECYCLE_TIMEOUT_MS = 25_000;
const CLEANUP_STEP_TIMEOUT_MS = 4_000;
type Command = "status" | "probe" | "help";

interface ActiveEndpoint { port: number; browserPath: string }
interface Lease { owner: string; path: string }

function print(value: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function usage() {
  process.stdout.write(`Cue local Chrome bridge (preparatory probe only)\n\nUsage:\n  node --import tsx scripts/local-browser.ts status\n  node --import tsx scripts/local-browser.ts probe ${CONSENT_FLAG}\n\nstatus reads only Chrome's local readiness marker.\nprobe asks Chrome for native permission, creates and closes one about:blank tab, then disconnects.\nIt does not navigate, explicitly access existing tabs, or export cookies/storage.\n`);
}

function abortError(signal: AbortSignal): Error {
  return new Error(signal.reason === "interrupted" ? "interrupted" : "lifecycle_timeout");
}

async function whileActive<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw abortError(signal);
  return await new Promise<T>((resolve, reject) => {
    const finish = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => { finish(); reject(abortError(signal)); };
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(value => { finish(); resolve(value); }, error => { finish(); reject(error); });
  });
}

async function cleanupWithin(operation: Promise<unknown>): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      operation,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("cleanup_timeout")), CLEANUP_STEP_TIMEOUT_MS); }),
    ]);
    return true;
  } catch { return false; }
  finally { if (timer) clearTimeout(timer); }
}

function chromeDataDir(): string {
  if (platform() !== "darwin") throw new Error("unsupported_platform");
  return join(homedir(), "Library", "Application Support", "Google", "Chrome");
}

async function activeEndpoint(): Promise<ActiveEndpoint> {
  const marker = join(chromeDataDir(), "DevToolsActivePort");
  const info = await stat(marker);
  if (!info.isFile() || info.size < 3 || info.size > 512) throw new Error("invalid_marker");
  const lines = (await readFile(marker, "utf8")).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length !== 2) throw new Error("invalid_marker");
  const port = Number(lines[0]);
  const browserPath = lines[1];
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535 || !/^\/devtools\/browser\/[A-Za-z0-9._-]{8,160}$/.test(browserPath)) throw new Error("invalid_marker");
  return { port, browserPath };
}

async function acquireLease(): Promise<Lease> {
  const directory = join(homedir(), ".cue");
  const path = join(directory, "local-browser.lock");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const owner = randomUUID();
  try {
    const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try { await handle.writeFile(JSON.stringify({ owner, pid: process.pid, created_at: Date.now() })); }
    finally { await handle.close(); }
    return { owner, path };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("runner_busy");
    throw error;
  }
}

async function releaseLease(lease: Lease | undefined) {
  if (!lease) return;
  try {
    const current = JSON.parse(await readFile(lease.path, "utf8")) as { owner?: unknown };
    if (current.owner === lease.owner) await unlink(lease.path);
  } catch { /* A missing or replaced lease is not ours to delete. */ }
}

function endpointUrl(endpoint: ActiveEndpoint): string {
  return `ws://127.0.0.1:${endpoint.port}${endpoint.browserPath}`;
}

async function status(): Promise<number> {
  try {
    await activeEndpoint();
    print({ command: "status", state: "permission_ready", connected: false, chrome_requirement: "Chrome 144+", next_action: `Run probe ${CONSENT_FLAG}; Chrome will ask you to Allow or deny access.` });
    return 0;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    print({ command: "status", state: code === "ENOENT" ? "remote_debugging_not_enabled" : (error as Error).message === "unsupported_platform" ? "unsupported_platform" : "readiness_unknown", connected: false, next_action: code === "ENOENT" ? "In Chrome 144+, open chrome://inspect/#remote-debugging and enable remote debugging. Then rerun status." : "Use Google Chrome Stable on macOS and verify its remote-debugging setting manually." });
    return 2;
  }
}

async function probe(): Promise<number> {
  if (!process.argv.includes(CONSENT_FLAG)) {
    print({ command: "probe", state: "consent_required", connected: false, next_action: `Read docs/LOCAL_BROWSER.md, then rerun with ${CONSENT_FLAG}. Chrome will still ask for native permission.` });
    return 2;
  }
  let lease: Lease | undefined;
  let browser: Browser | undefined;
  let ownedPage: Page | undefined;
  let ownedTabCreationStarted = false;
  let ownedTabClosed = false;
  let connectionClosed = false;
  const interruption = new AbortController();
  const abort = (reason: string) => { if (!interruption.signal.aborted) interruption.abort(reason); };
  const onSignal = () => abort("interrupted");
  let lifecycleTimer: NodeJS.Timeout | undefined;
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  let failure: unknown;
  try {
    const endpoint = await activeEndpoint();
    lease = await acquireLease();
    // Playwright bounds the native permission/attach phase. A signal received
    // during it is honored immediately after the bounded attach completes.
    browser = await chromium.connectOverCDP(endpointUrl(endpoint), { timeout: CONNECT_TIMEOUT_MS, isLocal: true, noDefaults: true });
    lifecycleTimer = setTimeout(() => abort("lifecycle_timeout"), LIFECYCLE_TIMEOUT_MS);
    if (interruption.signal.aborted) throw abortError(interruption.signal);
    const context = browser.contexts()[0];
    if (!context) throw new Error("default_context_missing");
    ownedTabCreationStarted = true;
    const pageOperation = context.newPage();
    // If cancellation wins, close a page that resolves late rather than leave
    // an untracked blank tab in the user's Chrome profile.
    void pageOperation.then(page => {
      if (interruption.signal.aborted && ownedPage !== page)
        void cleanupWithin(page.close({ runBeforeUnload: false }));
    }).catch(() => {});
    ownedPage = await whileActive(pageOperation, interruption.signal);
    const sessionOperation = context.newCDPSession(ownedPage);
    void sessionOperation.then(session => {
      if (interruption.signal.aborted) void cleanupWithin(session.detach());
    }).catch(() => {});
    const session = await whileActive(sessionOperation, interruption.signal);
    try {
      const result = await whileActive(session.send("Target.getTargetInfo"), interruption.signal) as { targetInfo?: { targetId?: unknown; url?: unknown; type?: unknown } };
      if (typeof result.targetInfo?.targetId !== "string" || result.targetInfo.targetId.length < 8 || result.targetInfo.url !== "about:blank" || result.targetInfo.type !== "page") throw new Error("owned_tab_unverified");
    } finally { await cleanupWithin(session.detach()); }
    if (!await cleanupWithin(ownedPage.close({ runBeforeUnload: false }))) throw new Error("owned_tab_cleanup_timeout");
    ownedTabClosed = true;
    ownedPage = undefined;
    // For a connectOverCDP browser Playwright closes its transport; it does not
    // own or terminate the user's Chrome process.
    if (!await cleanupWithin(browser.close())) throw new Error("connection_cleanup_timeout");
    connectionClosed = true;
    browser = undefined;
    print({ command: "probe", state: "passed", connected: false, owned_tabs_created: 1, owned_tabs_closed: 1, existing_tabs_explicitly_accessed: 0, merchant_navigation: false, browser_preserved: true });
  } catch (error) {
    failure = error;
  } finally {
    if (lifecycleTimer) clearTimeout(lifecycleTimer);
    if (ownedPage) ownedTabClosed = await cleanupWithin(ownedPage.close({ runBeforeUnload: false }));
    // For connectOverCDP this closes the injected client transport. It does not
    // send CDP Browser.close or terminate the user's Chrome process.
    if (browser) connectionClosed = await cleanupWithin(browser.close());
    await releaseLease(lease);
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
  if (!failure) return 0;
  const message = (failure as Error).message;
  const code = (failure as NodeJS.ErrnoException).code;
  const state = message === "interrupted" ? "interrupted" : message === "lifecycle_timeout" ? "lifecycle_timeout" : message === "runner_busy" ? "runner_busy" : code === "ENOENT" ? "remote_debugging_not_enabled" : message === "unsupported_platform" ? "unsupported_platform" : "permission_or_connection_failed";
  const ownedTabCleanup = ownedTabClosed ? "confirmed" : ownedTabCreationStarted ? "unconfirmed" : "not_started";
  const retryAction = ownedTabCleanup === "unconfirmed" ? " Inspect Chrome for a leftover blank tab; do not close unrelated tabs." : "";
  const nextAction = state === "remote_debugging_not_enabled" ? "Enable remote debugging in Chrome 144+ at chrome://inspect/#remote-debugging, then rerun the probe." : state === "runner_busy" ? "A prior lease exists. Verify no local runner is active before manually removing ~/.cue/local-browser.lock." : state === "lifecycle_timeout" ? `The bounded probe stopped and released its lease. Verify Chrome stayed open before retrying.${retryAction}` : `Keep Chrome open, verify remote debugging is enabled, rerun the probe, and click Allow in Chrome's native dialog.${retryAction}`;
  print({ command: "probe", state, connected: false, owned_tab_cleanup: ownedTabCleanup, connection_cleanup: connectionClosed ? "confirmed" : browser ? "unconfirmed" : "not_started", lease_released: true, next_action: nextAction });
  return 1;
}

async function main(): Promise<number> {
  const raw = process.argv[2] || "help";
  const command: Command = raw === "status" || raw === "probe" ? raw : "help";
  if (command === "help") { usage(); return raw === "help" || raw === "--help" || raw === "-h" || !process.argv[2] ? 0 : 2; }
  return command === "status" ? status() : probe();
}

void main().then(code => { process.exitCode = code; }).catch(() => {
  print({ state: "local_runner_error", connected: false, next_action: "Review local runner installation and retry. No browser endpoint or profile data was logged." });
  process.exitCode = 1;
});
