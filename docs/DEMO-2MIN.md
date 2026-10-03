# Cue — two-minute demo

**Theme:** Make what your agents want. **Promise:** Hands free. In good hands.

**Stage rule:** show a live connected product and timestamped, previously observed outcomes. This is a two-minute presentation, not a promise that four merchant workflows finish in two minutes. Do not repeat the confirmed RSVP or place a purchase.

## Ready before the clock

- Open the live [Vercel dashboard](https://oct3-five.vercel.app), already authenticated, with the latest reviewed deployment. Keep attendee details, credentials, payment methods and scannable codes out of the projected area.
- Launch the real Claude caller privately from the repository: `OCT3_BASE_URL=https://oct3-five.vercel.app node --env-file=.env.local scripts/claude-demo.mjs`. Leave `/mcp` ready. Never display `.env.local`.
- Pin the exact saved mission ID and returned dashboard/worker links. For a fresh four-lane rehearsal, use [boba-outing.json](../examples/boba-outing.json) with a new stable key **before** presenting; reuse that same input/key on retries. Status reads must reuse its ID. Research and sandbox service payment consume credits but authorize no merchant commitment.
- **Evidence distinction:** the proven hosted Claude submission originally contained three lanes. The later food success and Amazon $3.99 observation are separate actual probes. Do not pretend they came from that original mission. If no saved four-lane live run is ready, use the visibly labeled four-worker example for routing, then explicitly switch to “separate verified runs” for outcomes. Never edit a fixture to impersonate live evidence.
- Pre-open: exact worker reviews; saved Luma confirmation; **Connections → Link** test-mode state; a safe evidence slide showing the test request lifecycle; **Past missions**; optional timestamped Gemini draft proof. Use the fixture budget example in a separate tab, visibly marked **Example**.
- The passkey segment uses the already completed native approval and its saved confirmation. Show a recording of the actual ceremony only if one exists. Otherwise show its recorded approval state; do not fake a biometric prompt or trigger another registration.

## The 120-second run

| Time | Exact presenter words | Screen action |
|---|---|---|
| **0:00–0:12** | “Agents can write the plan. They still need hands. This is Cue: hands free, in good hands. Claude connects to it as a tool.” | Hold the Cue hero for two seconds; switch to the terminal and show `/mcp` with oct3 connected. No setup typing or secrets. |
| **0:12–0:25** | “One request routes four jobs: Amazon supplies, Fiverr creative help, a Luma event, and boba pickup. The agent gets one mission to follow.” | Show the request from `examples/boba-outing.json`, then the saved handle and four-worker board. Use “This labeled example shows the four-way routing” if the board is a fixture. Do not start another paid run just to animate progress. |
| **0:25–0:43** | “Every worker returns something inspectable: a source, a review link, and an honest status. Amazon found the exact single tube. Fiverr returned beat makers. Boba read back my exact $6.60 recipe. These are previews, ready for my decision.” | Open exact returned task-review links. Show Amazon’s timestamped Browserless observation for the single-tube ASIN, Fiverr’s observed options, and the food proof with four selected modifiers. If these are separate runs, label the screen **Separate verified runs**. Do not present the displayed prices as fee-inclusive checkout totals. |
| **0:43–1:00** | “The model proposes. Code enforces the boundary: exact item, amount, revision and approval. Here, changing the budget invalidates the old plan. A prompt cannot override that check.” | Switch to the labeled example; change $900 to $650 and show the revised plan/invalidated approval. Keep **Example** visible. Briefly point to the deterministic boundary summary: **current revision + exact approval + budget hold**. This interaction illustrates independently tested guards; it is not a live merchant price comparison. |
| **1:00–1:18** | “For a real commitment, the manager confirms the exact proposal with a native passkey. We did that for this free Luma event, then separately registered. The provider confirmed it. Zero dollars; one real completed action.” | Show the saved $0 OpenTogether review, recorded passkey-approved state and matching provider confirmation. Keep **Previously completed · actual provider evidence** visible. Do not click **Register now**. No receipt URL was captured: show confirmation evidence, not a fabricated receipt link. |
| **1:18–1:35** | “Link is connected in test mode. We created, read back and canceled a test spend request. That proves the wallet request boundary—not a merchant charge. Our separate Stripe sandbox service fee also persists with the mission.” | Show hosted Connections: **connected**, **test mode**. Switch to the safe test-request lifecycle card: **created → verified → canceled**, **no credentials requested**. Show the separate 50-cent sandbox service-fee receipt. Never call either a paid merchant order. |
| **1:35–1:46** | “Gemini can turn a spoken brief into an editable draft. You review it and explicitly apply it; recording never sends a mission.” | Show the recorded, labeled **synthetic microphone → real hosted Gemini** draft proof; briefly reveal **Use this draft**. Prefer this proven clip over an untested live microphone. Latest actual hosted roundtrip: 2.968 seconds. |
| **1:46–2:00** | “Supabase keeps the mission and history. Back in Claude, the same ID returns outcomes and what still needs a person. One request, clear approvals, useful evidence. That’s what our agents want.” | Open **Past missions**, reload/select the saved record, then return to Claude and request status for the same ID. Finish on structured results plus the live Vercel dashboard link. |

## Terminal words and safe commands

At the prepared Claude prompt, use:

> Use oct3 to read mission status for **[the pinned saved mission ID]**. Return each worker’s current status, exact review/provider links, observed outcomes and remaining blockers. Do not submit, retry, approve, register, purchase, or contact anyone.

The read-only CLI equivalent is:

```sh
OCT3_BASE_URL=https://oct3-five.vercel.app npm run cli -- status <saved-mission-id>
```

For the four-lane request on screen, use the tracked JSON rather than improvising unsupported tasks. If presenting a live submission, do it in the pre-stage rehearsal and preserve its real returned ID. The caller credential submits/reads; it does not gain manager approval authority.

## Cuts and recovery

1. **Running 10 seconds late:** cut Gemini; keep it as the first Q&A extra. Do not rush the approval/result distinction.
2. **Running 20 seconds late:** also replace the interactive budget change with the already captured labeled before/after. Keep the exact-revision explanation.
3. **Terminal/model slow:** show the timestamped actual Claude submit/status transcript, say “Here is the recorded run,” then read saved status via CLI. Do not claim a recording is live.
4. **Merchant slow or changed:** keep Cue’s saved evidence and source timestamp on screen. Say “The worker stops and hands this back.” Never refresh every lane during the talk or conceal a blocker.
5. **Link slow:** show the safe provider proof: test request created, read, canceled; no payment credentials requested. This segment never depends on creating a new request on stage.
6. **History/network unavailable:** use a labeled capture of the actual saved mission. Keep the mission ID consistent across terminal and dashboard.

**Non-negotiable 70-second core:** connected Claude → four-way routing → exact review/guard → saved passkey-approved $0 Luma confirmation → same-ID result. Food and Link evidence remain visible as compact cards; cut decorative interactions first.

## Proven facts and claim limits

| Claim | Evidence | Say no more than |
|---|---|---|
| Real Claude → hosted mission → status; Eve dispatch | [Hosted caller proof](../reports/performance/hosted-claude-paid-research.json) | Original run: Fiverr three options, Luma one, Amazon explicit 503 handoff. Four-lane routing is a later addition. |
| Amazon research now observed | [Integrated Browserless proof](../reports/performance/browserless-amazon-proof.json), [independent Browserless check](../reports/verification/browserless-amazon-readonly.md), [earlier public-price observation](../reports/performance/local-work-amazon-readonly.json) | Browserless reopened the exact single-tube ASIN and the integrated worker returned priced search options; the earlier public observation showed $3.99. Signed-in cart, checkout and order remain unproven. |
| Boba selected option | [Food actual final success](../reports/performance/food-demo-retest.json), [independent check](../reports/verification/food-final-independent.md) | One $6.60 item estimate; Potrero and four recipe controls verified in 52.971 s. **Add to order was never clicked.** No food order. |
| Native passkey and real free event completion | [Actual confirmation](../reports/performance/native-passkey-live-event.json) | One exact $0 OpenTogether RSVP confirmed. OS/device verification—not a guarantee of fingerprint use. No captured receipt URL. |
| Link hosted connection; actual test provider lifecycle | [Hosted connection](../reports/performance/link-wallet-hosted.json), [provider smoke](../reports/performance/link-wallet-provider-smoke.json), [guard tests](../reports/verification/link-wallet-independent.md) | Connected test wallet; test spend request created/read/canceled. No credential issued or merchant charge. Guard tests use mocked provider boundaries. |
| Gemini draft-only flow | [Latest hosted retest](../reports/performance/hosted-voice-demo-retest.json) | Real Gemini, synthetic 4.842 s microphone fixture, HTTP 200 in 2.968 s, explicit Apply, zero mission submissions. |
| Supabase-backed history and live dashboard | [Hosted UI retest](../reports/performance/hosted-ui-demo-retest.json) | Actual authenticated 1440/390 review/history passed; no mutations. Not external merchant order-history import. |

## Why judges should care

- **Innovation:** an external agent delegates bounded real-world work and receives inspectable results, while deterministic code retains authority over commitments.
- **Design:** one legible mission desk, exact review links, explicit native confirmation and useful handoffs.
- **Functionality:** actual Claude/Eve dispatch, hosted persistence, native-passkey-approved free RSVP, selected food controls, real Gemini inference, and clearly separated Stripe/Link test evidence.
- **Impact:** replaces fragmented coordination with one tracked request. Time saved and paid-purchase throughput are not measured; do not invent them.
- **Sponsor evidence:** Vercel live hosting; Claude/Eve caller and orchestration; Supabase durable state/history; Stripe sandbox service fee plus Link test wallet request; Gemini voice draft; Codex implementation and independent checks. Do not claim Supabase Queues/Cron, paid merchant completion, or a live multimodal microphone result beyond the evidence above.
