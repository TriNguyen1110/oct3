// Food-lane research worker. The store comes from the installation policy (matched to the
// request's pickup address); the item comes from the request and the observed menu, picked by the
// model or a word search and then checked by validateFoodChoice. Only GET/HEAD/OPTIONS requests
// pass and WebSockets are closed: the worker never adds to cart, checks out or pays.
import { createHash } from "node:crypto";
import type { Locator, Page } from "playwright-core";
import type { Evidence, Option } from "../shared/contracts";
import { foodStoreFor, loadInstallationPolicy, type FoodStorePolicy } from "../server/installation-policy";
import { browserlessConfigured, solveBrowserlessChallenge, withBrowserlessPage } from "./browserless";
import { parseMenuRows, pickFoodItem, priceMinor, storeLooksClosed, validateFoodChoice, type FoodRequirement, type MenuItem } from "./food-choice";
import { BrowserIssue, withSurfskyPage } from "./surfsky";
import type { ResearchTaskInput, ResearchTaskResult } from "./types";

const id = (...parts: string[]) => createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 24);
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Buttons that are page controls, never menu items.
const controlLabel = /^(?:pickup|delivery|confirm location|update changes|add to (?:order|cart).*|checkout|sign in|search.*|menu|close|back)$/i;

function evidence(input: ResearchTaskInput, source: string, title: string, detail: string): Evidence {
  const at = new Date().toISOString();
  return { id: id(input.task_id, input.attempt_key, title, at), task_id: input.task_id, source_url: source, observed_at: at, title, detail, mode: "live", kind: "observation" };
}
const signalFor = (input: ResearchTaskInput) => AbortSignal.any([AbortSignal.timeout(Math.max(10_000, Math.min(input.timeout_ms ?? 60_000, 60_000))), ...(input.signal ? [input.signal] : [])]);
const configuration = (started: number, blocker: string, progress: string): ResearchTaskResult =>
  ({ options: [], evidence: [], blocker, blocker_code: "configuration", progress, elapsed_ms: Date.now() - started, cleanup: "not_started" });

/** This worker has no order-execution capability, even after a plan approval. */
export async function restrictFoodToReadOnly(page: Page) {
  await page.context().routeWebSocket("**/*", socket => socket.close());
  await page.context().route("**/*", route => ["GET", "HEAD", "OPTIONS"].includes(route.request().method().toUpperCase()) ? route.continue() : route.abort("blockedbyclient"));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setBypassServiceWorker", { bypass: true });
  // Retain the session for the page lifetime and apply bypass after routing setup.
}

const modifiersText = (requirement: FoodRequirement) => requirement.modifiers?.length ? requirement.modifiers.join(", ") : "none requested";

/** One option for a validated pick. Charges stay unobserved: no cart or checkout exists. */
function foodOption(input: ResearchTaskInput, requirement: FoodRequirement, store: FoodStorePolicy, source: string, item: MenuItem & { unit_minor: number }, pickedBy: "model" | "search", evidenceIds: string[], modifiersSelected: boolean): Option {
  const total = item.unit_minor * requirement.quantity;
  const price = `$${(item.unit_minor / 100).toFixed(2)}`;
  return {
    id: id(input.task_id, source, item.title, String(total)),
    title: item.title,
    description: `${store.name} showed ${item.title} at ${price} for pickup. Requested options: ${modifiersText(requirement)}${modifiersSelected ? " (selected and read back)" : " (not selected; choose them on the provider page)"}. Tax, fees, final total, availability and pickup time are not verified. This worker cannot place an order.`,
    source_url: source, merchant: store.name, amount_minor: total, currency: "USD", quantity: requirement.quantity,
    recommended: pickedBy === "model",
    reason: pickedBy === "model"
      ? "Claude picked this observed menu item for the request; price, open store and item match were then checked."
      : "Model ranking unavailable: picked by matching the request's words, then price, open store and item match were checked. Not a recommendation.",
    evidence_ids: evidenceIds,
  };
}

async function researchDoorDashMenu(input: ResearchTaskInput, requirement: FoodRequirement, store: FoodStorePolicy & { doordash_url: string }, genericWords: readonly string[], started: number): Promise<ResearchTaskResult> {
  const observations: Evidence[] = [];
  const storeUrl = new URL(store.doordash_url);
  try {
    await input.onProgress?.({ task_id: input.task_id, lane: "food", at: new Date().toISOString(), message: `Opening the ${store.name} DoorDash pickup menu.` });
    const run = await withBrowserlessPage("food", input.attempt_key, signalFor(input), input.timeout_ms ?? 60_000, async page => {
      await restrictFoodToReadOnly(page);
      const response = await page.goto(store.doordash_url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(5_000);
      const readPageSignal = async () => `${await page.title()} ${(await page.locator("body").innerText().catch(() => "")).slice(0, 4_000)}`;
      let pageSignal = await readPageSignal();
      if (/just a moment|verify you are human|captcha/i.test(pageSignal)) {
        if (await solveBrowserlessChallenge(page)) { await page.waitForTimeout(6_000); pageSignal = await readPageSignal(); }
      }
      if (response && response.status() >= 400) throw new BrowserIssue(response.status() === 403 ? "challenge" : "provider_error", `DoorDash returned HTTP ${response.status()} before the ${store.name} menu was available.`);
      const current = new URL(page.url());
      if (!/^(?:www\.)?doordash\.com$/.test(current.hostname) || current.pathname !== storeUrl.pathname) throw new BrowserIssue("merchant_changed", `DoorDash redirected away from the configured ${store.name} store.`);
      if (/just a moment|verify you are human|captcha/i.test(pageSignal)) throw new BrowserIssue("challenge", "DoorDash requires browser verification before the pickup menu can be reviewed.");
      if (!await page.getByText("Pickup", { exact: true }).first().isVisible().catch(() => false)) throw new BrowserIssue("merchant_changed", `DoorDash did not expose Pickup for ${store.name}.`);
      const open = !storeLooksClosed(pageSignal);
      const rows = [];
      for (const card of (await page.getByRole("button").all()).slice(0, 300)) {
        if (!await card.isVisible().catch(() => false)) continue;
        const text = (await card.innerText().catch(() => "")).trim();
        const price = text.match(/\$\d{1,3}(?:,\d{3})*\.\d{2}/)?.[0];
        if (!price) continue;
        const [title, ...rest] = text.split(/\n+/).map(line => line.trim()).filter(line => line && !line.startsWith("$"));
        if (title && !controlLabel.test(title)) rows.push({ title, price, context: rest.join(" ") });
      }
      const items = parseMenuRows(rows);
      if (!items.length) throw new BrowserIssue("merchant_changed", `DoorDash showed no priced menu items for ${store.name}.`);
      const pick = await pickFoodItem(items, requirement, input.signal, genericWords);
      if (!pick.ok) throw new BrowserIssue("no_options", `${pick.reason} Searched ${items.length} ${store.name} menu items for "${requirement.query}".`);
      const item = items[pick.index];
      const check = validateFoodChoice(item, requirement, { open }, genericWords);
      if (!check.ok) throw new BrowserIssue(check.code === "store_closed" ? "merchant_changed" : "no_options", check.message);
      const menuProof = evidence(input, store.doordash_url, `DoorDash ${store.name} pickup menu observed`, `DoorDash exposed Pickup and ${items.length} priced menu items. ${item.title} showed ${`$${(item.unit_minor! / 100).toFixed(2)}`}. The worker did not open modifiers, add an item to cart, checkout, or payment.`);
      observations.push(menuProof);
      return { options: [foodOption(input, requirement, store, store.doordash_url, item as MenuItem & { unit_minor: number }, pick.picked_by, [menuProof.id], false)] };
    });
    const progress = `Found ${run.value.options[0].title} on the DoorDash pickup menu. Modifiers, cart and checkout still need manager review.`;
    await input.onProgress?.({ task_id: input.task_id, lane: "food", at: new Date().toISOString(), message: progress });
    return { ...run.value, evidence: observations, progress, elapsed_ms: Date.now() - started, cleanup: run.cleanup, blocker: "DoorDash menu option prepared for review. Selecting modifiers and checkout require a manager; no food order was placed.", blocker_code: "checkout_handoff", ...(run.cleanup === "unconfirmed" ? { blocker: "Browser cleanup could not be confirmed. Reconcile the food worker before retrying.", blocker_code: "provider_error" as const } : {}) };
  } catch (error) {
    const issue = error instanceof BrowserIssue ? error : new BrowserIssue(input.signal?.aborted ? "cancelled" : "provider_error", "DoorDash pickup research could not finish.");
    observations.push(evidence(input, store.doordash_url, "DoorDash pickup needs attention", `${issue.message} No modifier, cart, checkout, order or payment action was submitted.`));
    return { options: [], evidence: observations, blocker: issue.message, blocker_code: issue.code, progress: issue.message, elapsed_ms: Date.now() - started, cleanup: issue.cleanup };
  }
}

async function researchStoreOrderPage(input: ResearchTaskInput, requirement: FoodRequirement, store: FoodStorePolicy & { order_url: string; store_label: string; store_address: string }, genericWords: readonly string[], started: number): Promise<ResearchTaskResult> {
  const observations: Evidence[] = [];
  const orderHost = new URL(store.order_url).hostname;
  try {
    await input.onProgress?.({ task_id: input.task_id, lane: "food", at: new Date().toISOString(), message: `Opening ${store.name}'s order page in the persistent food browser.` });
    const run = await withSurfskyPage("food", signalFor(input), async page => {
      await restrictFoodToReadOnly(page);
      const visible = async (locator: Locator) => {
        let fallback: Locator | undefined;
        for (const candidate of await locator.all()) {
          if (!await candidate.isVisible().catch(() => false)) continue;
          fallback ??= candidate;
          const onScreen = await candidate.evaluate(element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight; }).catch(() => false);
          if (onScreen) return candidate;
        }
        return fallback;
      };
      const waitVisible = async (locator: Locator, timeout = 8_000) => { const deadline = Date.now() + timeout; do { const candidate = await visible(locator); if (candidate) return candidate; await page.waitForTimeout(250); } while (Date.now() < deadline); return undefined; };
      // Whole-label match, so "Boba" never selects a store or item that merely contains the word.
      const wholeLabel = (name: string) => new RegExp(`^\\s*${escapeRegExp(name)}\\s*$`, "i");
      /** Reads whether a requested option is selected now, without clicking anything. */
      const modifierSelected = async (name: string) => {
        const label = wholeLabel(name);
        for (const select of await page.locator("select").all()) {
          if (!await select.isVisible().catch(() => false)) continue;
          if (await select.evaluate((node, source) => Array.from((node as HTMLSelectElement).selectedOptions).some(option => new RegExp(source, "i").test(option.label)), label.source).catch(() => false)) return true;
        }
        const control = await visible(page.getByRole("checkbox", { name: label }).or(page.getByRole("radio", { name: label })));
        if (control) return control.isChecked().catch(() => false);
        const text = await visible(page.getByText(label)); if (!text) return false;
        const field = text.locator("xpath=ancestor::label[.//input[@type='radio' or @type='checkbox']][1]").locator("input[type='radio'],input[type='checkbox']").first();
        if (await field.count()) return field.isChecked().catch(() => false);
        const semantic = text.locator("xpath=ancestor-or-self::*[@role='radio' or @role='checkbox' or @aria-pressed][1]");
        if (await semantic.count()) return ["true", "checked"].includes((await semantic.getAttribute("aria-checked") || await semantic.getAttribute("aria-pressed") || "").toLowerCase());
        return false;
      };
      const selectAndReadBack = async (name: string) => {
        const label = wholeLabel(name);
        for (const select of await page.locator("select").all()) {
          if (!await select.isVisible().catch(() => false)) continue;
          const option = await select.locator("option").evaluateAll((options, source) => options.map(node => ({ label: (node as HTMLOptionElement).label, value: (node as HTMLOptionElement).value })).find(option => new RegExp(source, "i").test(option.label)), label.source);
          if (!option) continue;
          await select.selectOption({ value: option.value });
          if (await select.inputValue() !== option.value) throw new BrowserIssue("merchant_changed", `The order page did not retain the requested ${name} selection.`);
          return;
        }
        const control = await visible(page.getByRole("checkbox", { name: label }).or(page.getByRole("radio", { name: label })));
        if (control) {
          if (!await control.isChecked()) await control.check();
          if (!await control.isChecked()) throw new BrowserIssue("merchant_changed", `The order page did not retain the requested ${name} selection.`);
          return;
        }
        const text = await waitVisible(page.getByText(label), 3_000); if (!text) throw new BrowserIssue("no_options", `The item does not offer the requested option "${name}".`);
        const semantic = text.locator("xpath=ancestor-or-self::*[@role='radio' or @role='checkbox' or @aria-pressed][1]");
        const field = text.locator("xpath=ancestor::label[.//input[@type='radio' or @type='checkbox']][1]").locator("input[type='radio'],input[type='checkbox']").first();
        if (await field.count()) {
          if (!await field.isChecked().catch(() => false)) await text.locator("xpath=ancestor::label[1]").click();
          if (!await field.isChecked().catch(() => false)) throw new BrowserIssue("merchant_changed", `The order page did not retain the requested ${name} selection.`);
          return;
        }
        if (await semantic.count()) {
          const selected = async () => ["true", "checked"].includes((await semantic.getAttribute("aria-checked") || await semantic.getAttribute("aria-pressed") || "").toLowerCase());
          if (!await selected()) await semantic.click();
          if (!await selected()) throw new BrowserIssue("merchant_changed", `The order page did not retain the requested ${name} selection.`);
          return;
        }
        throw new BrowserIssue("merchant_changed", `The requested ${name} choice has no readable selected state.`);
      };
      const menuItems = async () => {
        const items: Array<{ title: string; context: string; locator: Locator }> = [];
        for (const button of (await page.getByRole("button").all()).slice(0, 300)) {
          if (!await button.isVisible().catch(() => false)) continue;
          const title = (await button.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
          if (!title || title.length > 120 || controlLabel.test(title) || store.menu_categories.includes(title) || title === store.location_suggestion) continue;
          if (!items.some(item => item.title === title)) items.push({ title, context: "", locator: button });
        }
        return items;
      };

      const response = await page.goto(store.order_url, { waitUntil: "domcontentloaded" }); if (response && response.status() >= 400) throw new BrowserIssue(response.status() === 403 ? "challenge" : "provider_error", `${store.name}'s order page returned HTTP ${response.status()} before the menu was available.`);
      const pickup = page.getByText("Pickup", { exact: true }).first();
      const target = page.locator('input[placeholder="Search by city, state, or ZIP"],input[placeholder*="address" i],input[aria-label*="address" i]').first();
      // Wait until the page shows its pickup toggle or location picker, not a fixed time.
      await waitVisible(pickup.or(target), 5_000);
      if (new URL(page.url()).hostname !== orderHost) throw new BrowserIssue("merchant_changed", `${store.name}'s order page redirected to an unsupported host.`);
      const pickupShown = await pickup.isVisible().catch(() => false);
      if (pickupShown) await pickup.click();
      if (!(pickupShown ? await waitVisible(target, 3_000) : await target.isVisible().catch(() => false))) throw new BrowserIssue("merchant_changed", "The location picker must be open so the pickup address and selected store can be verified.");
      await target.fill(requirement.location);
      if (store.location_suggestion) {
        // Stop waiting as soon as either the address suggestion or the store result shows.
        const suggestionText = page.getByText(store.location_suggestion, { exact: true });
        await waitVisible(suggestionText.or(page.getByText(store.store_label, { exact: true })), 3_000);
        const suggestion = await visible(suggestionText); if (suggestion) await suggestion.click();
      }
      const result = await waitVisible(page.getByText(store.store_label, { exact: true }));
      if (!result) throw new BrowserIssue("merchant_changed", `The location search did not show ${store.store_label}.`);
      const tile = result.locator("xpath=ancestor::label"); const radio = tile.locator('input[type="radio"]').first();
      const tileText = (await tile.innerText().catch(() => "")).replace(/\s+/g, " ");
      if (!await radio.count() || !tileText.toLowerCase().includes(store.store_address.toLowerCase())) throw new BrowserIssue("merchant_changed", `The ${store.store_label} result did not show the configured store address and selection control.`);
      if (!await radio.isChecked().catch(() => false)) await tile.click({ position: { x: 12, y: 12 } });
      if (!await radio.isChecked().catch(() => false)) throw new BrowserIssue("merchant_changed", `The order page did not keep ${store.store_label} selected.`);
      const confirm = await waitVisible(page.getByRole("button", { name: /^(?:Confirm location|Update changes)$/ }), 3_000); if (!confirm) throw new BrowserIssue("merchant_changed", "The location picker did not expose its confirmation control."); await confirm.click();
      const open = !storeLooksClosed(await page.locator("body").innerText().catch(() => ""));

      let items = await menuItems();
      let pick = await pickFoodItem(items, requirement, input.signal, genericWords);
      for (const category of store.menu_categories) {
        if (pick.ok && validateFoodChoice({ ...items[pick.index], unit_minor: 1 }, requirement, { open: true }, genericWords).ok) break;
        const opener = await waitVisible(page.getByText(category, { exact: true }), 2_000); if (!opener) continue;
        await opener.click(); await page.waitForTimeout(500);
        items = await menuItems(); pick = await pickFoodItem(items, requirement, input.signal, genericWords);
      }
      if (!pick.ok) throw new BrowserIssue("no_options", `${pick.reason} Searched ${items.length} ${store.name} menu items for "${requirement.query}".`);
      const chosen = items[pick.index];
      const nameCheck = validateFoodChoice({ ...chosen, unit_minor: 1 }, requirement, { open: true }, genericWords);
      if (!nameCheck.ok) throw new BrowserIssue("no_options", nameCheck.message);
      await chosen.locator.click();
      await waitVisible(page.getByRole("button", { name: /Add to order/i }), 3_000);
      for (const modifier of requirement.modifiers ?? []) await selectAndReadBack(modifier);
      // A later choice can clear an earlier one (radio groups, linked options): read every one back again.
      for (const modifier of requirement.modifiers ?? []) if (!await modifierSelected(modifier)) throw new BrowserIssue("merchant_changed", `The order page did not keep the requested ${modifier} selection after all options were chosen.`);
      const add = await waitVisible(page.getByRole("button", { name: /Add to order\s+\$\d{1,3}(?:,\d{3})*\.\d{2}/i }), 3_000);
      const unit = add ? priceMinor(await add.innerText()) : null;
      const check = validateFoodChoice({ title: chosen.title, context: chosen.context, unit_minor: unit }, requirement, { open }, genericWords);
      if (!check.ok) throw new BrowserIssue(check.code === "store_closed" ? "merchant_changed" : check.code === "price_missing" ? "merchant_changed" : "no_options", check.message);
      const price = `$${(unit! / 100).toFixed(2)}`;
      const storeProof = evidence(input, store.order_url, `${store.name} pickup store and item observed`, `The page showed ${store.store_label} at ${store.store_address} with its selection control checked, then the ${chosen.title} form. Requested options read back: ${modifiersText(requirement)}. It showed "Add to order ${price}" without activating it. No cart or checkout is claimed.`);
      observations.push(storeProof);
      return { options: [foodOption(input, requirement, store, store.order_url, { title: chosen.title, context: chosen.context, unit_minor: unit! }, pick.picked_by, [storeProof.id], Boolean(requirement.modifiers?.length))] };
    });
    const message = `Observed ${run.value.options[0].title} at ${store.name} with a $${(run.value.options[0].amount_minor / requirement.quantity / 100).toFixed(2)} item estimate. Confirm the store and options; no cart or checkout was prepared.`;
    await input.onProgress?.({ task_id: input.task_id, lane: "food", at: new Date().toISOString(), message });
    return { ...run.value, evidence: observations, progress: message, elapsed_ms: Date.now() - started, cleanup: run.cleanup, blocker: "Drink options prepared for review. Final checkout needs manager verification. Automatic food ordering is not implemented.", blocker_code: "checkout_handoff", ...(run.cleanup === "unconfirmed" ? { blocker: "Browser cleanup could not be confirmed. Reconcile the food worker before retrying.", blocker_code: "provider_error" as const } : {}) };
  } catch (error) {
    const issue = error instanceof BrowserIssue ? error : new BrowserIssue(input.signal?.aborted ? "cancelled" : "provider_error", `${store.name} pickup preparation could not finish.`);
    observations.push(evidence(input, store.order_url, `${store.name} pickup needs attention`, `${issue.message} No checkout, order or payment action was submitted.`));
    return { options: [], evidence: observations, blocker: issue.message, blocker_code: issue.code, progress: issue.message, elapsed_ms: Date.now() - started, cleanup: issue.cleanup };
  }
}

export async function researchDoorDash(input: ResearchTaskInput): Promise<ResearchTaskResult> {
  const started = Date.now();
  if (input.lane !== "food" || !("query" in input.requirements)) return configuration(started, "Food research requires a query, fulfillment mode, location and quantity.", "Food requirements are incomplete.");
  const requirement = input.requirements;
  const loaded = loadInstallationPolicy();
  if (!loaded.ok) return configuration(started, `The food worker is off: ${loaded.reason}`, "Configure food stores in the installation policy.");
  if (requirement.quantity > loaded.policy.food.max_quantity) return configuration(started, `This installation's food worker supports up to ${loaded.policy.food.max_quantity} item${loaded.policy.food.max_quantity === 1 ? "" : "s"} per request.`, "Lower the food quantity.");
  if (requirement.fulfillment !== "pickup") return configuration(started, "The food worker supports pickup only.", "Choose pickup for the food worker.");
  const store = foodStoreFor(loaded.policy, requirement.location);
  if (!store) return configuration(started, "No configured food store serves this pickup address. Add the store to the installation policy.", "Use a pickup address a configured store serves.");
  if (browserlessConfigured() && store.doordash_url) return researchDoorDashMenu(input, requirement, { ...store, doordash_url: store.doordash_url }, loaded.policy.food.generic_words, started);
  if (store.order_url && store.store_label && store.store_address) return researchStoreOrderPage(input, requirement, { ...store, order_url: store.order_url, store_label: store.store_label, store_address: store.store_address }, loaded.policy.food.generic_words, started);
  return configuration(started, `${store.name} has no page this worker can read here. Configure Browserless for its DoorDash page, or add its order page to the policy.`, "Configure a readable page for this store.");
}
