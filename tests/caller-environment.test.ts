import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

test("caller launcher inherits only allowed runtime and caller credentials", async t => {
  const directory = await mkdtemp(join(tmpdir(), "cue-caller-env-verifier-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const marker = join(directory, "checked.json");
  const denied = [
    "STRIPE_SECRET_KEY", "STRIPE_PROFILE_ID", "STRIPE_PUBLISHABLE_KEY", "SURFSKY_API_KEY", "SURFSKY_API_TOKEN",
    "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "DATABASE_URL", "MPP_SECRET_KEY",
    "OCT3_MANAGER_TOKEN", "UNKNOWN_FUTURE_SECRET", "PAYMENT_AUTHORIZATION", "OCT3_PAYMENT_AUTHORIZATION",
    "STRIPE_PAYMENT_AUTHORIZATION", "NODE_OPTIONS",
  ];
  const allowed = {
    HOME: directory, PATH: `${directory}:${dirname(process.execPath)}:/usr/bin:/bin`, SHELL: "/bin/zsh",
    ANTHROPIC_API_KEY: "synthetic-caller-anthropic", CLAUDE_CODE_OAUTH_TOKEN: "synthetic-caller-oauth",
    OCT3_AGENT_TOKEN: "synthetic-caller-agent", OCT3_BASE_URL: "https://cue.synthetic.test",
    LANG: "en_US.UTF-8", TERM: "xterm-256color",
  };
  const fake = `#!${process.execPath}
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const denied = ${JSON.stringify(denied)};
fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ inheritedKeys: Object.keys(process.env).sort(), blockedPresent: denied.filter(key => key in process.env) }));
for (const key of denied) assert.equal(process.env[key], undefined, key + " escaped into caller environment");
const allowed = ${JSON.stringify(allowed)};
for (const [key, value] of Object.entries(allowed)) assert.equal(process.env[key], value, key + " missing/changed");
// macOS inserts its text-encoding runtime metadata when launching the child.
assert.deepEqual(Object.keys(process.env).filter(key => key !== "__CF_USER_TEXT_ENCODING").sort(), Object.keys(allowed).sort());
assert.ok(path.basename(process.cwd()).startsWith("oct3-caller-"));
const args = process.argv.slice(2);
assert.ok(args.includes("--strict-mcp-config"));
assert.equal(args[args.indexOf("--tools") + 1], "");
assert.equal(args[args.indexOf("--allowedTools") + 1], "mcp__oct3__submit_mission,mcp__oct3__mission_status,mcp__oct3__list_missions");
fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ passed: true, checkedBlockedKeys: denied.length }));
console.log(JSON.stringify({ message: { content: [{ type: "tool_use", id: "synthetic-call", name: "mcp__oct3__list_missions" }] } }));
console.log(JSON.stringify({ message: { content: [{ type: "tool_result", tool_use_id: "synthetic-call", is_error: false }] } }));
console.log(JSON.stringify({ type: "result", is_error: false }));
`;
  await writeFile(join(directory, "claude"), fake, { mode: 0o700 });
  const env: NodeJS.ProcessEnv = { ...allowed };
  for (const key of denied) env[key] = `synthetic-private-${key}`;
  // Valid parent runtime flag, which must still not reach the caller child.
  env.NODE_OPTIONS = "--no-warnings";
  const launcher = fileURLToPath(new URL("../scripts/claude-demo.mjs", import.meta.url));
  const result = await promisify(execFile)(process.execPath, [launcher, "--check"], { cwd: directory, env, timeout: 10000 }).catch(async () => {
    const diagnostic = await readFile(marker, "utf8").catch(() => "Fake child did not start");
    throw new Error(`Synthetic caller environment failed: ${diagnostic}`);
  });
  const output = JSON.parse(result.stdout.trim());
  assert.equal(output.passed, true);
  assert.equal(output.mission_submitted, false);
  assert.deepEqual(output.tool_calls, ["mcp__oct3__list_missions"]);
  assert.deepEqual(JSON.parse(await readFile(marker, "utf8")), { passed: true, checkedBlockedKeys: denied.length });
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-private-|synthetic-caller-(?:anthropic|oauth|agent)/);
});
