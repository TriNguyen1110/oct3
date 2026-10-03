import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "playwright-core";
import { collectCandidates, publicSourceUrl, researchUrl } from "../src/browser/extract";
import type { ResearchTaskInput } from "../src/browser/types";

const input: ResearchTaskInput = { task_id: "synthetic-luma", lane: "event_tickets", requirements: { event_url: "https://luma.com/synthetic-event", date: "2026-10-08T14:30:00-07:00", quantity: 1, attendee_ref: "synthetic" }, deadline: "2026-10-08T14:30:00-07:00", budget_minor: 2500, attempt_key: "synthetic-luma-readonly" };
function page(price: unknown, text = "Registration Register", date: string | undefined = "2026-10-08T14:30:00-07:00", currency = "USD"): Page {
  return { url: () => "https://luma.com/synthetic-event?token=synthetic-private", locator: (selector: string) => selector === "body" ? { innerText: async () => text } : { allTextContents: async () => [JSON.stringify({ "@type": "Event", name: "Synthetic Luma listing", startDate: date, offers: { price, priceCurrency: currency, availability: "https://schema.org/InStock" } })] } } as unknown as Page;
}

test("Luma exact-event allowlist rejects discovery, wrong merchant, credentials and lookalikes", () => {
  for (const host of ["luma.com", "www.luma.com", "lu.ma", "www.lu.ma"]) {
    assert.equal(publicSourceUrl(`https://${host}/Synthetic_event-123?token=synthetic#private`, "event_tickets"), `https://${host}/Synthetic_event-123`);
  }
  for (const url of ["https://luma.com/sf", "https://luma.com/discover", "https://luma.com/", "https://luma.com/user/name", "https://luma.com/event/extra", "https://luma.com.attacker.test/event", "https://user:password@lu.ma/event", "http://lu.ma/event", "https://lu.ma:8443/event", "https://www.amazon.com/event"]) {
    assert.throws(() => researchUrl({ ...input, requirements: { ...input.requirements, event_url: url } } as ResearchTaskInput), Error, url);
  }
  assert.throws(() => publicSourceUrl("https://luma.com/synthetic-event", "amazon"));
});

test("only explicit numeric USD zero is free; missing or malformed prices remain unknown", async () => {
  for (const price of [0, "0", "0.00"]) {
    const [candidate] = await collectCandidates(page(price), "event_tickets", input);
    assert.equal(candidate.amount_minor, 0);
    assert.equal(candidate.source_url, "https://luma.com/synthetic-event");
    assert.equal(candidate.available, undefined);
    assert.match(candidate.description, /no registration or RSVP was submitted or confirmed/);
  }
  for (const price of [undefined, null, "", " ", false, [], "Free", -1]) assert.deepEqual(await collectCandidates(page(price), "event_tickets", input), [], JSON.stringify(price));
  assert.deepEqual(await collectCandidates(page(0, "Registration Register", undefined, "EUR"), "event_tickets", input), []);
});

test("host approval and waitlist are observations, never confirmed RSVPs", async () => {
  const [approval] = await collectCandidates(page(0, "Registration Approval Required Request to Join"), "event_tickets", input);
  assert.equal(approval.available, undefined);
  assert.match(approval.description, /requires host approval/);
  assert.match(approval.description, /would not confirm an RSVP, and none was submitted/);
  const [waitlist] = await collectCandidates(page(0, "Registration Approval Required Join the waitlist"), "event_tickets", input);
  assert.equal(waitlist.available, false);
  assert.match(waitlist.description, /waitlist or full state; no RSVP was attempted/);
});

test("Luma date mismatch rejects the option and paid estimates preserve observed amounts", async () => {
  await assert.rejects(collectCandidates(page(0, "Register", "2026-10-09T14:30:00-07:00"), "event_tickets", input), /date differs/);
  const [paid] = await collectCandidates(page("12.50"), "event_tickets", { ...input, requirements: { ...input.requirements, quantity: 2 } } as ResearchTaskInput);
  assert.equal(paid.amount_minor, 2500);
  assert.equal(paid.quantity, 2);
  assert.equal(paid.available, undefined);
});
