import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { chromium, type Page } from "playwright-core";
import { collectCandidates, publicSourceUrl, researchUrl } from "../src/browser/extract";
import { executeApprovedTask, researchTask } from "../src/browser/index";
import { BrowserIssue, surfskyHealth, withSurfskyPage } from "../src/browser/surfsky";
import type { ExecuteApprovedTaskInput, ResearchTaskInput } from "../src/browser/types";

const input: ResearchTaskInput = {
  task_id: "verify:event_tickets", lane: "event_tickets",
  requirements: { event_url: "https://www.eventbrite.com/e/demo-tickets-123", date: "2026-10-07T12:00:00-07:00", quantity: 6, attendee_ref: "team" },
  deadline: "2026-10-07T12:00:00-07:00", budget_minor: 90000, attempt_key: "verify-attempt",
};

function env(t: TestContext, changes: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(changes)) {
    const before = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
  }
}

function eventPage(offers: unknown, date = "2026-10-07T12:00:00-07:00"): Page {
  return { url: () => "https://www.eventbrite.com/e/demo-tickets-123?aff=private",
    locator: () => ({ allTextContents: async () => [JSON.stringify({ "@type": "Event", name: "Demo Expo", startDate: date, offers })] }),
  } as unknown as Page;
}

function sessionMock(t: TestContext, options: { stopFails?: boolean; connectFails?: boolean } = {}) {
  env(t, { SURFSKY_API_KEY: "test-private-key", SURFSKY_API_BASE_URL: "https://region.surfsky.io", SURFSKY_API_TOKEN: undefined });
  const requests: string[] = [];
  let pageCloses = 0, disconnects = 0;
  const page = {
    setDefaultTimeout() {}, setDefaultNavigationTimeout() {},
    goto: async () => ({ status: () => 200 }),
    url: () => "https://www.amazon.com/dp/ABCDEFGHIJ",
    title: async () => "Sample supplies",
    locator: () => ({ innerText: async () => "Observed supplies listing" }),
    close: async () => { pageCloses++; },
  } as unknown as Page;
  t.mock.method(globalThis, "fetch", async (resource: string | URL | Request) => {
    const path = new URL(String(resource)).pathname;
    requests.push(path);
    if (path === "/profiles") return Response.json([{ title: "oct3-amazon", uuid: "owned-profile", status: "stopped" }]);
    if (path === "/profiles/owned-profile/start") return Response.json({ success: true, internal_uuid: "owned-session", ws_url: "wss://region.surfsky.io/cdp?secret=not-public" });
    if (path === "/profiles/owned-session/stop") return Response.json({ success: !options.stopFails }, { status: options.stopFails ? 500 : 200 });
    throw new Error(`Unexpected mocked request ${path}`);
  });
  t.mock.method(chromium, "connectOverCDP", async () => {
    if (options.connectFails) throw new Error("private connection must not leak");
    return { contexts: () => [{ newPage: async () => page }], close: async () => { disconnects++; } };
  });
  return { requests, closed: () => ({ pageCloses, disconnects }) };
}

test("merchant destinations reject off-site, credential-bearing and local URLs; tracking is removed", () => {
  for (const url of ["https://amazon.com.attacker.test/dp/ABC", "https://amazon.com@attacker.test/", "http://amazon.com/", "https://localhost/", "https://www.amazon.com:8443/", "https://www.fiverr.com/person/gig"]) {
    assert.throws(() => publicSourceUrl(url, "amazon"), (e: unknown) => e instanceof BrowserIssue && e.code === "unsupported_url");
  }
  assert.equal(publicSourceUrl("https://www.amazon.com/s?k=badge&token=private#account", "amazon"), "https://www.amazon.com/s?k=badge");
  assert.throws(() => researchUrl({ ...input, requirements: { ...input.requirements, event_url: "https://www.eventbrite.com/d/ca--san-francisco/events/" } } as ResearchTaskInput), /individual Eventbrite/);
});

test("event estimates multiply the observed USD unit price without claiming group inventory or final fees", async () => {
  const [candidate] = await collectCandidates(eventPage({ lowPrice: "19.95", priceCurrency: "USD", availability: "https://schema.org/InStock" }), "event_tickets", input);
  assert.equal(candidate.amount_minor, 11970);
  assert.equal(candidate.quantity, 6);
  assert.equal(candidate.available, undefined);
  assert.match(candidate.price_text, /listed minimum/);
  assert.match(candidate.description, /fees and availability for the full group still require checkout verification/);
  assert.equal(candidate.source_url, "https://www.eventbrite.com/e/demo-tickets-123");
  assert.deepEqual(await collectCandidates(eventPage({ price: 50, priceCurrency: "EUR" }), "event_tickets", input), []);
  await assert.rejects(collectCandidates(eventPage({ price: 50, priceCurrency: "USD" }, "2026-11-07T12:00:00-08:00"), "event_tickets", input), /date differs/);
});

test("sold-out event evidence stays unavailable for a group request", async () => {
  const candidates = await collectCandidates(eventPage({ price: 50, priceCurrency: "USD", availability: "https://schema.org/SoldOut" }), "event_tickets", input);
  assert.ok(candidates.length === 0 || candidates.every(candidate => candidate.available === false), "SoldOut cannot become unknown availability when quantity exceeds one");
});

test("wrong connection and stale approval fail before any browser or network request", async t => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("Network must not be reached"); });
  const result = await researchTask({ ...input, connection_ref: "someone-elses-profile" });
  assert.equal(result.blocker_code, "configuration");
  assert.equal(result.cleanup, "not_started");
  const approved: ExecuteApprovedTaskInput = { ...input,
    proposal: { id: "proposal", revision: 2, task_id: input.task_id, option_id: "option", merchant: "Eventbrite", title: "Passes", source_url: "https://www.eventbrite.com/e/demo-tickets-123", quantity: 6, recipient_ref: "team", deadline: input.deadline, subtotal_minor: 6000, tax_minor: 0, shipping_minor: 0, fees_minor: 0, total_minor: 6000, currency: "USD", expires_at: "2000-01-01T00:00:00Z" },
    authorization: { proposal_id: "proposal", revision: 2, approved: true, reservation_id: "reservation", link_status: "succeeded", attempt_key: input.attempt_key },
  };
  const execution = await executeApprovedTask(approved);
  assert.equal(execution.status, "needs_human");
  assert.equal(execution.blocker_code, "approval_invalid");
  assert.equal(execution.confirmation_ref, undefined);
  assert.equal(execution.uncertain, false);
});

test("Surfsky authorization errors expose no provider body or credential", async t => {
  env(t, { SURFSKY_API_KEY: "fake-secret", SURFSKY_API_BASE_URL: "https://region.surfsky.io" });
  t.mock.method(globalThis, "fetch", async () => Response.json({ message: "private browser wss://secret", secret: "fake-secret" }, { status: 401 }));
  const health = await surfskyHealth();
  assert.equal(health.ready, false);
  assert.doesNotMatch(JSON.stringify(health), /fake-secret|wss:|private browser/);
  assert.match(health.detail, /rejected/);
});

test("Link approval and a reopened merchant source never fabricate a confirmed purchase", async t => {
  sessionMock(t);
  const approved: ExecuteApprovedTaskInput = {
    ...input, task_id: "verify:amazon", lane: "amazon", requirements: { category: "supplies", delivery_ref: "office" },
    proposal: { id: "proposal", revision: 2, task_id: "verify:amazon", option_id: "option", merchant: "Amazon", title: "Supplies", source_url: "https://www.amazon.com/dp/ABCDEFGHIJ", quantity: 1, recipient_ref: "office", deadline: input.deadline, subtotal_minor: 6000, tax_minor: 0, shipping_minor: 0, fees_minor: 0, total_minor: 6000, currency: "USD", expires_at: new Date(Date.now() + 60000).toISOString() },
    authorization: { proposal_id: "proposal", revision: 2, approved: true, reservation_id: "reservation", link_status: "approved", attempt_key: input.attempt_key },
  };
  const outcome = await executeApprovedTask(approved);
  assert.equal(outcome.status, "needs_human");
  assert.equal(outcome.blocker_code, "checkout_handoff");
  assert.equal(outcome.confirmation_ref, undefined);
  assert.equal(outcome.uncertain, false);
  assert.match(outcome.evidence[0].detail, /no order, freelancer message or booking was submitted/);
  assert.doesNotMatch(JSON.stringify(outcome), /test-private-key|wss:|not-public/);
});

test("a failing merchant run closes the page and exact owned session, then unlocks the lane", async t => {
  const mock = sessionMock(t);
  await assert.rejects(withSurfskyPage("amazon", new AbortController().signal, async () => { throw new Error("merchant crashed"); }), (e: unknown) => e instanceof BrowserIssue && e.cleanup === "confirmed");
  const next = await withSurfskyPage("amazon", new AbortController().signal, async () => "second run");
  assert.equal(next.value, "second run");
  assert.equal(next.cleanup, "confirmed");
  assert.equal(mock.requests.filter(path => path === "/profiles/owned-session/stop").length, 2);
  assert.deepEqual(mock.closed(), { pageCloses: 2, disconnects: 2 });
});

test("connection failure still stops the already-started remote session", async t => {
  const mock = sessionMock(t, { connectFails: true });
  await assert.rejects(withSurfskyPage("amazon", new AbortController().signal, async () => "never"), (e: unknown) => e instanceof BrowserIssue && e.cleanup === "confirmed" && !e.message.includes("private"));
  assert.equal(mock.requests.at(-1), "/profiles/owned-session/stop");
});

test("unconfirmed cleanup is reported; concurrent use of the same profile is rejected", async t => {
  sessionMock(t, { stopFails: true });
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  const first = withSurfskyPage("amazon", new AbortController().signal, async () => { started(); await wait; return "done"; });
  await entered;
  await assert.rejects(withSurfskyPage("amazon", new AbortController().signal, async () => "never"), (e: unknown) => e instanceof BrowserIssue && e.code === "profile_busy");
  release();
  assert.equal((await first).cleanup, "unconfirmed");
});
