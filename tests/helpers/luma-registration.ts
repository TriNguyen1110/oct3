import assert from "node:assert/strict";
import { type TestContext } from "node:test";
import { chromium, type Route } from "playwright-core";
import { FREE_REGISTRATION_EVENT_URL, type ExecuteRegistrationInput } from "../../src/shared/registration";

const eventId = "evt-Hi5xnKWbH9xR0q5", ticketId = "ttype-WXJIzZWOLvIP01x";
const endpoint = "https://api.luma.com/event/register";
const attendee = { name: "Synthetic Attendee", email: "synthetic-attendee@example.test" };
export const input = (): ExecuteRegistrationInput => ({
  task_id: "synthetic-task", source_url: FREE_REGISTRATION_EVENT_URL, attempt_key: "synthetic-attempt", expected_event_date: "2026-10-16",
  snapshot: { provider: "luma", source_url: FREE_REGISTRATION_EVENT_URL, event_api_id: eventId, ticket_type_api_id: ticketId,
    event_title: "Open Together: AI Builders Unite", event_start_at: "2026-10-17T01:00:00.000Z", ticket_name: "Standard", quantity: 1, total_minor: 0, currency: "USD", requires_approval: false, observed_at: new Date().toISOString() },
  attendee, authorization: { approved: true, proposal_id: "synthetic-proposal", revision: 1, reservation_id: "synthetic-reservation", attempt_key: "synthetic-attempt", action_hash: "a".repeat(64), expires_at: new Date(Date.now() + 60_000).toISOString() },
});
export const publicState = () => ({
  event: { api_id: eventId, name: "Open Together: AI Builders Unite", url: "OpenTogether", timezone: "America/Los_Angeles", start_at: "2026-10-17T01:00:00.000Z" },
  ticket_types: [{ api_id: ticketId, event_api_id: eventId, name: "Standard", type: "free", cents: null, currency: null, is_flexible: false, is_hidden: false, membership_restriction: null, require_approval: false, is_disabled: false }],
  registration_availability: "open", ticket_info: { price: null, is_free: true, is_sold_out: false, spots_remaining: 42, require_approval: false },
  registration_questions: [{ id: "7atwuzft", label: "What's your HF username?", required: false, question_type: "text" }], guest_data: {},
});
export const body = () => ({ ...attendee, event_api_id: eventId, for_waitlist: false, expected_amount_cents: 0, expected_amount_tax: 0,
  ticket_type_to_selection: { [ticketId]: { count: 1, amount: 0 } },
  registration_answers: [{ question_id: "7atwuzft", label: "What's your HF username?", question_type: "text", value: "" }],
});
export const success = () => ({ status: "success", approval_status: "approved", event_tickets: [{ api_id: "ticket_synthetic", event_ticket_type_api_id: ticketId, amount: 0, amount_tax: 0 }], ticket_url: "https://luma.com/OpenTogether?tk=private-ticket&pk=private-proxy", email: attendee.email });
export type Options = { state?: unknown; prefilled?: boolean; early?: "goto" | "opener"; requestBody?: unknown; malformedBody?: boolean; duplicate?: boolean; response?: unknown; lost?: boolean; malformedResponse?: boolean; onGoto?: () => Promise<void>; otherFetch?: (url: URL, init?: RequestInit) => Promise<Response> };
export function mock(t: TestContext, options: Options = {}) {
  for (const [key, value] of Object.entries({ SURFSKY_API_KEY: "synthetic-provider-key", SURFSKY_API_BASE_URL: "https://region.surfsky.io" })) {
    const old = process.env[key]; process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  let handler: ((route: Route) => Promise<unknown>) | undefined;
  const calls: string[] = [], allowed: unknown[] = [], blocked: unknown[] = [], fills: string[] = [];
  let responseResolve!: (value: unknown) => void, responseReject!: (error: Error) => void;
  const request = { method: () => "POST", url: () => endpoint, postDataJSON: () => { if (options.malformedBody) throw new Error("malformed"); return options.requestBody === undefined ? body() : options.requestBody; } };
  async function emit() {
    let passed = false;
    const route = { request: () => request, continue: async () => { passed = true; allowed.push(options.requestBody ?? body()); }, abort: async () => { blocked.push(options.requestBody ?? body()); } };
    if (handler) await handler(route as unknown as Route); else await route.continue();
    return passed;
  }
  const fields = new Map<string, string>();
  const field = (key: string, required: boolean) => ({ count: async () => 1, inputValue: async () => fields.get(key) ?? (options.prefilled && key === "name" ? "preexisting" : ""), evaluate: async () => required, fill: async (value: string) => { fills.push(key); fields.set(key, value); } });
  const submit = { count: async () => 1, filter: () => submit, click: async () => {
    const passed = await emit(); if (options.duplicate) await emit();
    if (!passed || options.lost) responseReject(new Error("synthetic response lost"));
    else responseResolve({ url: () => endpoint, request: () => request, ok: () => true, status: () => 200,
      json: async () => { if (options.malformedResponse) throw new Error("malformed response"); return options.response === undefined ? success() : options.response; } });
  } };
  const opener = { first: () => opener, count: async () => 1, evaluate: async () => ({ type: "button", insideForm: false, disabled: false }), click: async () => { if (options.early === "opener") await emit(); } };
  const page = {
    setDefaultTimeout() {}, setDefaultNavigationTimeout() {}, close: async () => {},
    route: async (_pattern: string, callback: typeof handler) => { handler = callback; },
    goto: async () => { await options.onGoto?.(); if (options.early === "goto") await emit(); return { status: () => 200 }; },
    url: () => FREE_REGISTRATION_EVENT_URL, title: async () => "Open Together",
    getByRole: (_role: string, opts: { name: RegExp }) => opts.name.source.includes("Sign In") ? { count: async () => 1 } : opener,
    locator: (selector: string) => {
      if (selector === "body") return { innerText: async () => "Open Together event" };
      if (selector === "script#__NEXT_DATA__") return { textContent: async () => JSON.stringify({ props: { pageProps: { initialData: { data: options.state ?? publicState() } } } }) };
      if (selector.includes('type="submit"')) return submit;
      if (selector.includes('name="name"')) return field("name", true);
      if (selector.includes('name="email"')) return field("email", true);
      return field("hf", false);
    },
    waitForResponse: () => new Promise((resolve, reject) => { responseResolve = resolve; responseReject = reject; }),
  };
  t.mock.method(globalThis, "fetch", async (resource: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(resource)); if (url.hostname !== "region.surfsky.io" && options.otherFetch) return options.otherFetch(url, init); assert.equal(url.hostname, "region.surfsky.io"); calls.push(url.pathname);
    if (url.pathname === "/profiles") return Response.json([{ title: "oct3-event_tickets", uuid: "synthetic-profile", status: "stopped" }]);
    if (url.pathname.endsWith("/start")) return Response.json({ success: true, internal_uuid: "synthetic-session", ws_url: "wss://region.surfsky.io/cdp?secret=synthetic-private" });
    if (url.pathname.endsWith("/stop")) return Response.json({ success: true });
    throw new Error("Unexpected synthetic provider route");
  });
  t.mock.method(chromium, "connectOverCDP", async () => ({ contexts: () => [{ newPage: async () => page }], close: async () => {} }));
  return { calls, allowed, blocked, fills };
}
