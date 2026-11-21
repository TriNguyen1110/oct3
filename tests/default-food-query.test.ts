import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { equalRival, searchPick, validateFoodChoice } from "../src/browser/food-choice";
import { defaultInput } from "../src/client/preview";
import { installationPolicySchema } from "../src/server/installation-policy";

// Shaped like the example store's order page (titles only) and its DoorDash menu (title + description).
const orderPage = ["Classic Black", "Jasmine Green", "Hojicha", "Strawberry Matcha Latte", "Taro", "Brown Sugar Boba Milk", "Classic Milk Tea", "Build Your Drink"].map(title => ({ title, context: "" }));
const doordash = [
  { title: "Classic Black", context: "Black milk tea with boba" },
  { title: "Jasmine Green", context: "Green milk tea with boba" },
  { title: "Thai Iced Tea", context: "Black tea, condensed milk" },
  { title: "Classic Milk Tea", context: "House milk tea" },
];

test("the board's default food query names exactly one item on a menu shaped like the example store's", async () => {
  const policy = installationPolicySchema.parse(JSON.parse(await readFile(new URL("../config/installation-policy.example.json", import.meta.url), "utf8")));
  const query = defaultInput.requirements.food.query;
  for (const menu of [orderPage, doordash]) {
    const pick = searchPick(menu, query, policy.food.generic_words);
    assert.ok(pick.ok, JSON.stringify(pick));
    assert.equal(menu[pick.index].title, "Classic Black");
    assert.equal(equalRival(menu, pick.index, query, policy.food.generic_words), undefined);
    assert.deepEqual(validateFoodChoice({ ...menu[pick.index], unit_minor: 660 }, { ...defaultInput.requirements.food }, { open: true }, policy.food.generic_words, { items: menu, index: pick.index }), { ok: true });
  }
  // The food form's own default matches the board preview's.
  const form = await readFile(new URL("../components/food-mission-fields.tsx", import.meta.url), "utf8");
  assert.ok(form.includes(`defaultFoodRequest: FoodRequest = { query: ${JSON.stringify(query)}`));
});
