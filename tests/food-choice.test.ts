import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright-core";
import { distinguishingWords, itemMatches, pickFoodItem, searchPick, storeLooksClosed, validateFoodChoice, type FoodRequirement } from "../src/browser/food-choice";
import { researchDoorDash } from "../src/browser/doordash";
import { launchTestChrome } from "./helpers/test-chrome";
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

const generic = ["tea", "milk", "boba", "drink"];

test("word search picks the closest match and refuses a tie instead of using page order", () => {
  const items = [
    { title: "Jasmine Green Milk Tea", context: "" },
    { title: "Classic Black Milk Tea", context: "" },
    { title: "Classic Black Milk Tea Small", context: "" },
  ];
  assert.deepEqual(searchPick(items, "classic black milk tea", generic), { ok: true, index: 1, picked_by: "search" });
  // Only generic words: every item shares them, so the request is ambiguous.
  const tie = searchPick(items, "milk tea", generic);
  assert.equal(tie.ok, false); assert.match((tie as { reason: string }).reason, /more than one menu item/);
  assert.equal(searchPick(items, "matcha latte", generic).ok, false);
  // Two items that both carry every distinguishing word and differ in nothing the request said are refused.
  const twins = searchPick([{ title: "Classic Black (Hot)", context: "" }, { title: "Classic Black (Iced)", context: "" }], "classic black", generic);
  assert.equal(twins.ok, false);
});

test("one shared generic word is not a match: Classic Black boba milk tea never picks Jasmine Green Milk Tea", () => {
  const query = "Classic Black boba milk tea";
  const jasmine = { title: "Jasmine Green Milk Tea", context: "Green tea with milk and boba", unit_minor: 550 };
  assert.deepEqual(distinguishingWords(query, generic), ["classic", "black"]);
  assert.equal(itemMatches(jasmine, query, generic), false);
  assert.equal(searchPick([jasmine], query, generic).ok, false);
  assert.equal((validateFoodChoice(jasmine, request(query), { open: true }, generic) as { code: string }).code, "item_mismatch");
  // A partial distinguishing match is not enough either.
  assert.equal(itemMatches({ title: "Classic Jasmine Milk Tea", context: "" }, query, generic), false);
  const menu = [jasmine, { title: "Classic Black", context: "", unit_minor: 660 }, { title: "Brown Sugar Boba Milk", context: "", unit_minor: 700 }];
  assert.deepEqual(searchPick(menu, query, generic), { ok: true, index: 1, picked_by: "search" });
  assert.deepEqual(validateFoodChoice(menu[1], request(query), { open: true }, generic), { ok: true });
  // Without the policy's generic words every request word must match, which is stricter, never looser.
  assert.equal(itemMatches(menu[1], query), false);
});

test("a model pick of one of two equally matching items is refused like a search pick", async t => {
  setEnv(t, { ANTHROPIC_API_KEY: "synthetic-not-a-key" });
  const items = [{ title: "Classic Milk Tea", context: "" }, { title: "Taro Milk Tea", context: "" }, { title: "Jasmine Green Milk Tea", context: "" }];
  assert.equal(searchPick(items, "milk tea", generic).ok, false);
  t.mock.method(globalThis, "fetch", async () => Response.json({ id: "msg_synthetic", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "text", text: "{\"index\":0}" }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }));
  const pick = await pickFoodItem(items, request("milk tea"), undefined, generic);
  assert.deepEqual(pick, { ok: true, index: 0, picked_by: "model" });
  const check = validateFoodChoice({ ...items[0], unit_minor: 600 }, request("milk tea"), { open: true }, generic, { items, index: 0 });
  assert.equal((check as { code: string }).code, "item_ambiguous"); assert.match((check as { message: string }).message, /Classic Milk Tea; Taro Milk Tea/);
  // A unique best item still validates, and so does a model pick of it.
  assert.deepEqual(validateFoodChoice({ ...items[2], unit_minor: 650 }, request("jasmine milk tea"), { open: true }, generic, { items, index: 2 }), { ok: true });
});

test("a model pick must meet the same distinguishing-word bar", async t => {
  setEnv(t, { ANTHROPIC_API_KEY: "synthetic-not-a-key" });
  const items = [{ title: "Jasmine Green Milk Tea", context: "" }, { title: "Classic Black", context: "" }];
  t.mock.method(globalThis, "fetch", async () => Response.json({ id: "msg_synthetic", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "text", text: "{\"index\":0}" }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }));
  const pick = await pickFoodItem(items, request("Classic Black boba milk tea"), undefined, generic);
  assert.deepEqual(pick, { ok: true, index: 0, picked_by: "model" });
  assert.equal((validateFoodChoice({ ...items[0], unit_minor: 550 }, request("Classic Black boba milk tea"), { open: true }, generic) as { code: string }).code, "item_mismatch");
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
  let modelAnswer: string | undefined; // set only for the model-pick run below
  t.mock.method(globalThis, "fetch", async (resource: string | URL | Request) => {
    const url = new URL(resource instanceof Request ? resource.url : resource);
    if (modelAnswer && url.hostname === "api.anthropic.com") return Response.json({ id: "msg_synthetic", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "text", text: modelAnswer }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
    assert.equal(url.hostname, "food.synthetic.surfsky.io");
    if (url.pathname === "/profiles") return Response.json([{ uuid: "synthetic-profile", title: "oct3-food", status: "stopped" }]);
    if (url.pathname.endsWith("/start")) return Response.json({ success: true, internal_uuid: "synthetic-session", ws_url: "wss://food.synthetic.surfsky.io/cdp" });
    assert.ok(url.pathname.endsWith("/stop")); return Response.json({ success: true });
  });
  const browser = await launchTestChrome(t);
  const menu: Record<string, string> = { "Classic Black": "6.60", "Jasmine Green": "5.50", "Taro Slush": "7.10", "Classic Milk Tea": "6.00", "Taro Milk Tea": "6.20" };
  // clearing: choosing Pudding silently clears Boba, so only a final read-back of every option catches it.
  const page = (closed: boolean, clearing = false) => `<!doctype html><body>${closed ? "<p>Currently closed</p>" : ""}<input placeholder="Search by city, state, or ZIP"><label><input type="radio" name="store"><span>Boba Guys Potrero</span><span>1002 16th St, San Francisco, CA 94107</span></label><button>Confirm location</button>${Object.entries(menu).map(([name, price]) => `<button onclick="document.querySelector('#add').textContent='Add to order $${price}'">${name}</button>`).join("")}<label><input type="checkbox" id="boba"><span>Boba</span></label>${clearing ? `<label><input type="checkbox" onchange="document.querySelector('#boba').checked=false"><span>Pudding</span></label>` : ""}<label><input type="checkbox" onclick="event.preventDefault()"><span>Grass Jelly</span></label><button id="add" onclick="window.canaryAdd()">Add to order</button></body>`;
  const research = async (query: string, closed = false, modifiers?: string[], clearing = false) => {
    const context = await browser.newContext(); let cartClicks = 0;
    t.mock.method(chromium, "connectOverCDP", async () => ({ contexts: () => [{ newPage: async () => {
      const tab = await context.newPage(); await tab.exposeFunction("canaryAdd", () => { cartClicks++; });
      await tab.route("**/*", route => route.fulfill({ contentType: "text/html", body: page(closed, clearing) }));
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
  const cleared = await research("Classic Black", false, ["Boba", "Pudding"], true);
  assert.equal(cleared.options.length, 0); assert.equal(cleared.blocker_code, "merchant_changed"); assert.match(cleared.blocker!, /did not keep the requested Boba selection after all options were chosen/);
  const stuck = await research("Classic Black", false, ["Grass Jelly"]);
  assert.equal(stuck.options.length, 0); assert.equal(stuck.blocker_code, "merchant_changed"); assert.match(stuck.blocker!, /did not retain the requested Grass Jelly selection/);
  // A model pick of one of two equally matching items is refused, as the word search refuses it.
  modelAnswer = "{\"index\":3}"; process.env.ANTHROPIC_API_KEY = "synthetic-not-a-key";
  try {
    const tied = await research("milk tea");
    assert.equal(tied.options.length, 0); assert.equal(tied.blocker_code, "no_options"); assert.match(tied.blocker!, /more than one menu item equally \(Classic Milk Tea; Taro Milk Tea\)/);
  } finally { modelAnswer = undefined; delete process.env.ANTHROPIC_API_KEY; }
  const kept = await research("Classic Black boba milk tea", false, ["Boba"]);
  assert.equal(kept.options[0].title, "Classic Black"); assert.match(kept.options[0].description, /Boba \(selected and read back\)/);
});
