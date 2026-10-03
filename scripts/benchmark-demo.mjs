import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

const live = process.argv.includes("--live");
if (process.argv.slice(2).some(x => x !== "--live")) throw new Error("Only --live is supported");
const base = new URL(process.env.OCT3_BASE_URL ?? "http://127.0.0.1:3003");
if (base.protocol !== "https:" && !(base.protocol === "http:" && ["127.0.0.1", "localhost"].includes(base.hostname))) throw new Error("Use HTTPS for remote measurements");
if (base.username || base.password) throw new Error("Credentials belong in the environment");
if (!process.env.OCT3_AGENT_TOKEN) throw new Error("OCT3_AGENT_TOKEN is required");
const input = JSON.parse(await readFile(new URL("../examples/expo.json", import.meta.url), "utf8"));
if (live) {
  if (!process.env.OCT3_EVENT_URL || !process.env.OCT3_EVENT_DATE) throw new Error("A live benchmark needs OCT3_EVENT_URL and OCT3_EVENT_DATE");
  input.mode = "live";
  input.requirements.event_tickets.event_url = process.env.OCT3_EVENT_URL;
  input.requirements.event_tickets.date = process.env.OCT3_EVENT_DATE;
}
const measurements = [];
const key = `benchmark-${randomUUID()}`;
async function call(label, path, method = "GET", body, manager = false) {
  const started = performance.now();
  const response = await fetch(new URL(path, base), {
    method, redirect: "error", signal: AbortSignal.timeout(65000),
    headers: { Authorization: `Bearer ${manager ? process.env.OCT3_MANAGER_TOKEN : process.env.OCT3_AGENT_TOKEN}`, "content-type": "application/json", "idempotency-key": key },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  measurements.push({ operation: label, duration_ms: Math.round(performance.now() - started), status: response.status });
  if (!response.ok) throw new Error(`${label} failed: ${response.status} ${data.error?.code ?? "request_failed"}`);
  return data;
}
const started = performance.now();
let mission = await call("submit", "/api/missions", "POST", input);
const id = mission.mission_id;
const retry = await call("idempotent_submit", "/api/missions", "POST", input);
if (retry.mission_id !== id) throw new Error("Duplicate submission created another mission");
const until = Date.now() + 150000;
while (mission.tasks.some(task => ["queued", "researching"].includes(task.status))) {
  if (Date.now() >= until) throw new Error("Mission did not settle within the 150 second benchmark limit");
  await setTimeout(1000);
  mission = await call("poll", `/api/missions/${id}`);
}
const timeToResults = Math.round(performance.now() - started);
await call("read_results", `/api/missions/${id}`);
await call("list", "/api/missions");
if (!live && process.env.OCT3_MANAGER_TOKEN) {
  mission = await call("revise_budget", `/api/missions/${id}/constraints`, "PATCH", { expected_revision: mission.revision, purchase_budget_minor: 65000 }, true);
}
const report = {
  measured_at: new Date().toISOString(), origin: base.origin,
  mode: live ? "live_read_only" : "fixture", environment: ["localhost", "127.0.0.1"].includes(base.hostname) ? "local" : "hosted",
  mission_id: id, time_to_results_ms: timeToResults, measurements,
  outcomes: mission.tasks.map(task => ({ lane: task.lane, status: task.status, options: task.options.length, blocker: task.blocker ?? null })),
  service_payment: mission.service_payment.status,
  notes: ["Single observed run, not a latency guarantee or benchmark distribution.", "No purchases, freelancer messages, or bookings were authorized by this script.", live ? "Read-only live merchant observations; provider blocking remains an explicit outcome." : "Fixture timings measure the application path, not browser work or sponsor payment processing."],
};
await mkdir("reports/performance", { recursive: true });
const path = `reports/performance/${report.environment}-${live ? "live" : "fixture"}.json`;
await writeFile(path, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ...report, report_path: path }, null, 2));
