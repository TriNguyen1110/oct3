import { createHash } from "node:crypto";
import type { Page, Request } from "playwright-core";
import type { Evidence } from "../shared/contracts";
import {
  FREE_REGISTRATION_EVENT_URL,
  type ExecuteRegistrationInput,
  type ExecuteRegistrationResult,
  type FreeRegistrationSnapshot,
  type PrepareRegistrationInput,
  type PrepareRegistrationResult,
  type RegistrationAttendee,
} from "../shared/registration";
import { detectAccessBlocker, publicSourceUrl } from "./extract";
import { BrowserIssue, withSurfskyPage } from "./surfsky";

const EVENT_API_ID = "evt-Hi5xnKWbH9xR0q5";
const TICKET_TYPE_API_ID = "ttype-WXJIzZWOLvIP01x";
const EVENT_TITLE = "Open Together: AI Builders Unite";
const TICKET_NAME = "Standard";
const EVENT_DATE = "2026-10-16";
const EVENT_START_AT = "2026-10-17T01:00:00.000Z";
const REGISTRATION_ENDPOINT = "https://api.luma.com/event/register";
const HF_QUESTION_ID = "7atwuzft";
const HF_QUESTION_LABEL = "What's your HF username?";

class RegistrationIssue extends BrowserIssue {
  constructor(message: string, readonly uncertain = false) { super(uncertain ? "checkout_handoff" : "merchant_changed", message); }
}

function signalFor(input: PrepareRegistrationInput) {
  return AbortSignal.any([AbortSignal.timeout(90_000), ...(input.signal ? [input.signal] : [])]);
}

function exactSource(source: string) {
  const normalized = publicSourceUrl(source, "event_tickets");
  if (normalized !== FREE_REGISTRATION_EVENT_URL) throw new RegistrationIssue("This adapter supports only the selected Open Together event URL without query parameters.");
  return normalized;
}

function evidence(taskId: string, attemptKey: string, title: string, detail: string, kind: Evidence["kind"] = "observation"): Evidence {
  const observed_at = new Date().toISOString();
  const id = createHash("sha256").update([taskId, attemptKey, title, observed_at].join("\u001f")).digest("hex").slice(0, 24);
  return { id, task_id: taskId, source_url: FREE_REGISTRATION_EVENT_URL, observed_at, title, detail, mode: "live", kind };
}

type PublicEventData = {
  event?: { api_id?: unknown; name?: unknown; start_at?: unknown; url?: unknown; timezone?: unknown };
  ticket_types?: unknown;
  ticket_info?: { price?: unknown; is_free?: unknown; is_sold_out?: unknown; spots_remaining?: unknown; require_approval?: unknown };
  registration_availability?: unknown;
  registration_questions?: unknown;
  guest_data?: { email?: unknown; approval_status?: unknown; user_api_id?: unknown };
};

async function readCurrentSnapshot(page: Page, expectedDate: string): Promise<FreeRegistrationSnapshot> {
  const clean = publicSourceUrl(page.url(), "event_tickets");
  if (clean !== FREE_REGISTRATION_EVENT_URL) throw new RegistrationIssue("Luma redirected away from the approved event.");
  await detectAccessBlocker(page);
  const raw = await page.locator("script#__NEXT_DATA__").textContent({ timeout: 10_000 });
  let data: PublicEventData;
  try {
    const parsed = JSON.parse(raw || "") as { props?: { pageProps?: { initialData?: { data?: PublicEventData } } } };
    data = parsed.props?.pageProps?.initialData?.data || {};
  } catch {
    throw new RegistrationIssue("Luma's public event state was unreadable.");
  }
  const ticketTypes = Array.isArray(data.ticket_types) ? data.ticket_types : [];
  const matching = ticketTypes.filter(value => value && typeof value === "object" && (value as Record<string, unknown>).api_id === TICKET_TYPE_API_ID);
  const ticket = matching.length === 1 ? matching[0] as Record<string, unknown> : undefined;
  const questions = Array.isArray(data.registration_questions) ? data.registration_questions : [];
  const question = questions.find(value => value && typeof value === "object" && (value as Record<string, unknown>).id === HF_QUESTION_ID) as Record<string, unknown> | undefined;
  const startAt = typeof data.event?.start_at === "string" ? data.event.start_at : "";
  const date = /^\d{4}-\d{2}-\d{2}/.test(expectedDate) ? expectedDate.slice(0, 10) : "";
  const valid = data.event?.api_id === EVENT_API_ID
    && data.event?.name === EVENT_TITLE
    && data.event?.url === "OpenTogether"
    && data.event?.timezone === "America/Los_Angeles"
    && startAt === EVENT_START_AT
    && date === EVENT_DATE
    && matching.length === 1
    && ticket?.event_api_id === EVENT_API_ID
    && ticket?.name === TICKET_NAME
    && ticket?.type === "free"
    && ticket?.cents == null
    && ticket?.currency == null
    && ticket?.is_flexible === false
    && ticket?.is_hidden === false
    && ticket?.membership_restriction == null
    && ticket?.require_approval === false
    && ticket?.is_disabled === false
    && data.registration_availability === "open"
    && data.ticket_info?.price == null
    && data.ticket_info?.is_free === true
    && data.ticket_info?.is_sold_out === false
    && typeof data.ticket_info?.spots_remaining === "number" && data.ticket_info.spots_remaining > 0
    && data.ticket_info?.require_approval === false
    && question?.label === HF_QUESTION_LABEL
    && question?.required === false
    && question?.question_type === "text"
    && data.guest_data?.email == null && data.guest_data?.approval_status == null && data.guest_data?.user_api_id == null
    && await page.getByRole("button", { name: /^Sign In$/ }).count() === 1;
  if (!valid) throw new RegistrationIssue("The selected event, free ticket, date, approval rule, availability, or registration question changed. Prepare a fresh review instead of registering.");
  return {
    provider: "luma", source_url: FREE_REGISTRATION_EVENT_URL,
    event_api_id: EVENT_API_ID, ticket_type_api_id: TICKET_TYPE_API_ID,
    event_title: EVENT_TITLE, event_start_at: startAt, ticket_name: TICKET_NAME,
    quantity: 1, total_minor: 0, currency: "USD", requires_approval: false,
    observed_at: new Date().toISOString(),
  };
}

async function openBlankRegistrationForm(page: Page) {
  const button = page.getByRole("button", { name: /^Register$/ }).first();
  if (await button.count() !== 1) throw new RegistrationIssue("The exact Luma Register dialog opener was not available.");
  const safe = await button.evaluate(node => ({
    type: node.getAttribute("type"), insideForm: Boolean(node.closest("form")),
    disabled: (node as HTMLButtonElement).disabled,
  }));
  if (safe.type === "submit" || safe.insideForm || safe.disabled) throw new RegistrationIssue("The observed Register control is no longer a safe dialog opener.");
  await button.click();
  const name = page.locator('input[name="name"]:visible');
  const email = page.locator('input[name="email"]:visible');
  const hf = page.locator('input[name="registration_answers.0.value"]:visible');
  if (await name.count() !== 1 || await email.count() !== 1 || await hf.count() !== 1) throw new RegistrationIssue("The exact Luma registration fields changed.");
  const state = await Promise.all([name, email, hf].map(async field => ({ value: await field.inputValue(), required: await field.evaluate(node => (node as HTMLInputElement).required) })));
  if (state.some(field => field.value !== "") || !state[0].required || !state[1].required || state[2].required) throw new RegistrationIssue("The registration form is not the expected blank name, email, and optional HF username form.");
  const submit = page.locator('button[type="submit"]:visible').filter({ hasText: /^Register$/ });
  if (await submit.count() !== 1) throw new RegistrationIssue("The exact final Register action was not found.");
  return { name, email, hf, submit };
}

function sameApprovedSnapshot(value: FreeRegistrationSnapshot, current: FreeRegistrationSnapshot) {
  return value.provider === "luma" && value.source_url === FREE_REGISTRATION_EVENT_URL
    && value.event_api_id === current.event_api_id && value.ticket_type_api_id === current.ticket_type_api_id
    && value.event_title === current.event_title && value.event_start_at === current.event_start_at
    && value.ticket_name === current.ticket_name && value.quantity === 1 && value.total_minor === 0
    && value.currency === "USD" && value.requires_approval === false;
}

function validAttendee(attendee: RegistrationAttendee) {
  return attendee.name === attendee.name.trim() && attendee.name.length >= 2 && attendee.name.length <= 160 && !/[\r\n\0]/.test(attendee.name)
    && attendee.email === attendee.email.trim() && attendee.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attendee.email) && !/[\r\n\0]/.test(attendee.email);
}

function exactRegistrationBody(request: Request, attendee: RegistrationAttendee) {
  let body: Record<string, unknown>;
  try { body = request.postDataJSON() as Record<string, unknown>; } catch { return false; }
  const allowed = new Set(["name", "first_name", "last_name", "email", "event_api_id", "for_waitlist", "payment_method", "payment_currency", "registration_answers", "coupon_code", "token_gate_info", "eth_address_info", "phone_number", "solana_address_info", "expected_amount_cents", "expected_amount_tax", "currency", "event_invite_api_id", "ticket_type_to_selection", "solana_address", "solana_wallet_type", "opened_from"]);
  if (Object.keys(body).some(key => !allowed.has(key))) return false;
  const answers = body.registration_answers;
  const selection = body.ticket_type_to_selection as Record<string, unknown> | undefined;
  const selected = selection?.[TICKET_TYPE_API_ID] as Record<string, unknown> | undefined;
  const answer = Array.isArray(answers) ? answers[0] as Record<string, unknown> | undefined : undefined;
  return body.name === attendee.name && body.email === attendee.email
    && (body.first_name === "" || body.first_name == null) && (body.last_name === "" || body.last_name == null)
    && body.event_api_id === EVENT_API_ID && body.for_waitlist === false
    && body.expected_amount_cents === 0 && body.expected_amount_tax === 0 && body.currency == null
    && body.payment_method == null && body.payment_currency == null && body.coupon_code == null
    && body.token_gate_info == null && body.eth_address_info == null && (body.phone_number == null || body.phone_number === "")
    && body.solana_address_info == null && body.event_invite_api_id == null
    && body.solana_address == null && body.solana_wallet_type == null && body.opened_from == null
    && selection != null && Object.keys(selection).length === 1 && selected != null
    && Object.keys(selected).sort().join(",") === "amount,count" && selected.count === 1 && selected.amount === 0
    && Array.isArray(answers) && answers.length === 1
    && answer != null && Object.keys(answer).sort().join(",") === "label,question_id,question_type,value"
    && answer.question_id === HF_QUESTION_ID && answer.label === HF_QUESTION_LABEL
    && answer.question_type === "text" && answer.value === "";
}

function validateExecutionInput(input: ExecuteRegistrationInput) {
  exactSource(input.source_url);
  if (input.snapshot.provider !== "luma" || input.snapshot.source_url !== FREE_REGISTRATION_EVENT_URL
    || input.snapshot.event_api_id !== EVENT_API_ID || input.snapshot.ticket_type_api_id !== TICKET_TYPE_API_ID
    || input.snapshot.event_title !== EVENT_TITLE || input.snapshot.event_start_at !== EVENT_START_AT
    || input.snapshot.ticket_name !== TICKET_NAME || input.snapshot.quantity !== 1 || input.snapshot.total_minor !== 0
    || input.snapshot.currency !== "USD" || input.snapshot.requires_approval !== false
    || !Number.isFinite(Date.parse(input.snapshot.observed_at))) {
    throw new RegistrationIssue("The approved registration snapshot is not the fixed free event action.");
  }
  const authorization = input.authorization;
  const expires = Date.parse(authorization.expires_at);
  if (!authorization.approved || !authorization.proposal_id || !authorization.reservation_id
    || authorization.attempt_key !== input.attempt_key || !Number.isInteger(authorization.revision) || authorization.revision < 0
    || !/^[a-f0-9]{64}$/i.test(authorization.action_hash) || !Number.isFinite(expires) || expires <= Date.now()) {
    throw new RegistrationIssue("Execution requires the current exact approval, zero-total reservation, action hash, attempt, revision, and unexpired authorization.");
  }
  if (!validAttendee(input.attendee)) throw new RegistrationIssue("The approved attendee name or email is invalid.");
}

export async function prepareFreeRegistration(input: PrepareRegistrationInput): Promise<PrepareRegistrationResult> {
  const observations: Evidence[] = [];
  try {
    exactSource(input.source_url);
    const run = await withSurfskyPage("event_tickets", signalFor(input), async page => {
      await page.route("**/*", route => ["GET", "HEAD", "OPTIONS"].includes(route.request().method().toUpperCase()) ? route.continue() : route.abort("blockedbyclient"));
      const response = await page.goto(FREE_REGISTRATION_EVENT_URL, { waitUntil: "domcontentloaded" });
      if (response && response.status() >= 400) throw new RegistrationIssue(`Luma returned HTTP ${response.status()} while preparing registration.`);
      const snapshot = await readCurrentSnapshot(page, input.expected_event_date);
      await openBlankRegistrationForm(page);
      observations.push(evidence(input.task_id, input.attempt_key, "Free Luma registration prepared", "Read-only inspection confirmed the exact event, one open zero-dollar ticket, no host approval, and a blank name/email form. No field was filled and no registration was submitted."));
      return snapshot;
    });
    return { snapshot: run.value, evidence: observations, cleanup: run.cleanup };
  } catch (error) {
    const cleanup = error instanceof BrowserIssue ? error.cleanup : "not_started";
    const message = error instanceof Error ? error.message : "The free registration could not be prepared.";
    observations.push(evidence(input.task_id, input.attempt_key, "Free registration preparation blocked", `${message} No field was filled and no registration was submitted.`));
    return { evidence: observations, blocker: message, cleanup };
  }
}

export async function executeFreeRegistration(input: ExecuteRegistrationInput): Promise<ExecuteRegistrationResult> {
  const observations: Evidence[] = [];
  try { validateExecutionInput(input); } catch (error) {
    const message = error instanceof Error ? error.message : "The approved registration input was invalid.";
    return { status: "needs_human", evidence: [evidence(input.task_id, input.attempt_key, "Registration approval rejected", `${message} No registration request was sent.`)], blocker: message, uncertain: false, cleanup: "not_started" };
  }
  let allowedSubmit = false;
  let submissionArmed = false;
  let routeViolation: string | undefined;
  try {
    const run = await withSurfskyPage("event_tickets", signalFor(input), async page => {
      await page.route("**/*", async route => {
        const request = route.request();
        const method = request.method().toUpperCase();
        if (["GET", "HEAD", "OPTIONS"].includes(method)) return route.continue();
        if (submissionArmed && method === "POST" && request.url() === REGISTRATION_ENDPOINT && !allowedSubmit && exactRegistrationBody(request, input.attendee)) {
          allowedSubmit = true;
          return route.continue();
        }
        routeViolation = "A remote mutation outside the exact approved free registration request was blocked.";
        return route.abort("blockedbyclient");
      });
      const response = await page.goto(FREE_REGISTRATION_EVENT_URL, { waitUntil: "domcontentloaded" });
      if (response && response.status() >= 400) throw new RegistrationIssue(`Luma returned HTTP ${response.status()} before registration.`);
      const current = await readCurrentSnapshot(page, input.expected_event_date);
      if (!sameApprovedSnapshot(input.snapshot, current)) throw new RegistrationIssue("The event changed after approval. Prepare and approve a fresh registration.");
      const form = await openBlankRegistrationForm(page);
      await form.name.fill(input.attendee.name);
      await form.email.fill(input.attendee.email);
      if (await form.hf.inputValue() !== "") throw new RegistrationIssue("The optional HF username must remain blank for this approved action.");
      if (await form.name.inputValue() !== input.attendee.name || await form.email.inputValue() !== input.attendee.email) throw new RegistrationIssue("The approved attendee fields could not be verified before submit.");
      submissionArmed = true;
      let registrationResponse;
      try {
        [registrationResponse] = await Promise.all([
          page.waitForResponse(candidate => candidate.url() === REGISTRATION_ENDPOINT && candidate.request().method() === "POST", { timeout: 30_000 }),
          form.submit.click(),
        ]);
      } catch {
        throw new RegistrationIssue(allowedSubmit ? "The registration response was lost after the exact request was sent. Reconcile with Luma before any retry." : routeViolation || "The exact registration request was not observed.", allowedSubmit);
      }
      if (!allowedSubmit) throw new RegistrationIssue(routeViolation || "The exact approved registration request was blocked before submission.");
      if (!registrationResponse.ok()) throw new RegistrationIssue(`Luma returned HTTP ${registrationResponse.status()} after the registration request. Reconcile before any retry.`, true);
      let result: Record<string, unknown>;
      try { result = await registrationResponse.json() as Record<string, unknown>; } catch { throw new RegistrationIssue("Luma returned an unreadable registration response. Reconcile before any retry.", true); }
      const tickets = Array.isArray(result.event_tickets) ? result.event_tickets : [];
      const matches = tickets.filter(value => {
        if (!value || typeof value !== "object") return false;
        const ticket = value as Record<string, unknown>;
        return ticket.event_ticket_type_api_id === TICKET_TYPE_API_ID && typeof ticket.api_id === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(ticket.api_id)
          && (ticket.amount === undefined || ticket.amount === 0) && (ticket.amount_tax === undefined || ticket.amount_tax === 0);
      }) as Record<string, unknown>[];
      const attendeeMatches = result.email === undefined || result.email === null || result.email === input.attendee.email;
      if (result.status !== "success" || result.approval_status !== "approved" || tickets.length !== 1 || matches.length !== 1 || !attendeeMatches) {
        const rawState = typeof result.approval_status === "string" ? result.approval_status : "";
        const state = ["approved", "pending_approval", "waitlist", "declined", "invited", "session"].includes(rawState) ? rawState : "unverified";
        throw new RegistrationIssue(`Luma did not return one approved matching free ticket (provider state: ${state}). Reconcile before any retry.`, true);
      }
      const confirmationRef = String(matches[0].api_id);
      observations.push({ ...evidence(input.task_id, input.attempt_key, "Luma registration confirmed", "Luma returned success with approved status and one matching zero-dollar ticket. Confirmation email delivery was not verified. No private ticket or proxy URL is exposed.", "merchant_confirmation"), confirmation_ref: confirmationRef });
      return confirmationRef;
    });
    return { status: "confirmed", evidence: observations, confirmation_ref: run.value, uncertain: false, cleanup: run.cleanup };
  } catch (error) {
    const uncertain = error instanceof RegistrationIssue ? error.uncertain : allowedSubmit;
    const cleanup = error instanceof BrowserIssue ? error.cleanup : "not_started";
    const message = error instanceof Error ? error.message : "The Luma registration outcome could not be verified.";
    observations.push(evidence(input.task_id, input.attempt_key, "Luma registration needs reconciliation", `${message} No success claim or public receipt link was produced.`));
    return { status: "needs_human", evidence: observations, blocker: message, uncertain, cleanup };
  }
}
