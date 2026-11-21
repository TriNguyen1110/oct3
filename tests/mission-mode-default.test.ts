import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { defaultMissionMode } from "../src/server/installation-policy";

function setEnv(t: { after: (fn: () => void) => void }, changes: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(changes)) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
}

test("the policy's defaults.mission_mode sets new missions' mode; OCT3_DEMO_MODE only moves it to fixtures", async t => {
  const directory = await mkdtemp(join(tmpdir(), "cue-mission-mode-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const policy = JSON.parse(await readFile(new URL("./fixtures/installation-policy.json", import.meta.url), "utf8"));
  const write = async (name: string, defaults?: unknown) => { const file = join(directory, name); await writeFile(file, JSON.stringify(defaults === undefined ? policy : { ...policy, defaults })); return file; };
  const fixture = await write("fixture.json", { mission_mode: "fixture" }), live = await write("live.json", { mission_mode: "live" }), none = await write("none.json");
  setEnv(t, { OCT3_DEMO_MODE: undefined, OCT3_POLICY_FILE: undefined });
  const cases: Array<[string | undefined, string, "fixture" | "live"]> = [
    [undefined, fixture, "fixture"], [undefined, live, "live"], [undefined, none, "live"], [undefined, join(directory, "absent.json"), "live"],
    ["true", fixture, "fixture"], ["true", live, "fixture"], ["true", none, "fixture"],
    ["false", fixture, "fixture"], ["false", live, "live"],
  ];
  for (const [demo, file, expected] of cases) {
    if (demo === undefined) delete process.env.OCT3_DEMO_MODE; else process.env.OCT3_DEMO_MODE = demo;
    process.env.OCT3_POLICY_FILE = file;
    assert.equal(defaultMissionMode(), expected, `${demo} ${file}`);
  }
});
