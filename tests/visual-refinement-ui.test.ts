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
    assert.equal(await page.locator(".worker-card").count(), 4);
    assert.equal(await page.locator(".worker-art svg").count(), 4);
    assert.match(await page.locator("h1").innerText(), /Hands free\.\s+In good hands\./);
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
    for (let index = 0; index < 4; index++) {
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

test("live-shaped task cards and pinned review finish entrance animation fully visible", { skip: !base }, async t => {
  const { createPreview } = await import("../src/client/preview");
  const origin = new URL(base!); assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname));
  const mission = createPreview(); mission.mission_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; mission.mode = "live"; mission.headcount = 1;
  mission.service_payment = { status: "paid", amount_minor: 50, currency: "USD", mode: "test", reference: "pi_synthetic_ui" };
  for (const task of mission.tasks) { task.id = `${mission.mission_id}:${task.lane}`; task.proposal!.task_id = task.id; task.progress = "Synthetic live-shaped review"; }
  const task = mission.tasks.find(task => task.lane === "event_tickets")!, proposal = task.proposal!;
  Object.assign(proposal, { action_type: "free_registration", action_hash: "a".repeat(64), source_url: "https://luma.com/OpenTogether", quantity: 1, total_minor: 0, subtotal_minor: 0, fees_minor: 0, expires_at: new Date(Date.now() + 600_000).toISOString() });
  const review = { proposal_id: proposal.id, revision: proposal.revision, attendee: { name: "Synthetic Attendee", email: "synthetic@example.test" }, event_title: "Synthetic free event", event_start_at: "2026-10-17T01:00:00Z", ticket_name: "Standard", source_url: proposal.source_url, total_minor: 0, expires_at: proposal.expires_at, profile_unchanged: true };
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true }); t.after(() => browser.close());
  for (const width of [1440, 390]) for (const reducedMotion of ["no-preference", "reduce"] as const) await t.test(`${width}px ${reducedMotion}`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion });
    const errors: string[] = [], mutations: string[] = [];
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url()); if (url.origin !== origin.origin) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (request.method() !== "GET") mutations.push(url.pathname);
      const body = url.pathname === "/api/auth" ? { authenticated: true, role: "manager" } : url.pathname === "/api/readiness" ? { services: [] } : url.pathname.endsWith("/registration-review") ? review : url.pathname === "/api/preferences" ? { preferences: null } : url.pathname === "/api/passkeys" ? { enrolled: true, required: true } : mission;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${origin.origin}/?mission=${mission.mission_id}&task=${encodeURIComponent(task.id)}&revision=1`);
    const dialog = page.getByRole("dialog"); await dialog.getByText("synthetic@example.test", { exact: true }).waitFor();
    await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))); });
    assert.equal(await dialog.getByRole("button", { name: "Confirm with passkey", exact: true }).isEnabled(), true);
    const states = await page.locator(".worker-card, dialog[open]").evaluateAll(nodes => nodes.map(node => ({ opacity: getComputedStyle(node).opacity, visibility: getComputedStyle(node).visibility, display: getComputedStyle(node).display, area: node.getBoundingClientRect().width * node.getBoundingClientRect().height })));
    assert.equal(states.length, 5); assert.ok(states.every(state => state.opacity === "1" && state.visibility === "visible" && state.display !== "none" && state.area > 0), JSON.stringify(states));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `/tmp/cue-screen-live-${width}-${reducedMotion}.png` });
    await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
    await page.locator(".worker-card").first().scrollIntoViewIfNeeded();
    assert.equal(await page.locator(".worker-card").first().evaluate(node => getComputedStyle(node).opacity), "1");
    await page.screenshot({ path: `/tmp/cue-screen-live-cards-${width}-${reducedMotion}.png` });
    assert.deepEqual(errors, []); assert.deepEqual(mutations, []); await context.close();
  });
});

test("final four-worker palette keeps level hero and explicit boba pickup defaults", { skip: !base }, async t => {
  const origin = new URL(base!); assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname));
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true }); t.after(() => browser.close());
  for (const width of [1440, 390]) await t.test(`${width}px final palette and food form`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" }); const errors: string[] = [], writes: string[] = [];
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url()); if (url.origin !== origin.origin) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (request.method() !== "GET") writes.push(url.pathname);
      const body = url.pathname === "/api/auth" ? { authenticated: true, role: "manager" } : url.pathname === "/api/readiness" ? { services: [] } : url.pathname === "/api/preferences" ? { preferences: null } : { mission: null, missions: [] };
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message)); await page.goto(origin.href);
    await page.getByText("Workspace access", { exact: true }).waitFor({ state: "attached" });
    assert.equal(await page.locator(".worker-card").count(), 4); assert.equal(await page.locator(".worker-art svg").count(), 4);
    assert.equal(await page.locator(".cinematic-hero").evaluate(node => getComputedStyle(node).transform), "none");
    assert.match(await page.locator("h1").innerText(), /Hands free\.\s+In good hands\./);
    await page.locator(".cue-sculpture-image").evaluate(async node => { await (node as HTMLImageElement).decode(); });
    assert.ok(await page.locator(".cue-sculpture-image").evaluate(node => (node as HTMLImageElement).naturalWidth > 0));
    assert.equal(await page.locator(".cue-sculpture-image").evaluate(node => getComputedStyle(node).animationName), "none");
    for (const node of await page.locator(".cue-shape-float").all()) assert.equal(await node.evaluate(el => getComputedStyle(el).animationName), "none");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `/tmp/cue-cinematic-independent-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "New mission", exact: true }).click(); const dialog = page.getByRole("dialog", { name: "What needs doing?" }); await dialog.waitFor();
    assert.equal(await dialog.getByLabel("Find food for this mission").isChecked(), true);
    assert.equal(await dialog.getByLabel("What sounds good?").inputValue(), "boba milk tea");
    assert.equal(await dialog.getByLabel("Fulfillment", { exact: true }).inputValue(), "pickup");
    assert.equal(await dialog.getByLabel("Quantity", { exact: true }).inputValue(), "1");
    assert.equal(await dialog.getByLabel("Search near").inputValue(), "580 20th Street, San Francisco");
    await dialog.getByText(/DoorDash menu research only/).waitFor(); await dialog.getByLabel("What sounds good?").scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `/tmp/cue-final-food-form-independent-${width}.png` });
    await page.keyboard.press("Escape"); assert.deepEqual(writes, []); assert.deepEqual(errors, []); await context.close();
  });
});
