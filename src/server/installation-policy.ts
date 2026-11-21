// Per-installation policy: every value that differs between the people running Cue (who may
// approve live actions, spend limits, allowed merchants, food stores, defaults) lives here, never
// in a gate. The gates themselves stay deterministic code. A missing or invalid policy fails
// closed: the gates that need it refuse instead of guessing.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { AppError } from "./errors";

const hostList = z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).max(20);

const foodStoreSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  /** Pickup addresses this store serves; a request's location must match one of them. */
  pickup_addresses: z.array(z.string().trim().min(5).max(200)).min(1).max(10),
  /** DoorDash store page, read through the Browserless worker. */
  doordash_url: z.string().url().startsWith("https://www.doordash.com/store/").optional(),
  /** The merchant's own order page, read through the Surfsky worker. */
  order_url: z.string().url().startsWith("https://").optional(),
  /** Label of the store result in the order page's location picker. */
  store_label: z.string().trim().min(1).max(120).optional(),
  /** Street address the selected store result must show. */
  store_address: z.string().trim().min(5).max(200).optional(),
  /** Autocomplete suggestion to click after typing the pickup address, when the picker shows one. */
  location_suggestion: z.string().trim().min(5).max(200).optional(),
  /** Menu categories to open when the requested item is not visible at first. */
  menu_categories: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
}).strict().refine(store => store.doordash_url || (store.order_url && store.store_label && store.store_address), {
  message: "A food store needs a doordash_url, or an order_url with store_label and store_address.",
});

export const installationPolicySchema = z.object({
  version: z.literal(1),
  approval: z.object({
    /** Manager principal ids allowed to approve live actions. */
    live_approvers: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
    /** How a live action is approved. Only a verified passkey exists today. */
    live_path: z.literal("passkey"),
  }).strict(),
  spend: z.object({
    /** Largest total one wallet request may carry, in USD cents. */
    max_wallet_total_minor: z.number().int().min(1).max(10_000_000),
  }).strict(),
  /** Merchant hosts a wallet request may name, per lane. An empty list allows none. */
  merchants: z.object({ amazon: hostList, fiverr: hostList, event_tickets: hostList, food: hostList }).strict(),
  food: z.object({
    max_quantity: z.number().int().min(1).max(25),
    /** Words that say what kind of item, not which one (tea, milk, boba, drink). A request's other words must all match the item. */
    generic_words: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9]+$/)).max(100).default([]),
    stores: z.array(foodStoreSchema).max(20),
  }).strict(),
  defaults: z.object({ mission_mode: z.enum(["fixture", "live"]).optional() }).strict().default({}),
}).strict();

export type InstallationPolicy = z.infer<typeof installationPolicySchema>;
export type FoodStorePolicy = InstallationPolicy["food"]["stores"][number];
export type PolicyResult = { ok: true; policy: InstallationPolicy; source: string } | { ok: false; reason: string };

/**
 * Willder-backed source. Not connected yet: when it is, it reads the installation's
 * `cue-installation-policy` record from Willder memory and returns the parsed JSON.
 * Until then it reports the policy as missing, so every gate that needs it fails closed.
 */
export function loadPolicyFromWillder(): unknown | undefined {
  return undefined;
}

function loadPolicyFromFile(path: string): unknown | undefined {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return undefined; }
}

/**
 * Loads the installation policy, read fresh on every call so an edit applies without a restart.
 * OCT3_POLICY_SOURCE=willder selects the Willder source; otherwise OCT3_POLICY_FILE, or
 * `.cue/policy.json` in the working directory. Never throws.
 */
export function loadInstallationPolicy(): PolicyResult {
  const fromWillder = process.env.OCT3_POLICY_SOURCE === "willder";
  const source = fromWillder ? "willder" : process.env.OCT3_POLICY_FILE || join(process.cwd(), ".cue", "policy.json");
  const raw = fromWillder ? loadPolicyFromWillder() : loadPolicyFromFile(source);
  if (raw === undefined) return { ok: false, reason: `No installation policy was found (${fromWillder ? "Willder source not connected" : "set OCT3_POLICY_FILE or create .cue/policy.json"}).` };
  const parsed = installationPolicySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "The installation policy is invalid. Fix it against config/installation-policy.example.json." };
  return { ok: true, policy: parsed.data, source };
}

/** The policy, or a 503 naming the gate that refused because the policy is missing or invalid. */
export function requireInstallationPolicy(gate: string): InstallationPolicy {
  const loaded = loadInstallationPolicy();
  if (!loaded.ok) throw new AppError(503, "installation_policy_missing", `${gate} is refused: ${loaded.reason}`);
  return loaded.policy;
}

/** Normalizes an address for comparison: case, punctuation and common street suffixes. */
export function normalizeAddress(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ")
    .replace(/\bstreet\b/g, "st").replace(/\bavenue\b/g, "ave").replace(/\bboulevard\b/g, "blvd")
    .replace(/\s+/g, " ").trim();
}

/** The configured store serving this pickup location, or undefined. Exact address match after normalization. */
export function foodStoreFor(policy: InstallationPolicy, location: string): FoodStorePolicy | undefined {
  const wanted = normalizeAddress(location);
  return policy.food.stores.find(store => store.pickup_addresses.some(address => {
    const known = normalizeAddress(address);
    return wanted === known || wanted.startsWith(`${known} `);
  }));
}
