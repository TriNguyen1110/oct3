import assert from "node:assert/strict";
import { test } from "node:test";
import { rankCandidates } from "../src/browser/rank";
import { rankedOptions } from "../src/browser/index";
import type { ObservedCandidate, ResearchTaskInput } from "../src/browser/types";

const candidate = (title: string, amount_minor: number): ObservedCandidate => ({ title, source_url: `https://www.amazon.com/dp/${title}`, price_text: `$${amount_minor / 100}`, amount_minor, description: title, quantity: 1 });
const candidates = [candidate("PREMIUM0001", 2500), candidate("BUDGET00001", 300), candidate("MIDRANGE001", 900), candidate("CHEAPEST001", 100)];
const input: ResearchTaskInput = { task_id: "synthetic-rank", lane: "amazon", requirements: { category: "toothpaste", delivery_ref: "synthetic" }, deadline: "2026-10-04", budget_minor: 5000, attempt_key: "synthetic-rank" };

function setEnv(t: { after: (fn: () => void) => void }, changes: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(changes)) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
}

test("without a model, ranking is unavailable and page order is kept, not the cheapest three", async t => {
  setEnv(t, { ANTHROPIC_API_KEY: undefined });
  const result = await rankCandidates(candidates, input, new AbortController().signal);
  assert.deepEqual(result.ranking, { status: "unavailable", reason: "no model key is configured" });
  assert.deepEqual(result.candidates.map(item => item.title), ["PREMIUM0001", "BUDGET00001", "MIDRANGE001"]);
});

test("when the ranker fails, ranking is unavailable and page order is kept", async t => {
  setEnv(t, { ANTHROPIC_API_KEY: "synthetic-not-a-key" });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("synthetic network failure"); });
  const result = await rankCandidates(candidates, input, new AbortController().signal);
  assert.deepEqual(result.ranking, { status: "unavailable", reason: "the ranker failed" });
  assert.deepEqual(result.candidates.map(item => item.title), ["PREMIUM0001", "BUDGET00001", "MIDRANGE001"]);
});

test("a single observation is not called ranked", async t => {
  setEnv(t, { ANTHROPIC_API_KEY: undefined });
  const result = await rankCandidates([candidates[1]], input, new AbortController().signal);
  assert.equal(result.ranking.status, "unavailable");
});

test("an unranked option is never recommended; only the first ranked option is", async t => {
  setEnv(t, { ANTHROPIC_API_KEY: undefined });
  const proof = () => "synthetic-proof";
  for (const ranked of [await rankCandidates(candidates, input, new AbortController().signal), await rankCandidates([candidates[1]], input, new AbortController().signal)]) {
    const options = rankedOptions(ranked, input, proof);
    assert.ok(options.length >= 1);
    assert.equal(options.some(option => option.recommended), false);
    assert.match(options[0].reason, /not recommended/);
  }
  const ranked = rankedOptions({ candidates: candidates.slice(0, 3), ranking: { status: "ranked" } }, input, proof);
  assert.deepEqual(ranked.map(option => option.recommended), [true, false, false]);
});
