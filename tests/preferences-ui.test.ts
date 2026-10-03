import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright-core";

const base = process.env.OCT3_PROFILE_UI_URL;
test("saved-profile UI never reports success after edits, rejected saves or reload failures", { skip: !base }, async t => {
  const origin = new URL(base!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname));
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  let profile = { name: "Synthetic Attendee", email: "synthetic@example.test", company: "Synthetic Company", role: "Synthetic Role" };
  let saveMode = "fail", reloadFails = false, writes = 0;
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin.origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    let status = 200, body: unknown;
    if (url.pathname === "/api/auth") body = { authenticated: true, role: "manager" };
    else if (url.pathname === "/api/readiness") body = { services: [] };
    else if (url.pathname === "/api/missions") body = { mission: null, missions: [] };
    else if (url.pathname === "/api/preferences") {
      if (route.request().method() === "PUT") {
        writes++;
        if (saveMode === "fail") { status = 503; body = { error: { message: "Synthetic save unavailable" } }; }
        else if (saveMode === "unconfirmed") body = { profile_ref: "manager", preferences: null, updated_at: null, storage: "supabase" };
        else { profile = route.request().postDataJSON(); body = { profile_ref: "manager", preferences: profile, updated_at: "2026-10-03T12:00:00Z", storage: "supabase" }; }
      } else if (reloadFails) { status = 503; body = { error: { message: "Synthetic reload unavailable" } }; }
      else body = { profile_ref: "manager", preferences: profile, updated_at: "2026-10-03T12:00:00Z", storage: "supabase" };
    } else { status = 404; body = { error: { message: "Unexpected synthetic route" } }; }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(origin.href);
  await page.getByText("Workspace access", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Saved profile", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Saved profile" });
  await dialog.getByText("Saved in Supabase", { exact: true }).waitFor();
  await dialog.getByLabel("Name", { exact: true }).fill("Edited Synthetic Attendee");
  assert.equal(await dialog.getByText("Saved in Supabase", { exact: true }).count(), 0);
  await dialog.getByRole("button", { name: "Save profile", exact: true }).click();
  await dialog.getByRole("alert").filter({ hasText: "Synthetic save unavailable" }).waitFor();
  assert.equal(await dialog.getByText("Saved in Supabase", { exact: true }).count(), 0);
  assert.equal(await dialog.getByLabel("Name", { exact: true }).inputValue(), "Edited Synthetic Attendee");
  saveMode = "unconfirmed";
  await dialog.getByRole("button", { name: "Save profile", exact: true }).click();
  await dialog.getByRole("alert").filter({ hasText: "Save could not be confirmed" }).waitFor();
  assert.equal(await dialog.getByText("Saved in Supabase", { exact: true }).count(), 0);
  saveMode = "success";
  await dialog.getByRole("button", { name: "Save profile", exact: true }).click();
  await dialog.getByText("Saved in Supabase", { exact: true }).waitFor();
  reloadFails = true;
  await dialog.getByRole("button", { name: "Reload saved profile", exact: true }).click();
  await dialog.getByRole("alert").filter({ hasText: "Synthetic reload unavailable" }).waitFor();
  assert.equal(await dialog.getByText("Saved in Supabase", { exact: true }).count(), 0);
  assert.equal(writes, 3);
});
