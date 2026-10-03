#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const usage = `oct3 — browser workers for your agent

  oct3 submit <mission.json> --key <stable-idempotency-key> [--pay-test]
  oct3 status <mission-id>
  oct3 list

Set OCT3_BASE_URL and OCT3_AGENT_TOKEN in your environment.
Outputs JSON. Reuse your submit key after any network failure.
Approvals happen in the manager dashboard.
--pay-test explicitly requests the enabled $0.50 Stripe sandbox payer.
It uses a developer-supplied test method, moves no real funds and is not a wallet.
`;

async function main(args) {
  if (!args.length || args[0] === "--help" || args[0] === "help") { process.stdout.write(usage); return; }
  const [command, ...rest] = args;
  let path = "/api/missions", method = "GET", body, key, payTest = false;
  if (command === "submit") {
    payTest = rest.includes("--pay-test");
    const positional = rest.filter(arg => arg !== "--pay-test");
    if (rest.length - positional.length > 1 || positional.length !== 3 || positional[1] !== "--key" || !/^[A-Za-z0-9_.:-]{8,160}$/.test(positional[2])) throw new Error("Usage: oct3 submit <mission.json> --key <stable-key-of-at-least-8-characters> [--pay-test]");
    const raw = await readFile(positional[0], "utf8");
    if (Buffer.byteLength(raw) > 65536) throw new Error("Mission input exceeds 64 KiB");
    body = JSON.parse(raw); method = "POST"; key = positional[2];
    if (payTest && body.mode !== "live") throw new Error("--pay-test requires an explicit live research mission. Fixture missions do not need payment.");
  } else if (command === "status") {
    if (rest.length !== 1 || !/^[a-f0-9-]{36}$/i.test(rest[0])) throw new Error("Usage: oct3 status <mission-uuid>");
    path += `/${encodeURIComponent(rest[0])}`;
  } else if (command !== "list" || rest.length) throw new Error("Use oct3 submit, status, or list. See --help.");
  const base = new URL(process.env.OCT3_BASE_URL ?? "http://127.0.0.1:3003");
  if (base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("OCT3_BASE_URL must be an origin without credentials, path or query");
  if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) throw new Error("Use HTTPS for a remote oct3 service");
  if (!process.env.OCT3_AGENT_TOKEN) throw new Error("Set OCT3_AGENT_TOKEN in your environment");
  const response = await fetch(new URL(path, base), {
    method, redirect: "error", signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${process.env.OCT3_AGENT_TOKEN}`, "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}), ...(payTest ? { "X-Cue-Test-Payment": "authorized" } : {}), ...(command === "submit" && process.env.OCT3_PAYMENT_AUTHORIZATION ? { "Payment-Authorization": process.env.OCT3_PAYMENT_AUTHORIZATION } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({ error: { code: "invalid_response", message: "The server did not return JSON." } }));
  // Preserve durable handles on the standard MPP 402 response. Credentials stay
  // in the request header; only the public challenge is returned to the caller.
  for (const [field, header] of [["mission_id", "x-cue-mission-id"], ["dashboard_url", "x-cue-dashboard-url"], ["result_url", "x-cue-result-url"]]) {
    const value = response.headers.get(header);
    if (value && data[field] === undefined) data[field] = value;
  }
  if (response.status === 402) data.payment_challenge = response.headers.get("www-authenticate");
  const receipt = response.headers.get("payment-receipt");
  if (receipt) data.service_payment_receipt = receipt;
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  if (!response.ok) process.exitCode = 1;
}

main(process.argv.slice(2)).catch(error => {
  const message = error instanceof TypeError ? "Network request failed. Retry submission with the same idempotency key." : error.message;
  process.stderr.write(JSON.stringify({ error: { code: "client_error", message } }) + "\n");
  process.exitCode = 1;
});
