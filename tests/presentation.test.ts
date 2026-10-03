import assert from "node:assert/strict";
import { test } from "node:test";
import { presentMission } from "../src/server/presentation";
import type { Evidence, Lane, MissionView, Task } from "../src/shared/contracts";

// All records are synthetic, including those labeled live to exercise provenance
// decisions. These tests never dispatch a worker or access a merchant/network.
const sources: Record<Lane, string> = {
  amazon: "https://www.amazon.com/dp/SYNTHETIC",
  fiverr: "https://www.fiverr.com/synthetic/gig",
  event_tickets: "https://www.eventbrite.com/e/synthetic-tickets-123",
  food: "https://www.doordash.com/store/synthetic-123/",
};
function task(lane: Lane): Task {
  const id = `synthetic-${lane}`;
  return {
    id, lane, title: lane, status: "awaiting_approval", progress: "Synthetic verification",
    options: [{ id: `${id}-option`, title: "Synthetic option", description: "Not a real offer", source_url: sources[lane], merchant: lane, amount_minor: 100, currency: "USD", quantity: 1, recommended: true, reason: "Test", evidence_ids: [] }],
    proposal: { id: `${id}-proposal`, revision: 3, task_id: id, option_id: `${id}-option`, merchant: lane, title: "Synthetic proposal", source_url: sources[lane], quantity: 1, recipient_ref: "synthetic-private-profile", deadline: "2026-10-07T12:00:00Z", subtotal_minor: 100, tax_minor: 0, shipping_minor: 0, fees_minor: 0, total_minor: 100, currency: "USD", expires_at: "2026-10-07T12:00:00Z" },
    evidence: [],
  };
}
function mission(): MissionView {
  return {
    mission_id: "synthetic mission/&?#", revision: 3, status: "awaiting_approval", objective: "Synthetic link verification", deadline: "2026-10-07T12:00:00Z", headcount: 1,
    created_at: "2026-10-03T12:00:00Z", updated_at: "2026-10-03T12:00:00Z", mode: "live",
    budget: { limit_minor: 300, proposed_minor: 300, reserved_minor: 0, committed_minor: 0, uncertain_minor: 0, available_minor: 300 },
    service_payment: { status: "not_configured", amount_minor: 0, currency: "USD", mode: "test" },
    tasks: (Object.keys(sources) as Lane[]).map(task), evidence: [], blockers: [], next_actions: [], activity: [],
  };
}
function observed(target: Task, kind: Evidence["kind"], overrides: Partial<Evidence> = {}): Evidence {
  return { id: `synthetic-${kind}`, task_id: target.id, source_url: `${new URL(sources[target.lane]).origin}/${kind}?order_id=SYNTHETIC`, observed_at: "2026-10-03T12:00:00Z", title: "Synthetic provider evidence", detail: "No merchant transaction performed", mode: "live", kind, proposal_id: target.proposal!.id, revision: target.proposal!.revision, confirmation_ref: "SYNTHETIC-CONFIRMATION", ...overrides };
}
function confirmed(): MissionView {
  const view = mission();
  for (const target of view.tasks) {
    target.status = "confirmed";
    target.confirmation_ref = "SYNTHETIC-CONFIRMATION";
    target.evidence = [observed(target, "merchant_confirmation"), observed(target, "merchant_receipt")];
  }
  return view;
}
function freeze(value: object) {
  for (const child of Object.values(value)) if (child && typeof child === "object") freeze(child);
  Object.freeze(value);
}

test("Cue result links with synthetic records only", async t => {
  for (const name of ["OCT3_APP_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"]) {
    const previous = process.env[name];
    delete process.env[name];
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
  }
  const present = (view: MissionView) => presentMission(view, "https://cue.example");

  await t.test("dashboard, API and review links preserve exact mission/task/revision and input state", () => {
    const view = mission();
    view.tasks[0].id = "task /&?#";
    const before = structuredClone(view);
    freeze(view);
    const output = present(view);
    assert.deepEqual(view, before);
    assert.notEqual(output, view);
    assert.equal(new URL(output.dashboard_url!).searchParams.get("mission"), view.mission_id);
    assert.equal(new URL(output.result_url!).pathname, `/api/missions/${encodeURIComponent(view.mission_id)}`);
    for (const [index, result] of output.tasks.entries()) {
      assert.notEqual(result, view.tasks[index]);
      const review = new URL(result.links!.review_url);
      assert.equal(review.origin, "https://cue.example");
      assert.equal(review.searchParams.get("mission"), view.mission_id);
      assert.equal(review.searchParams.get("task"), result.id);
      assert.equal(review.searchParams.get("revision"), "3");
      assert.equal(result.links!.preview_url, sources[result.lane]);
      assert.equal(result.links!.preview_kind, "provider_page");
      assert.equal(result.links!.receipt_state, "not_ready");
    }
  });

  await t.test("revision changes produce new review links without rewriting earlier results", () => {
    const view = mission();
    const old = present(view);
    view.revision = 4;
    const revised = present(view);
    assert.equal(new URL(old.tasks[0].links!.review_url).searchParams.get("revision"), "3");
    assert.equal(new URL(revised.tasks[0].links!.review_url).searchParams.get("revision"), "4");
  });

  await t.test("Luma research links use exact allowed hosts without implying RSVP confirmation", () => {
    for (const host of ["luma.com", "www.luma.com", "lu.ma", "www.lu.ma"]) {
      const view = mission();
      view.tasks[2].proposal!.source_url = `https://${host}/synthetic-event`;
      const links = present(view).tasks[2].links!;
      assert.equal(links.preview_url, `https://${host}/synthetic-event`);
      assert.equal(links.preview_kind, "provider_page");
      assert.equal(links.confirmation_url, null);
      assert.equal(links.receipt_url, null);
      view.tasks[2].proposal!.source_url += "?token=synthetic-private";
      assert.equal(present(view).tasks[2].links!.preview_url, null);
    }
  });

  await t.test("bound live checkout observations override provider pages; stale and foreign observations do not", () => {
    const view = mission();
    const target = view.tasks[0];
    const valid = observed(target, "checkout_preview");
    target.evidence = [valid, observed(target, "checkout_preview", { revision: 2, source_url: "https://www.amazon.com/stale" }), observed(target, "checkout_preview", { task_id: "other-task", source_url: "https://www.amazon.com/foreign" })];
    assert.equal(present(view).tasks[0].links!.preview_url, valid.source_url);
    assert.equal(present(view).tasks[0].links!.preview_kind, "checkout_preview");
    target.evidence = target.evidence.slice(1);
    assert.equal(present(view).tasks[0].links!.preview_url, sources.amazon);
    assert.equal(present(view).tasks[0].links!.preview_kind, "provider_page");
  });

  await t.test("all lanes return independently captured merchant confirmation and receipt URLs", () => {
    const view = confirmed();
    const output = present(view);
    for (const [index, target] of output.tasks.entries()) {
      assert.equal(target.links!.confirmation_url, view.tasks[index].evidence[0].source_url);
      assert.equal(target.links!.receipt_url, view.tasks[index].evidence[1].source_url);
      assert.equal(target.links!.receipt_state, "available");
    }
    // A committed proposal may remain at its original revision after other lanes replan.
    view.revision = 4;
    assert.equal(present(view).tasks[0].links!.receipt_state, "available");
  });

  await t.test("receipt and confirmation require matching task, proposal, proposal revision and confirmation reference", () => {
    const mismatches: Partial<Evidence>[] = [{ task_id: "other-task" }, { proposal_id: "old-proposal" }, { revision: 2 }, { confirmation_ref: "OTHER-CONFIRMATION" }, { proposal_id: undefined }, { revision: undefined }, { confirmation_ref: undefined }];
    for (const mismatch of mismatches) {
      const view = confirmed();
      for (const target of view.tasks) target.evidence = target.evidence.map(evidence => ({ ...evidence, ...mismatch }));
      for (const target of present(view).tasks) {
        assert.equal(target.links!.confirmation_url, null, JSON.stringify(mismatch));
        assert.equal(target.links!.receipt_url, null, JSON.stringify(mismatch));
        assert.equal(target.links!.receipt_state, "not_captured");
      }
    }
    for (const absent of ["proposal", "confirmation_ref"] as const) {
      const view = confirmed();
      delete view.tasks[0][absent];
      assert.equal(present(view).tasks[0].links!.confirmation_url, null);
      assert.equal(present(view).tasks[0].links!.receipt_url, null);
    }
  });

  await t.test("fixture, replay and test evidence or mission mode cannot masquerade as live merchant outcomes", () => {
    for (const mode of ["fixture", "test", "replay"] as const) {
      const view = confirmed();
      view.tasks[0].evidence = view.tasks[0].evidence.map(evidence => ({ ...evidence, mode }));
      assert.equal(present(view).tasks[0].links!.receipt_url, null);
      assert.equal(present(view).tasks[0].links!.confirmation_url, null);
      assert.equal(present(view).tasks[0].links!.receipt_state, "not_captured");
      view.mode = mode;
      for (const target of present(view).tasks) {
        assert.equal(target.links!.receipt_url, null);
        assert.equal(target.links!.confirmation_url, null);
        assert.equal(target.links!.receipt_state, "example");
      }
    }
  });

  await t.test("execution, handoff and failed states cannot publish completion links even with evidence", () => {
    for (const status of ["queued", "researching", "options_ready", "prepared", "awaiting_approval", "executing", "needs_human", "failed"] as const) {
      const view = confirmed();
      view.tasks[0].status = status;
      const links = present(view).tasks[0].links!;
      assert.equal(links.receipt_url, null, status);
      assert.equal(links.confirmation_url, null, status);
      assert.equal(links.receipt_state, "not_ready", status);
    }
  });

  await t.test("service payment, Link authorization and ordinary observations never imply merchant receipts", () => {
    const view = confirmed();
    view.service_payment = { status: "paid", amount_minor: 100, currency: "USD", mode: "live", reference: "SYNTHETIC-STRIPE", checkout_url: "https://checkout.stripe.com/synthetic" };
    const target = view.tasks[0];
    target.approval = { id: "synthetic-approval", proposal_id: target.proposal!.id, revision: 3, state: "approved", link_state: "succeeded", link_approval_url: "https://link.com/synthetic" };
    target.evidence = [observed(target, "observation"), observed(target, undefined), observed(target, "merchant_receipt", { source_url: "https://pay.stripe.com/receipts/synthetic" }), observed(target, "merchant_confirmation", { source_url: "https://link.com/synthetic" })];
    const links = present(view).tasks[0].links!;
    assert.equal(links.receipt_url, null);
    assert.equal(links.confirmation_url, null);
    assert.equal(links.receipt_state, "not_captured");
  });

  await t.test("missing receipt stays explicit; confirmation alone or global evidence is insufficient", () => {
    const view = confirmed();
    view.evidence = [...view.tasks[0].evidence];
    view.tasks[0].evidence = view.tasks[0].evidence.slice(0, 1);
    const links = present(view).tasks[0].links!;
    assert.ok(links.confirmation_url);
    assert.equal(links.receipt_url, null);
    assert.equal(links.receipt_state, "not_captured");
  });

  await t.test("unsafe, cross-merchant and credential-bearing URLs are never emitted as navigable links", () => {
    const unsafe = ["javascript:alert(1)", "http://www.amazon.com/order", "https://www.amazon.com:8443/order", "https://user:password@www.amazon.com/order", "https://www.amazon.com.evil.example/order", "https://www.fiverr.com/order", "https://www.amazon.com/order?token=SYNTHETIC", "https://www.amazon.com/order?session_id=SYNTHETIC", "https://www.amazon.com/order?redirect=https://evil.example", "https://www.amazon.com/order#access_token=SYNTHETIC", "/relative-order", "not a URL"];
    for (const source_url of unsafe) {
      const view = confirmed();
      const target = view.tasks[0];
      target.proposal!.source_url = source_url;
      target.options[0].source_url = source_url;
      target.evidence = [observed(target, "checkout_preview", { source_url }), observed(target, "merchant_confirmation", { source_url }), observed(target, "merchant_receipt", { source_url })];
      const links = present(view).tasks[0].links!;
      assert.equal(links.preview_url, null, source_url);
      assert.equal(links.preview_kind, "unavailable", source_url);
      assert.equal(links.confirmation_url, null, source_url);
      assert.equal(links.receipt_url, null, source_url);
    }
  });

  await t.test("safe public origins are selected explicitly and unsafe configured/request origins fail closed", () => {
    const view = mission();
    assert.equal(new URL(presentMission(view).dashboard_url!).origin, "http://127.0.0.1:3003");
    for (const origin of ["https://cue.example", "http://localhost:3003", "http://127.0.0.1:3003", "http://[::1]:3003"]) assert.equal(new URL(presentMission(view, origin).dashboard_url!).origin, origin);
    for (const origin of ["http://cue.example", "https://user:pass@cue.example", "https://cue.example/private", "https://cue.example?token=SYNTHETIC", "https://cue.example#secret", "javascript:alert(1)"]) {
      assert.throws(() => presentMission(view, origin), Error, origin);
      process.env.OCT3_APP_URL = origin;
      try { assert.throws(() => presentMission(view, "https://cue.example"), Error, origin); }
      finally { delete process.env.OCT3_APP_URL; }
    }
    process.env.VERCEL_URL = "preview.example";
    assert.equal(new URL(presentMission(view).dashboard_url!).origin, "https://preview.example");
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "production.example";
    assert.equal(new URL(presentMission(view).dashboard_url!).origin, "https://production.example");
    process.env.OCT3_APP_URL = "https://configured.example";
    assert.equal(new URL(presentMission(view, "https://request.example").dashboard_url!).origin, "https://configured.example");
  });
});
