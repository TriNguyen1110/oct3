import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { POST } from "../app/api/missions/route";
import { getRecord } from "../src/server/store";
import { defaultInput } from "../src/client/preview";

function setEnv(t: { after: (fn: () => void) => void }, changes: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(changes)) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
}

test("the missions route gives a request without a mode the installation's default mode", async t => {
  const directory = await mkdtemp(join(tmpdir(), "cue-route-mode-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  setEnv(t, { OCT3_STATE_PATH: join(directory, "state.json"), SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined, VERCEL: undefined, OCT3_DEMO_MODE: undefined,
    OCT3_MANAGER_TOKEN: "synthetic-route-mode-manager", OCT3_AGENT_TOKEN: undefined, ANTHROPIC_API_KEY: undefined, STRIPE_SECRET_KEY: undefined, STRIPE_PROFILE_ID: undefined, MPP_SECRET_KEY: undefined, OCT3_POLICY_FILE: undefined });
  t.mock.method(globalThis, "fetch", () => { throw new Error("route mode tests must not access the network"); });
  const policy = JSON.parse(await readFile(new URL("./fixtures/installation-policy.json", import.meta.url), "utf8"));
  const { food: _food, ...requirements } = defaultInput.requirements;
  const body = { ...structuredClone(defaultInput), requirements: { ...requirements, event_tickets: { ...requirements.event_tickets, event_url: "https://luma.com/OpenTogether" } } };
  let sequence = 0;
  const submit = async (missionMode: "fixture" | "live", demo?: string) => {
    const file = join(directory, `${missionMode}-${++sequence}.json`); await writeFile(file, JSON.stringify({ ...policy, defaults: { mission_mode: missionMode } }));
    process.env.OCT3_POLICY_FILE = file;
    if (demo === undefined) delete process.env.OCT3_DEMO_MODE; else process.env.OCT3_DEMO_MODE = demo;
    const response = await POST(new Request("http://localhost:3003/api/missions", { method: "POST", headers: { authorization: "Bearer synthetic-route-mode-manager", "content-type": "application/json", "Idempotency-Key": `route-mode-${sequence}-0001` }, body: JSON.stringify(body) }));
    const json = await response.json();
    const id = json.mission_id ?? json.mission?.mission_id;
    assert.ok(id, JSON.stringify(json).slice(0, 300));
    return (await getRecord(id, "oct3-demo")).view.mode;
  };
  assert.equal(await submit("fixture"), "fixture");
  assert.equal(await submit("live"), "live");
  assert.equal(await submit("live", "true"), "fixture");
});
