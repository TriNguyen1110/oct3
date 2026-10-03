import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import { generateRegistrationOptions, generateAuthenticationOptions } from "@simplewebauthn/server";
import { createPreview } from "../src/client/preview";

const base = process.env.OCT3_PASSKEY_UI_URL;
test("native passkey UI enrollment never approves; cancellation sends no approval; retry binds exact proposal", { skip: !base }, async t => {
  const origin = new URL(base!); assert.equal(origin.origin, "http://localhost:3003");
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true }); t.after(() => browser.close());
  for (const width of [1440, 390]) await t.test(`${width}px synthetic native ceremony`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    const mission = createPreview(); mission.mission_id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; mission.mode = "live"; mission.service_payment.status = "paid";
    const task = mission.tasks[0], exact = { proposal_id: task.proposal!.id, revision: task.proposal!.revision };
    let enrolled = false, credentialId = "", challengeId = "", enrollmentCount = 0, approvalCount = 0, promptCount = 0;
    const errors: string[] = [], unexpected: string[] = [];
    const registration = await generateRegistrationOptions({ rpName: "Synthetic Cue only", rpID: "localhost", userName: "synthetic-ui", userID: new TextEncoder().encode("synthetic-ui-only"), authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" } });
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url()); if (url.origin !== origin.origin) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      let body: unknown;
      if (url.pathname === "/api/auth") body = { authenticated: true, role: "manager" };
      else if (url.pathname === "/api/readiness") body = { services: [] };
      else if (url.pathname === "/api/preferences") body = { preferences: null };
      else if (url.pathname === "/api/missions") body = { mission };
      else if (url.pathname.startsWith("/api/missions/")) body = mission;
      else if (url.pathname === "/api/passkeys") body = { enrolled, required: true };
      else if (url.pathname === "/api/passkeys/register/options") { assert.deepEqual(request.postDataJSON(), {}); body = { challenge_id: randomUUID(), options: registration }; }
      else if (url.pathname === "/api/passkeys/register/verify") {
        const response = request.postDataJSON().response; assert.equal(response.authenticatorAttachment, "platform"); assert.ok(response.response.attestationObject);
        credentialId = response.id; enrolled = true; enrollmentCount++; body = { verified: true };
      } else if (url.pathname === `/api/tasks/${encodeURIComponent(task.id)}/approval-options`) {
        assert.deepEqual(request.postDataJSON(), exact); challengeId = randomUUID(); promptCount++;
        body = { challenge_id: challengeId, options: await generateAuthenticationOptions({ rpID: "localhost", allowCredentials: [{ id: credentialId, transports: ["internal"] }], userVerification: "required" }) };
      } else if (url.pathname === `/api/tasks/${task.id}/approve`) {
        const sent = request.postDataJSON(); assert.equal(sent.proposal_id, exact.proposal_id); assert.equal(sent.revision, exact.revision); assert.equal(sent.passkey.challenge_id, challengeId); assert.equal(sent.passkey.response.id, credentialId); assert.ok(sent.passkey.response.response.signature);
        approvalCount++; task.approval = { ...task.approval!, state: "approved", proposal_id: exact.proposal_id, revision: exact.revision }; body = mission;
      } else { unexpected.push(`${request.method()} ${url.pathname}`); body = { error: { message: "Unexpected synthetic request" } }; }
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    const page = await context.newPage(); page.setDefaultTimeout(10000); page.on("pageerror", error => errors.push(error.message));
    const cdp = await context.newCDPSession(page); await cdp.send("WebAuthn.enable"); await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    await page.goto(origin.href); await page.getByText("Workspace access", { exact: true }).waitFor({ state: "attached" });
    await page.locator(".worker-card").first().getByRole("button", { name: "Review plan", exact: true }).click();
    const dialog = page.getByRole("dialog"), confirm = dialog.getByRole("button", { name: /Confirm with passkey/ });
    await dialog.getByRole("button", { name: "Set up a passkey", exact: true }).waitFor(); assert.equal(await confirm.isDisabled(), true);
    await dialog.getByRole("button", { name: "Set up a passkey", exact: true }).click(); await dialog.getByText("Passkey ready", { exact: true }).waitFor();
    assert.equal(enrollmentCount, 1); assert.equal(approvalCount, 0); assert.equal(await confirm.isEnabled(), true);
    await page.evaluate(() => {
      const state = window as typeof window & { syntheticOriginalGet?: CredentialsContainer["get"] }; state.syntheticOriginalGet = navigator.credentials.get.bind(navigator.credentials);
      navigator.credentials.get = async () => { throw new DOMException("Synthetic cancellation", "NotAllowedError"); };
    });
    await confirm.click(); await dialog.getByRole("alert").filter({ hasText: "cancelled or timed out" }).waitFor(); assert.equal(approvalCount, 0);
    await page.evaluate(() => { const state = window as typeof window & { syntheticOriginalGet?: CredentialsContainer["get"] }; navigator.credentials.get = state.syntheticOriginalGet!; });
    await confirm.click(); await dialog.getByText("Plan approved", { exact: true }).waitFor();
    assert.equal(approvalCount, 1); assert.equal(promptCount, 2); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `/tmp/cue-passkey-independent-${width}.png` });
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); await context.close();
  });
});
