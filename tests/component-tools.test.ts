import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { chromium, type Page } from "playwright-core";
import { createComponentTools } from "../src/browser/component-tools";
import type { ComponentPolicy } from "../src/browser/components";

// Real local DOM only: no merchant page, remote browser or model request.
const origin = "https://component-fixture.test";
function toolsFor(page: Page, policy: Partial<ComponentPolicy> = {}) {
  const tools = createComponentTools(page, { task_id: "local-fixture", allowedOrigins: [origin], ...policy });
  const invoke = async (name: keyof typeof tools, input: unknown = {}) => {
    const execute = tools[name].execute as (input: unknown, options: unknown) => Promise<any>;
    return execute(input, { toolCallId: "independent-verifier", messages: [] });
  };
  return { tools, invoke };
}

test("component tools enforce bounded preparation against an actual local DOM", async t => {
  const executablePath = process.env.OCT3_TEST_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!existsSync(executablePath)) return t.skip("Set OCT3_TEST_CHROME_PATH to an installed Chromium browser for the local-DOM checks.");
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  await context.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Local verifier fixture</title><body></body>" }));
  async function freshPage(html: string) { const page = await context.newPage(); await page.goto(origin); await page.setContent(html); return page; }

  await t.test("default policy and explicit read-only forbid mutation; no final-submit tool exists", async () => {
    const page = await freshPage('<label>Project<input id="project"></label>');
    const base = toolsFor(page);
    assert.deepEqual(Object.keys(base.tools).sort(), ["fill_task_component", "inspect_task_page", "plan_task_fields", "verify_prepared_task"]);
    for (const policy of [{}, { readOnly: true, allowedFields: [{ id: "project" }] }]) {
      const { invoke } = toolsFor(page, policy);
      const inspection = await invoke("inspect_task_page");
      const plan = await invoke("plan_task_fields", { snapshot_id: inspection.snapshot.snapshot_id, fields: [{ id: "project", value: "Prepared" }] });
      assert.equal(plan.blocked.length, 1);
      const fill = await invoke("fill_task_component", { snapshot_id: inspection.snapshot.snapshot_id, control_id: inspection.snapshot.controls[0].control_id, value: "Prepared" });
      assert.equal(fill.code, "field_not_allowed");
      assert.equal(await page.locator("#project").inputValue(), "");
    }
    await page.close();
  });

  await t.test("readOnly defaults true even with an allowlist", async () => {
    const page = await freshPage('<label>Project<input id="project"></label>');
    const { invoke } = toolsFor(page, { allowedFields: [{ id: "project" }] });
    const { snapshot } = await invoke("inspect_task_page");
    const plan = await invoke("plan_task_fields", { snapshot_id: snapshot.snapshot_id, fields: [{ id: "project", value: "Prepared" }] });
    assert.equal(plan.blocked.length, 1, "A policy must explicitly opt into writes, even when an allowlist is present");
    await page.close();
  });

  await t.test("sensitive controls are excluded, exact target conjunction enforced, and origin checked", async () => {
    const page = await freshPage('<label>Project<input id="project" value="PRIVATE EXISTING VALUE"></label><label>Notes<input id="notes"></label><label>Password<input id="pw" type="password" required></label><label>Card number<input id="card" autocomplete="cc-number" required></label><label>Agree to terms<input type="checkbox" id="terms" required></label><button type="submit">Buy now</button>');
    const { invoke } = toolsFor(page, { readOnly: false, allowedFields: [{ id: "project", label_exact: "Notes" }, { label_exact: "Note" }, { id: "pw" }, { id: "card" }, { id: "terms" }] });
    const inspected = await invoke("inspect_task_page");
    assert.deepEqual(inspected.snapshot.controls.map((x: any) => x.id), ["project", "notes"]);
    assert.equal(inspected.snapshot.excluded_required_count, 3);
    assert.doesNotMatch(JSON.stringify(inspected), /PRIVATE EXISTING VALUE/);
    const plan = await invoke("plan_task_fields", { snapshot_id: inspected.snapshot.snapshot_id, fields: [{ id: "project", value: "new" }, { id: "notes", value: "new" }] });
    assert.equal(plan.blocked.length, 2);
    const verified = await invoke("verify_prepared_task", { snapshot_id: inspected.snapshot.snapshot_id });
    assert.equal(verified.fields_ready, false);
    await page.goto("https://component-fixture.test.attacker.test");
    assert.equal((await invoke("inspect_task_page")).code, "wrong_origin");
    await page.close();
  });

  await t.test("duplicate labels require unique controls and an exact planned value", async () => {
    const page = await freshPage('<label>Name<input id="first"></label><label>Name<input id="second"></label>');
    const { invoke } = toolsFor(page, { readOnly: false, allowedFields: [{ label_exact: "Name" }] });
    const { snapshot } = await invoke("inspect_task_page");
    const ambiguous = await invoke("plan_task_fields", { snapshot_id: snapshot.snapshot_id, fields: [{ label_exact: "Name", value: "Alice" }] });
    assert.equal(ambiguous.ambiguous.length, 1);
    assert.equal(ambiguous.planned.length, 0);
    const control_id = snapshot.controls[1].control_id;
    await invoke("plan_task_fields", { snapshot_id: snapshot.snapshot_id, fields: [{ control_id, value: "Alice" }] });
    assert.equal((await invoke("fill_task_component", { snapshot_id: snapshot.snapshot_id, control_id, value: "Bob" })).code, "value_not_planned");
    assert.equal((await invoke("fill_task_component", { snapshot_id: snapshot.snapshot_id, control_id, value: "Alice" })).verified, true);
    assert.equal(await page.locator("#first").inputValue(), "");
    assert.equal(await page.locator("#second").inputValue(), "Alice");
    await page.close();
  });

  await t.test("conditional fields invalidate the old snapshot and require a new plan", async () => {
    const page = await freshPage('<label>Delivery<select id="delivery" required><option value="">Choose</option><option>Courier</option></select></label><div id="conditional"></div><script>document.querySelector("select").addEventListener("change",()=>document.querySelector("#conditional").innerHTML="<label>Instructions<input id=details required></label>")</script>');
    const { invoke } = toolsFor(page, { readOnly: false, allowedFields: [{ id: "delivery" }, { id: "details" }] });
    const { snapshot } = await invoke("inspect_task_page");
    await invoke("plan_task_fields", { snapshot_id: snapshot.snapshot_id, fields: [{ id: "delivery", value: "Courier" }] });
    const filled = await invoke("fill_task_component", { snapshot_id: snapshot.snapshot_id, control_id: snapshot.controls[0].control_id, value: "Courier" });
    assert.equal(filled.replan_required, true);
    assert.equal((await invoke("verify_prepared_task", { snapshot_id: snapshot.snapshot_id })).code, "stale_snapshot");
    const current = (await invoke("inspect_task_page")).snapshot;
    assert.equal((await invoke("verify_prepared_task", { snapshot_id: current.snapshot_id })).fields_ready, false);
    await invoke("plan_task_fields", { snapshot_id: current.snapshot_id, fields: [{ id: "delivery", value: "Courier" }, { id: "details", value: "Reception" }] });
    const details = current.controls.find((x: any) => x.id === "details");
    assert.equal((await invoke("fill_task_component", { snapshot_id: current.snapshot_id, control_id: details.control_id, value: "Reception" })).verified, true);
    const result = await invoke("verify_prepared_task", { snapshot_id: current.snapshot_id });
    assert.equal(result.fields_ready, true);
    assert.equal(result.checkout_ready, false);
    assert.equal(result.purchase_confirmed, false);
    await page.locator("#details").fill("Changed externally");
    assert.equal((await invoke("verify_prepared_task", { snapshot_id: current.snapshot_id })).fields_ready, false);
    await page.close();
  });

  await t.test("checkbox set/readback is idempotent and can explicitly clear", async () => {
    const page = await freshPage('<label>Include printed copy<input id="copy" type="checkbox"></label>');
    const { invoke } = toolsFor(page, { readOnly: false, allowedFields: [{ id: "copy", kind: "checkbox" }] });
    const { snapshot } = await invoke("inspect_task_page");
    const control_id = snapshot.controls[0].control_id;
    await invoke("plan_task_fields", { snapshot_id: snapshot.snapshot_id, fields: [{ control_id, value: true }] });
    assert.equal((await invoke("fill_task_component", { snapshot_id: snapshot.snapshot_id, control_id, value: true })).changed, true);
    assert.equal((await invoke("fill_task_component", { snapshot_id: snapshot.snapshot_id, control_id, value: true })).changed, false);
    assert.equal(await page.locator("#copy").isChecked(), true);
    await invoke("plan_task_fields", { snapshot_id: snapshot.snapshot_id, fields: [{ control_id, value: false }] });
    assert.equal((await invoke("fill_task_component", { snapshot_id: snapshot.snapshot_id, control_id, value: false })).verified, true);
    assert.equal(await page.locator("#copy").isChecked(), false);
    await page.close();
  });
});
