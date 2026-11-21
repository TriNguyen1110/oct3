import type { TestContext } from "node:test";
import { chromium, type Browser } from "playwright-core";

/**
 * Local headless Chrome for a test file. Closing is bounded: Chrome's own shutdown sometimes took
 * 30-400 s on the mini under memory pressure, long after every assertion had passed, so the test
 * timed out on cleanup. After 5 s the server is killed instead.
 */
export async function launchTestChrome(t: TestContext): Promise<Browser> {
  const server = await chromium.launchServer({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const browser = await chromium.connect(server.wsEndpoint());
  t.after(async () => {
    const closed = Promise.all([browser.close(), server.close()]).then(() => true, () => true);
    const late = new Promise<false>(resolve => { setTimeout(() => resolve(false), 5_000).unref(); });
    if (!await Promise.race([closed, late])) await server.kill();
  });
  return browser;
}
