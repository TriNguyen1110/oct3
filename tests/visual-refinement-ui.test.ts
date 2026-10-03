import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright-core";

const base = process.env.OCT3_SCREEN_UI_URL;
test("refined mission desk preserves local fixture controls, dialog access and reduced-motion behavior", { skip: !base }, async t => {
  const origin = new URL(base!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname));
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  t.after(() => browser.close());
  for (const width of [1440, 390]) await t.test(`${width}px fixture and dialogs`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    const mutations: string[] = [], pageErrors: string[] = [], assetErrors: string[] = [];
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin.origin) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (!["GET", "HEAD"].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
      const body = url.pathname === "/api/auth" ? { authenticated: false } : url.pathname === "/api/readiness" ? { services: [] } : { mission: null, missions: [] };
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("response", response => { if (response.status() >= 400 && !new URL(response.url()).pathname.startsWith("/api/")) assetErrors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
    await page.goto(origin.href); await page.getByRole("button", { name: "New mission", exact: true }).waitFor();
    await page.locator(".brief-eyebrow").filter({ hasText: "EXAMPLE MISSION" }).waitFor();
    assert.equal(await page.locator(".worker-card").count(), 3);
    assert.equal(await page.locator(".worker-art svg").count(), 3);
    assert.match(await page.locator("h1").innerText(), /Consider it\s+in good hands/);
    const audit = async () => page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      unnamedButtons: [...document.querySelectorAll("button")].filter(button => button.getBoundingClientRect().width > 0 && !button.textContent?.trim() && !button.getAttribute("aria-label") && !button.getAttribute("aria-labelledby")).length,
      duplicateIds: [...document.querySelectorAll("[id]")].map(node => node.id).filter((id, index, list) => list.indexOf(id) !== index),
    }));
    assert.deepEqual(await audit(), { overflow: false, unnamedButtons: 0, duplicateIds: [] });
    await page.screenshot({ path: `/tmp/cue-screen-verified-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "New mission", exact: true }).click();
    const auth = page.getByRole("dialog", { name: "Connect your workspace" });
    await auth.waitFor(); assert.equal(await auth.getByLabel("Manager access key").getAttribute("type"), "password");
    assert.equal(await auth.getByRole("button", { name: "Connect workspace", exact: true }).isDisabled(), true);
    assert.equal(await auth.evaluate(node => node.contains(document.activeElement)), true);
    // Native dialog may hand focus to browser chrome (reported as body); background page controls must stay inert.
    for (let index = 0; index < 6; index++) { await page.keyboard.press("Tab"); assert.equal(await auth.evaluate(node => document.activeElement === document.body || node.contains(document.activeElement)), true); }
    assert.deepEqual(await audit(), { overflow: false, unnamedButtons: 0, duplicateIds: [] });
    await page.keyboard.press("Escape"); await auth.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Saved profile", exact: true }).click(); await auth.waitFor(); await auth.getByRole("button", { name: "Close dialog" }).click();
    await page.getByRole("button", { name: "Edit purchase budget", exact: true }).click();
    const budget = page.getByRole("dialog", { name: "A change of plans?" }); await budget.waitFor();
    await budget.getByLabel("New purchase budget · USD").fill("650");
    await budget.getByRole("button", { name: "Revise example plan" }).click(); await budget.waitFor({ state: "hidden" });
    assert.equal(mutations.length, 0, "Fixture budget revision must remain local");
    for (let index = 0; index < 3; index++) {
      await page.locator(".worker-card").nth(index).getByRole("button").last().click();
      const dialog = page.getByRole("dialog"); await dialog.waitFor();
      assert.match(await dialog.innerText(), /EXAMPLE DATA|Example plan/);
      assert.equal(await dialog.getByRole("button", { name: /Approve|Register now/ }).count(), 0);
      assert.deepEqual(await audit(), { overflow: false, unnamedButtons: 0, duplicateIds: [] });
      if (index === 0) await page.screenshot({ path: `/tmp/cue-screen-dialog-${width}.png` });
      await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
    }
    const card = page.locator(".worker-card").first(); await card.scrollIntoViewIfNeeded(); const bounds = await card.boundingBox(); assert.ok(bounds);
    await page.mouse.move(bounds.x + 40, bounds.y + 40);
    assert.equal(await card.evaluate(node => (node as HTMLElement).style.getPropertyValue("--spot-x")), "");
    const motion = await card.evaluate(node => ({ reduced: matchMedia("(prefers-reduced-motion: reduce)").matches, overlay: getComputedStyle(node, "::before").display, transform: getComputedStyle(node).transform }));
    assert.deepEqual(motion, { reduced: true, overlay: "none", transform: "none" });
    assert.deepEqual(pageErrors, []); assert.deepEqual(assetErrors, []); assert.deepEqual(mutations, []);
    await context.close();
  });
});
