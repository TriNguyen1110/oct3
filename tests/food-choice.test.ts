import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright-core";
import { pickFoodItem, searchPick, storeLooksClosed, validateFoodChoice, type FoodRequirement } from "../src/browser/food-choice";
import { researchDoorDash } from "../src/browser/doordash";
import type { ResearchTaskInput } from "../src/browser/types";

const request = (query: string, extra: Partial<FoodRequirement> = {}): FoodRequirement => ({ query, fulfillment: "pickup", location: "580 20th Street, San Francisco", quantity: 1, ...extra });

function setEnv(t: { after: (fn: () => void) => void }, changes: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(changes)) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
}

test("validateFoodChoice refuses a missing price, a closed store and an item that does not match", () => {
  const item = { title: "Jasmine Green", context: "Green milk tea", unit_minor: 550 };
  assert.deepEqual(validateFoodChoice(item, request("jasmine green tea"), { open: true }), { ok: true });
  assert.equal((validateFoodChoice({ ...item, unit_minor: null }, request("jasmine green tea"), { open: true }) as { code: string }).code, "price_missing");
  assert.equal((validateFoodChoice({ ...item, unit_minor: 0 }, request("jasmine green tea"), { open: true }) as { code: string }).code, "price_missing");
  assert.equal((validateFoodChoice(item, request("jasmine green tea"), { open: false }) as { code: string }).code, "store_closed");
  assert.equal((validateFoodChoice(item, request("matcha latte"), { open: true }) as { code: string }).code, "item_mismatch");
  // Words about how or where never count as a match.
  assert.equal((validateFoodChoice(item, request("pickup order please"), { open: true }) as { code: string }).code, "item_mismatch");
});

test("store closed wording is detected", () => {
  assert.equal(storeLooksClosed("Boba Guys · Currently closed · Opens at 11 AM"), true);
  assert.equal(storeLooksClosed("Boba Guys · Pickup · Menu"), false);
});

test("word search picks the best match and breaks ties by page order, never by price", () => {
  const items = [
    { title: "Jasmine Green Milk Tea", context: "" },
    { title: "Classic Black Milk Tea", context: "" },
    { title: "Classic Black Milk Tea Small", context: "" },
  ];
  assert.deepEqual(searchPick(items, "classic black milk tea"), { ok: true, index: 1, picked_by: "search" });
  assert.deepEqual(searchPick(items, "milk tea"), { ok: true, index: 0, picked_by: "search" });
  assert.equal(searchPick(items, "matcha latte").ok, false);
});

test("the model picks by index, and a failed or out-of-range answer falls back to the word search", async t => {
  setEnv(t, { ANTHROPIC_API_KEY: "synthetic-not-a-key" });
  const items = [{ title: "Jasmine Green", context: "Green milk tea" }, { title: "Taro Slush", context: "Blended taro" }];
  const reply = (text: string) => Response.json({ id: "msg_synthetic", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
  let answer = "{\"index\":1}";
  const fetchMock = t.mock.method(globalThis, "fetch", async () => answer === "fail" ? Promise.reject(new Error("synthetic network failure")) : reply(answer));
  assert.deepEqual(await pickFoodItem(items, request("something cold and purple, taro")), { ok: true, index: 1, picked_by: "model" });
  answer = "{\"index\":7}";
  assert.deepEqual(await pickFoodItem(items, request("taro slush")), { ok: true, index: 1, picked_by: "search" });
  answer = "{\"index\":null}";
  assert.equal((await pickFoodItem(items, request("taro slush"))).ok, false);
  answer = "fail";
  assert.deepEqual(await pickFoodItem(items, request("jasmine green")), { ok: true, index: 0, picked_by: "search" });
  assert.ok(fetchMock.mock.callCount() >= 4);
  for (const call of fetchMock.mock.calls) assert.match(String(call.arguments[0] instanceof Request ? call.arguments[0].url : call.arguments[0]), /^https:\/\/api\.anthropic\.com\//);
});

test("food worker refuses requests the installation policy does not cover, before opening a browser", async t => {
  setEnv(t, { BROWSERLESS_TOKEN: undefined, SURFSKY_API_KEY: undefined, ANTHROPIC_API_KEY: undefined });
  t.mock.method(globalThis, "fetch", () => { throw new Error("no network for configuration checks"); });
  const run = (food: Partial<FoodRequirement>) => researchDoorDash({ task_id: "synthetic-food", lane: "food", requirements: request("Classic Black", food), deadline: "2026-10-04", budget_minor: 1000, attempt_key: "synthetic-config" });
  for (const [food, pattern] of [
    [{ quantity: 2 }, /up to 1 item/],
    [{ fulfillment: "delivery" as const }, /pickup only/],
    [{ location: "1 Unknown Road, Nowhere" }, /No configured food store/],
  ] as const) {
    const result = await run(food);
    assert.equal(result.options.length, 0); assert.equal(result.blocker_code, "configuration"); assert.match(result.blocker!, pattern);
    assert.equal(result.cleanup, "not_started");
  }
  await t.test("a missing policy turns the food worker off", async t2 => {
    setEnv(t2, { OCT3_POLICY_FILE: "/nonexistent/cue-policy.json" });
    const result = await run({});
    assert.equal(result.blocker_code, "configuration"); assert.match(result.blocker!, /food worker is off/);
  });
});

test("the order page worker returns the drink the request names, at the price the page shows", async t => {
  setEnv(t, { SURFSKY_API_KEY: "synthetic-provider", SURFSKY_API_BASE_URL: "https://food.synthetic.surfsky.io", BROWSERLESS_TOKEN: undefined, ANTHROPIC_API_KEY: undefined });
  t.mock.method(globalThis, "fetch", async (resource: string | URL | Request) => {
    const url = new URL(resource instanceof Request ? resource.url : resource); assert.equal(url.hostname, "food.synthetic.surfsky.io");
    if (url.pathname === "/profiles") return Response.json([{ uuid: "synthetic-profile", title: "oct3-food", status: "stopped" }]);
    if (url.pathname.endsWith("/start")) return Response.json({ success: true, internal_uuid: "synthetic-session", ws_url: "wss://food.synthetic.surfsky.io/cdp" });
    assert.ok(url.pathname.endsWith("/stop")); return Response.json({ success: true });
  });
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true }); t.after(() => browser.close());
  const menu: Record<string, string> = { "Classic Black": "6.60", "Jasmine Green": "5.50", "Taro Slush": "7.10" };
  const page = (closed: boolean) => `<!doctype html><body>${closed ? "<p>Currently closed</p>" : ""}<input placeholder="Search by city, state, or ZIP"><label><input type="radio" name="store"><span>Boba Guys Potrero</span><span>1002 16th St, San Francisco, CA 94107</span></label><button>Confirm location</button>${Object.entries(menu).map(([name, price]) => `<button onclick="document.querySelector('#add').textContent='Add to order $${price}'">${name}</button>`).join("")}<label><input type="checkbox"><span>Boba</span></label><button id="add" onclick="window.canaryAdd()">Add to order</button></body>`;
  const research = async (query: string, closed = false, modifiers?: string[]) => {
    const context = await browser.newContext(); let cartClicks = 0;
    t.mock.method(chromium, "connectOverCDP", async () => ({ contexts: () => [{ newPage: async () => {
      const tab = await context.newPage(); await tab.exposeFunction("canaryAdd", () => { cartClicks++; });
      await tab.route("**/*", route => route.fulfill({ contentType: "text/html", body: page(closed) }));
      return tab;
    } }], close: async () => {} }));
    const input: ResearchTaskInput = { task_id: "synthetic-food", lane: "food", requirements: request(query, modifiers ? { modifiers } : {}), deadline: "2026-10-04", budget_minor: 1000, attempt_key: `synthetic-${query}`, timeout_ms: 30000 };
    const result = await researchDoorDash(input);
    await context.close();
    assert.equal(cartClicks, 0);
    return result;
  };
  const jasmine = await research("Jasmine Green milk tea");
  assert.equal(jasmine.options.length, 1, jasmine.blocker); assert.equal(jasmine.options[0].title, "Jasmine Green"); assert.equal(jasmine.options[0].amount_minor, 550);
  assert.equal(jasmine.options[0].recommended, false); assert.match(jasmine.options[0].reason, /Model ranking unavailable/);
  const taro = await research("taro slush", false, ["Boba"]);
  assert.equal(taro.options[0].title, "Taro Slush"); assert.equal(taro.options[0].amount_minor, 710);
  assert.match(taro.options[0].description, /Boba \(selected and read back\)/);
  const missing = await research("matcha latte");
  assert.equal(missing.options.length, 0); assert.equal(missing.blocker_code, "no_options");
  const closed = await research("Classic Black");
  assert.equal(closed.options[0].amount_minor, 660);
  const shut = await research("Classic Black", true);
  assert.equal(shut.options.length, 0); assert.match(shut.blocker!, /not open/);
  const noModifier = await research("Classic Black", false, ["Oat milk"]);
  assert.equal(noModifier.options.length, 0); assert.match(noModifier.blocker!, /does not offer the requested option "Oat milk"/);
});
