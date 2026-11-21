import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { installationPolicySchema } from "../src/server/installation-policy";

for (const [name, path] of [["example policy", "../config/installation-policy.example.json"], ["test fixture policy", "./fixtures/installation-policy.json"]] as const) {
  test(`the ${name} parses and every food store's page host is an allowed food merchant`, async () => {
    const policy = installationPolicySchema.parse(JSON.parse(await readFile(new URL(path, import.meta.url), "utf8")));
    for (const store of policy.food.stores) {
      for (const url of [store.order_url, store.doordash_url]) {
        if (url) assert.ok(policy.merchants.food.includes(new URL(url).hostname), `${store.id}: ${new URL(url).hostname} is missing from merchants.food`);
      }
    }
  });
}
