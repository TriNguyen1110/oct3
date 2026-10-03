import assert from "node:assert/strict";
import { test } from "node:test";
import { executeFreeRegistration, prepareFreeRegistration } from "../src/browser/luma-registration";
import { FREE_REGISTRATION_EVENT_URL } from "../src/shared/registration";
import { input, publicState, body, success, mock, type Options } from "./helpers/luma-registration";
const ticketId = "ttype-WXJIzZWOLvIP01x";
const attendee = input().attendee;
test("free RSVP preparation validates captured event state and blank form without filling or submitting", async t => {
  const m = mock(t); const result = await prepareFreeRegistration(input());
  assert.ok(result.snapshot); assert.equal(result.snapshot.event_start_at, "2026-10-17T01:00:00.000Z");
  assert.equal(result.cleanup, "confirmed"); assert.deepEqual(m.allowed, []); assert.deepEqual(m.fills, []);
});
test("preparation blocks dialog-triggered remote mutation", async t => {
  const m = mock(t, { early: "opener" }); await prepareFreeRegistration(input()); assert.equal(m.allowed.length, 0); assert.equal(m.blocked.length, 1);
});
test("changed availability, approval, ticket price, date, guest and nonblank form reject preparation", async t => {
  const variants = [ { ...publicState(), registration_availability: "closed" }, { ...publicState(), ticket_info: { ...publicState().ticket_info, require_approval: true } },
    { ...publicState(), ticket_types: [{ ...publicState().ticket_types[0], cents: 100 }] }, { ...publicState(), event: { ...publicState().event, start_at: "2026-10-18T01:00:00.000Z" } },
    { ...publicState(), guest_data: { email: attendee.email } } ];
  for (const [i, state] of variants.entries()) await t.test(String(i), async t => { const m = mock(t, { state }); assert.equal((await prepareFreeRegistration(input())).snapshot, undefined); assert.equal(m.allowed.length, 0); });
  await t.test("prefilled", async t => { mock(t, { prefilled: true }); assert.equal((await prepareFreeRegistration(input())).snapshot, undefined); });
});
test("invalid approval, expiry, attempt and attendee fail before provider calls", async t => {
  const m = mock(t);
  for (const change of [{ approved: false }, { expires_at: "2000-01-01T00:00:00Z" }, { attempt_key: "other" }, { action_hash: "bad" }, { revision: -1 }]) {
    const value = input(); Object.assign(value.authorization, change); assert.equal((await executeFreeRegistration(value)).status, "needs_human");
  }
  const value = input(); value.attendee = { ...attendee, email: "bad" }; await executeFreeRegistration(value); assert.equal(m.calls.length, 0);
});
test("execution blocks early requests then permits exactly one matching final POST and exposes only safe confirmation", async t => {
  for (const early of ["goto", "opener"] as const) await t.test(early, async t => {
    const m = mock(t, { early, duplicate: true }); const result = await executeFreeRegistration(input());
    assert.equal(result.status, "confirmed"); assert.equal(m.allowed.length, 1); assert.equal(m.blocked.length, 2); assert.equal(result.confirmation_ref, "ticket_synthetic");
    assert.equal(result.evidence[0].kind, "merchant_confirmation"); assert.equal(result.evidence[0].source_url, FREE_REGISTRATION_EVENT_URL);
    assert.doesNotMatch(JSON.stringify(result), /synthetic-attendee|Synthetic Attendee|private-ticket|private-proxy|synthetic-provider-key|wss:/);
  });
});
test("malformed, extra, payment, wrong attendee and nested extras never leave browser", async t => {
  const variants = [null, { ...body(), payment_method: "card" }, { ...body(), extra: true }, { ...body(), email: "other@example.test" }, { ...body(), expected_amount_cents: 1 }, { ...body(), phone_number: "+15555550123" },
    { ...body(), ticket_type_to_selection: { [ticketId]: { count: 2, amount: 0 } } },
    { ...body(), ticket_type_to_selection: { [ticketId]: { count: 1, amount: 0, payment_method: "card" } } },
    { ...body(), registration_answers: [{ ...body().registration_answers[0], private_extra: "unexpected" }] } ];
  for (const [i, requestBody] of variants.entries()) await t.test(String(i), async t => {
    const m = mock(t, { requestBody }); const result = await executeFreeRegistration(input()); assert.equal(m.allowed.length, 0); assert.equal(result.status, "needs_human"); assert.equal(result.uncertain, false);
  });
});
test("pending, waitlist, wrong ticket, malformed and lost responses remain uncertain", async t => {
  const variants: Options[] = [{ response: { ...success(), approval_status: "pending" } }, { response: { ...success(), approval_status: "waitlist" } },
    { response: { ...success(), event_tickets: [{ api_id: "ticket_synthetic", event_ticket_type_api_id: "other" }] } },
    { response: { ...success(), status: "failed" } }, { response: { ...success(), event_tickets: [{ ...success().event_tickets[0], amount: 100 }] } },
    { response: { ...success(), event_tickets: [...success().event_tickets, ...success().event_tickets] } }, { malformedResponse: true }, { lost: true }];
  for (const [i, options] of variants.entries()) await t.test(String(i), async t => {
    const m = mock(t, options); const result = await executeFreeRegistration(input()); assert.equal(m.allowed.length, 1); assert.equal(result.status, "needs_human"); assert.equal(result.uncertain, true); assert.equal(result.confirmation_ref, undefined);
  });
});
test("unrecognized provider status cannot inject attendee or private ticket links into evidence", async t => {
  mock(t, { response: { ...success(), approval_status: `${attendee.email} https://luma.com/OpenTogether?tk=private-ticket&pk=private-proxy` } });
  const result = await executeFreeRegistration(input()); assert.equal(result.uncertain, true); assert.doesNotMatch(JSON.stringify(result), /synthetic-attendee|private-ticket|private-proxy|\?tk=/);
});

test("blank optional phone from the current Luma form preserves the exact free payload", async t => {
  const requestBody = { ...body(), first_name: "", last_name: "", phone_number: "", payment_method: null, payment_currency: null, coupon_code: null, token_gate_info: null, eth_address_info: null, solana_address_info: null, currency: null, event_invite_api_id: null, solana_address: null, solana_wallet_type: null, opened_from: null };
  const m = mock(t, { requestBody }); const result = await executeFreeRegistration(input());
  assert.equal(m.allowed.length, 1); assert.equal(result.status, "confirmed");
});

test("unexpected extra ticket or explicit attendee mismatch remains uncertain without leaking identity", async t => {
  const variants = [
    { ...success(), event_tickets: [...success().event_tickets, { api_id: "ticket_unexpected", event_ticket_type_api_id: "other", amount: 100 }] },
    { ...success(), email: "different-attendee@example.test" },
    { ...success(), email: { unexpected: true } },
  ];
  for (const [index, response] of variants.entries()) await t.test(String(index), async t => {
    const m = mock(t, { response }); const result = await executeFreeRegistration(input());
    assert.equal(m.allowed.length, 1); assert.equal(result.status, "needs_human"); assert.equal(result.uncertain, true);
    assert.equal(result.confirmation_ref, undefined);
    assert.doesNotMatch(JSON.stringify(result), /different-attendee|synthetic-attendee|private-ticket|private-proxy/);
  });
});

test("approved provider ticket does not claim confirmation email delivery", async t => {
  mock(t); const result = await executeFreeRegistration(input());
  assert.equal(result.status, "confirmed");
  assert.match(result.evidence[0].detail, /Confirmation email delivery was not verified/);
  assert.doesNotMatch(result.evidence[0].detail, /optional account-management/);
});
