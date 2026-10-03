import { chromium, type Browser, type Page } from "playwright-core";
import type { Lane } from "../shared/contracts";
import { BrowserIssue } from "./surfsky";

const browserlessLocks = new Set<string>();

export function browserlessConfigured(): boolean {
  const token = process.env.BROWSERLESS_TOKEN?.trim();
  return Boolean(token && /^[A-Za-z0-9_-]{32,256}$/.test(token));
}

function endpoint(timeoutMs: number): string {
  const token = process.env.BROWSERLESS_TOKEN?.trim();
  if (!token || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) {
    throw new BrowserIssue("configuration", "Browserless is not configured for Amazon research.");
  }
  const url = new URL("wss://production-sfo.browserless.io/stealth");
  url.searchParams.set("token", token);
  url.searchParams.set("proxy", "residential");
  url.searchParams.set("proxyCountry", "us");
  url.searchParams.set("proxySticky", "true");
  url.searchParams.set("proxyLocaleMatch", "true");
  url.searchParams.set("timeout", String(Math.max(10_000, Math.min(timeoutMs, 110_000))));
  return url.href;
}

export interface BrowserlessRun<T> {
  value: T;
  cleanup: "confirmed" | "unconfirmed";
}

/**
 * Runs a bounded, isolated Browserless session. It never imports local cookies,
 * profile data, passwords, or payment credentials.
 */
export async function withBrowserlessPage<T>(
  lane: Lane,
  attemptKey: string,
  signal: AbortSignal,
  timeoutMs: number,
  work: (page: Page) => Promise<T>,
): Promise<BrowserlessRun<T>> {
  const lock = `${lane}:${attemptKey}`;
  if (browserlessLocks.has(lock)) throw new BrowserIssue("profile_busy", `This ${lane} attempt is already running.`);
  browserlessLocks.add(lock);
  let browser: Browser | undefined;
  let value: T;
  let cleanup: BrowserlessRun<T>["cleanup"] = "unconfirmed";
  let failure: BrowserIssue | undefined;
  try {
    try {
      browser = await chromium.connectOverCDP(endpoint(timeoutMs), { timeout: 20_000 });
    } catch {
      throw new BrowserIssue("provider_error", `Browserless could not start the ${lane} browser.`);
    }
    const context = browser.contexts()[0];
    if (!context) throw new BrowserIssue("provider_error", "Browserless did not expose its isolated browser context.");
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(40_000);
    const onAbort = () => { void page.close({ runBeforeUnload: false }).catch(() => {}); };
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      if (signal.aborted) throw new BrowserIssue("cancelled", `${lane} research was cancelled.`);
      value = await work(page);
    } finally {
      signal.removeEventListener("abort", onAbort);
      await page.close({ runBeforeUnload: false }).catch(() => {});
    }
  } catch (error) {
    failure = error instanceof BrowserIssue
      ? error
      : new BrowserIssue(signal.aborted ? "timeout" : "provider_error", signal.aborted ? `The ${lane} browser reached its time limit.` : `Browserless could not finish the ${lane} research run.`);
  } finally {
    if (browser) {
      try {
        await browser.close();
        cleanup = "confirmed";
      } catch {
        cleanup = "unconfirmed";
      }
    }
    browserlessLocks.delete(lock);
  }
  if (failure) {
    failure.cleanup = browser ? cleanup : "not_started";
    throw failure;
  }
  return { value: value!, cleanup };
}

export async function solveBrowserlessChallenge(page: Page): Promise<boolean> {
  const session = await page.context().newCDPSession(page);
  try {
    const result = await (session as unknown as { send(method: string): Promise<unknown> }).send("Browserless.solveCaptcha") as {
      ok?: unknown;
      captchaFound?: unknown;
      solved?: unknown;
    };
    return result.ok === true && result.captchaFound === true && result.solved === true;
  } catch {
    return false;
  } finally {
    await session.detach().catch(() => {});
  }
}
