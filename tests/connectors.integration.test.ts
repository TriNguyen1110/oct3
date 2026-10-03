import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import type { MissionView } from "../src/shared/contracts";

const base = process.env.OCT3_INTEGRATION_URL;
const token = process.env.OCT3_AGENT_TOKEN;
const managerToken = process.env.OCT3_MANAGER_TOKEN;
type RpcResponse = { result?: { content?: Array<{ type: string; text: string }>; structuredContent?: unknown; tools?: Array<{ name: string }>; protocolVersion?: string; serverInfo?: { name: string }; isError?: boolean }; error?: unknown };

test("real MCP handshake, three tools, CLI and manager handoff share one fixture mission", { skip: !base || !token || !managerToken }, async t => {
  let requestId = 0;
  const started = Date.now();
  const endpoint = new URL("/api/mcp", base);
  async function rpc(method: string, params: unknown): Promise<RpcResponse> {
    const response = await fetch(endpoint, {
      method: "POST", signal: AbortSignal.timeout(30000),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-03-26" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
    });
    assert.equal(response.status, 200, `${method}: HTTP ${response.status}`);
    const raw = await response.text();
    const data = response.headers.get("content-type")?.includes("text/event-stream")
      ? raw.split("\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6))).find(value => value.id === requestId)
      : JSON.parse(raw);
    assert.ok(data, `${method}: response missing`);
    assert.equal(data.error, undefined, `${method}: JSON-RPC error`);
    return data;
  }
  async function tool(name: string, args: unknown) {
    const response = await rpc("tools/call", { name, arguments: args });
    assert.notEqual(response.result?.isError, true, `${name}: tool failure`);
    return response.result?.structuredContent ?? JSON.parse(response.result!.content![0].text);
  }
  const rejected = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
  assert.equal(rejected.status, 401);
  assert.match(rejected.headers.get("www-authenticate") || "", /Bearer/);
  const initialized = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "oct3-independent-verifier", version: "1.0.0" } });
  assert.equal(initialized.result?.protocolVersion, "2025-03-26");
  assert.equal(initialized.result?.serverInfo?.name, "oct3");
  const notified = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  assert.equal(notified.status, 202);
  const listed = await rpc("tools/list", {});
  assert.deepEqual(listed.result?.tools?.map(tool => tool.name).sort(), ["list_missions", "mission_status", "submit_mission"]);

  const mission = JSON.parse(await readFile(new URL("../examples/expo.json", import.meta.url), "utf8"));
  mission.objective = "[Verifier fixture] " + mission.objective;
  assert.equal(mission.mode, "fixture");
  const key = `verifier-connectors-${Date.now()}`;
  const submitted = await tool("submit_mission", { mission, idempotency_key: key }) as MissionView;
  assert.equal(submitted.mode, "fixture");
  assert.equal(submitted.service_payment.status, "waived_fixture");
  assert.deepEqual(submitted.tasks.map(task => task.lane).sort(), ["amazon", "event_tickets", "fiverr"]);
  const repeated = await tool("submit_mission", { mission, idempotency_key: key }) as MissionView;
  assert.equal(repeated.mission_id, submitted.mission_id);
  const status = await tool("mission_status", { mission_id: submitted.mission_id }) as MissionView;
  assert.equal(status.budget.proposed_minor, 78800);
  assert.ok(status.evidence.every(evidence => evidence.mode === "fixture"));
  const list = await tool("list_missions", {}) as { missions: MissionView[] };
  assert.ok(list.missions.some(item => item.mission_id === submitted.mission_id));

  const directory = await mkdtemp(join(tmpdir(), "oct3-connector-verification-"));
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const path = join(directory, "mission.json");
  await writeFile(path, JSON.stringify(mission));
  const cli = async (...args: string[]) => {
    const { stdout } = await promisify(execFile)(process.execPath, ["cli/oct3.mjs", ...args], { cwd: process.cwd(), env: { ...process.env, OCT3_BASE_URL: base }, timeout: 30000 });
    return JSON.parse(stdout);
  };
  assert.equal((await cli("submit", path, "--key", key)).mission_id, submitted.mission_id);
  assert.equal((await cli("status", submitted.mission_id)).mission_id, submitted.mission_id);
  assert.ok((await cli("list")).missions.some((item: MissionView) => item.mission_id === submitted.mission_id));

  async function action(path: string, method: string, body: unknown, credential: string) {
    return fetch(new URL(path, base), { method, headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  }
  const task = status.tasks[0];
  const denied = await action(`/api/tasks/${task.id}/approve`, "POST", { proposal_id: task.proposal!.id, revision: 1 }, token!);
  assert.equal(denied.status, 403);
  const revision = await action(`/api/missions/${status.mission_id}/constraints`, "PATCH", { expected_revision: 1, purchase_budget_minor: 65000 }, managerToken!);
  assert.equal(revision.status, 200);
  const changed = await revision.json() as MissionView;
  assert.equal(changed.budget.proposed_minor, 58800);
  assert.equal(changed.tasks.find(task => task.lane === "event_tickets")!.proposal!.quantity, 6);
  const stale = await action(`/api/tasks/${task.id}/approve`, "POST", { proposal_id: task.proposal!.id, revision: 1 }, managerToken!);
  assert.equal(stale.status, 409);
  const current = changed.tasks[0];
  const proof = { proposal_id: current.proposal!.id, revision: changed.revision };
  assert.equal((await action(`/api/tasks/${current.id}/approve`, "POST", proof, managerToken!)).status, 200);
  assert.equal((await action(`/api/tasks/${current.id}/resume`, "POST", proof, token!)).status, 200);
  const result = await tool("mission_status", { mission_id: changed.mission_id }) as MissionView;
  assert.equal(result.revision, 2);
  assert.equal(result.tasks[0].status, "needs_human");
  assert.equal(result.tasks[0].confirmation_ref, undefined);
  assert.notEqual(result.status, "completed");
  assert.equal(result.service_payment.status, "waived_fixture");
  t.diagnostic(`Verified fixture mission ${result.mission_id}; MCP, CLI, manager revision and handoff in ${Date.now() - started} ms. No real checkout or payment.`);
});
