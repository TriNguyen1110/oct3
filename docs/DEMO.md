# Demo runbook

The public demo is **https://oct3-five.vercel.app**. The stage starts with a
fresh Claude Code terminal connected to Cue's MCP endpoint, then shows the same
saved mission in the dashboard. See [the terminal runbook](CLAUDE_DEMO.md).

**Functional baseline: `d144a09`, October 3.** Native-passkey approval, voice draft, and free RSVP flow are deployed. The real manager enrolled a native passkey, approved the exact $0 Open Together action, and Cue recorded matching Luma confirmation. [Native passkey and event evidence](../reports/performance/native-passkey-live-event.json). The updated hero pairs a real classical marble close-up with cinematic monochrome styling. Its museum source and CC0 license are retained with the asset.

**Verified hosted research baseline: `21377a8`, October 3.** A real Claude Code caller
submitted one live research mission with explicit Stripe sandbox payment and
read its status. The same mission contains a verified 50-cent test receipt,
Fiverr's three observed options, Luma's selected event, and Amazon's HTTP 503
handoff. Supabase persists the mission and the saved manager profile.
[Hosted checks](../reports/performance/hosted-baseline.json) and
[actual mission](../reports/performance/hosted-claude-paid-research.json).

Historical free-RSVP preparation took 22.580 seconds. A later hosted prepare/review/approval-guard verification cycle took 17.330 seconds and produced a fresh $0 proposal. That measurement includes the prepare POST, review GET and missing-passkey rejection check; it is not isolated preparation latency. The approved action reached matching provider confirmation 27.428 seconds after native-passkey approval. That interval includes manager delay before **Register now**; it is not isolated execution or human-active time. One free RSVP is confirmed. No Amazon purchase or Fiverr order has occurred, and research prices do not become checkout totals.

**90 seconds is the presentation goal, not an end-to-end runtime guarantee.**
Replay saved research with its timestamp during repeated rehearsals. The budget
revision interaction remains a visibly labeled fixture; its illustrative prices
are not merchant observations. See [sponsor evidence](SPONSORS.md).

| Demo feature | Current evidence and limit |
|---|---|
| Claude terminal → MCP → API | Actual hosted `submit_mission` then `mission_status`, exact input and stable key; caller cost $0.11198925. |
| Stripe service payment | Actual 50-cent sandbox payment through the real MPP verifier; persisted receipt and same-mission replay. Developer-supplied test method, not a manager-funded wallet. |
| Concurrent research | Hosted Fiverr 3 options, Luma 1 option; Amazon HTTP 503 remains an explicit handoff. |
| Supabase profile and history | Actual private manager profile save/reload and independent database read; workspace history persists. Preferences never authorize a purchase. |
| Budget and exact approval guards | Independent local negative/concurrency checks plus actual Supabase race/overspend checks. Interactive budget planning uses labeled fixtures. |
| Dashboard payment recovery | Saved mission survives 402/503; explicit sandbox-payment action resumes that same mission. Mocked rendered recovery checks passed. |
| Free event preparation and registration | Fresh hosted $0 proposal, native-passkey approval, and matching Luma confirmation verified. One actual free RSVP; no receipt URL was captured. |
| Amazon/Fiverr purchase and receipts | Still handoffs. Both latest preflights were signed out; exact fee-inclusive totals and orders remain unverified. |
| Food pickup | Latest selected-state smoke ended `merchant_changed` after 25.665 s because Potrero was absent. No cart or checkout; keep it labeled a handoff. |
| Link merchant wallet | Account connection and one saved method verified. A synthetic 50-cent test request was created, read back and canceled without requesting approval or credentials. Guarded product request flow is separate from merchant execution; no paid checkout is proven. |
| Hosted Vercel/Eve | Public dashboard, authenticated readiness/profile and Eve health all HTTP 200; actual hosted Eve research dispatch verified. |

To rehearse the research API explicitly with sandbox payment:

```sh
OCT3_BASE_URL=https://oct3-five.vercel.app npm run cli -- submit examples/team-outing.json --key cue-stage-outing-001 --pay-test
OCT3_BASE_URL=https://oct3-five.vercel.app npm run cli -- status <returned-mission-id>
```

Reuse the same exact input and key on retry. The sample is live read-only
research with a planning budget, not authorization to spend or register.
The current independent suite is 135 passes, zero failures and two opt-in
integration skips; the new free-registration boundaries have their own
[verification report](../reports/verification/free-registration.md).

Supabase Queues and Cron are planned extensions; neither is active in this
build. They must not be presented as implemented sponsor use.

## Timing evidence

Read-only browser measurements on October 3, 2026 used separate oct3 profiles
and the shared US proxy pool. These are individual probe durations including
cleanup, not percentiles or measurements of the deployed application.

| Operation | Observed result | Wall time |
|---|---|---:|
| Amazon supplies research | HTTP 503; explicit blocker | 7.2 s |
| Fiverr flyer research | Three observed starting-price options | 15.4 s |
| Eventbrite example event | Event/date/minimum price; six-seat inventory unverified | 13.6 s |
| Separate Claude ranking check | Two relevant flyer gigs selected | 1.3 s |
| Full local API → Claude/Eve → three lane outcomes | Fiverr 3 options, Eventbrite 1 option; Amazon explicit handoff | **21.036 s** |
| Local live submission acknowledgement | Durable mission ID returned | **575 ms** |
| Local fixture submit / status / replan | Application path only; no browsers | **59 / 13 / 18 ms** |
| Local synthetic Chrome component-tool run with real Claude | Four values retained, conditional field discovered, ten tool calls, zero submission | **20.654 s** |
| Real CLI/MCP verification journey | Auth, submit, dedupe, reads, revision, approval boundaries | **7.14 s** |
| Combined local sandbox payment → Eve → research | Handle in 5.390 s; settled with two initial blockers | **27.428 s** |
| Hosted fresh Claude caller → sandbox-paid research | Submission/status verified; Fiverr and Luma results, Amazon handoff | End-to-end latency not separately measured |
| Hosted Gemini voice → editable draft | Latest actual browser/provider run; 4.842 s synthetic microphone fixture; no submission | **3.238 s** |
| Hosted free-event prepare/review/guard cycle | Prepare POST + review GET + missing-passkey rejection check; no registration in that cycle | **17.330 s** |
| Native-passkey approval → matching Luma confirmation | One actual $0 RSVP; interval includes manager Register-now delay | **27.428 s** |

The three browser probes ran concurrently. Do not add their times and describe
that as observed mission latency; do not assume the slowest probe alone predicts
the complete journey. [Probe details](../src/browser/README.md).

## Before rehearsal

1. Use the canonical `oct3` repository and Node 24. Follow
   [COMMANDS.md](../COMMANDS.md); the coordinator starts the single dev server.
   Use the actual deployed URL only after deployment and authenticated access
   have been verified.
2. Configure the agent token in the caller's environment and the manager token
   in the board login. Keep both out of visible commands and recordings.
   Confirm [readiness](../app/api/readiness/route.ts); configured does not mean
   live-tested.
3. Use the selected Open Together event, October 16 at 18:00 PDT, with quantity
   one and the saved manager profile. The tracked team-outing input uses this
   exact event. A mismatch must remain a blocker. One RSVP is already confirmed;
   do not register again during rehearsal.
4. Warm the app with an authenticated status read and load the board. Reuse the
   persistent remote profiles. Do not leave extra browser sessions running:
   active profiles can block workers and add unnecessary cost.
5. Run one live research mission before presenting; record its mission ID,
   observation time and elapsed time. Preserve that exact mission for status
   reads and evidence review. Calling `status` does not rerun browsers.
6. Prepare one separate fixture mission for the budget/approval interaction.
   Its mode label stays visible. Before rehearsing, run the current checks and
   read the independent verifier's findings; a passing typecheck is insufficient.

## External-agent commands

The caller needs only submit, status and list. The CLI reads the same ignored
environment file as the app via the package script:

```sh
npm run cli -- submit /tmp/oct3-demo-mission.json --key oct3-stage-live-001
npm run cli -- status <mission-id>
npm run cli -- list
```

Use a valid [MissionInput](../src/shared/contracts.ts) JSON document with
`"mode": "live"` or `"mode": "fixture"`. Reuse the exact submission key and
input after a network failure; a changed input needs a new key. Record the
returned `mission_id`, then poll or read its status. Do not repeatedly submit
new missions while waiting.

An MCP client connects to `<origin>/api/mcp` with the agent bearer credential
configured privately. Show **submit_mission**, followed by **mission_status**
for the returned ID. **list_missions** retrieves recent work. There is no extra
OAuth, account-creation or payment flow in this demo interface.

For a quick fixture check:

```sh
npm run cli -- submit examples/expo.json --key expo-demo-001
```

Repeatable measurement harness:

```sh
node --env-file=.env.local scripts/benchmark-demo.mjs
```

The optional `--live` benchmark requires `OCT3_EVENT_URL` and
`OCT3_EVENT_DATE` in the environment. It makes read-only research requests and
writes [performance evidence](../reports/performance/). The recorded live run
used the documented public October 7 example for measurement; it is not a
user-selected booking. Timings are single local observations, not guarantees.

## Presentation sequence — target 90 seconds

| Time | Show | Say only what the screen and evidence support |
|---|---|---|
| 0–15 s | Open the Cue cinematic home screen, then show an external agent calling CLI or MCP. | “An agent delegates one manager task across browser workers.” |
| 15–35 s | Three lanes progressing, or the same saved live mission with its observation timestamp visible. | Name which run is live now and which results were prepared earlier. Show grounded Fiverr/Eventbrite results and Amazon's observed blocker if it persists. |
| 35–60 s | Switch explicitly to the **fixture** planning mission. Lower $900 to $650 while preserving six passes. | “This labeled rehearsal demonstrates shared-budget revision.” The illustrative proposed plan changes from $788 to $588; old approvals become invalid. |
| 60–75 s | Show the saved native-passkey approval and matching Open Together confirmation. | “This exact $0 action was approved on-device and confirmed by Luma.” Keep the Stripe sandbox service receipt separate. |
| 75–90 s | The external agent retrieves structured status, evidence and next actions. | “The caller gets useful results and explicit remaining work.” Show the actual sponsor-use status and stop. |

If a later verified end-to-end live plan replaces the fixture segment, update
the table and evidence record first. Do not remove the label merely to make
the story appear smoother.

## Keep the demo responsive

- [Research orchestration](../src/server/research.ts) fans out lanes with
  `Promise.all`; each lane holds its own lease. One blocked merchant does not
  erase the other workers' results.
- A worker returns at most three grounded options. Claude ranking has a
  **20-second** limit, **200 output tokens**, and **no model retries**; a failure
  uses explicitly labeled deterministic ranking.
- Browser research is requested with a **90-second** timeout. The submission
  API awaits durable dispatch rather than the browser results; fixture mode
  produces its local scenario immediately. Observed local live handle latency was **575 ms**; hosted latency still
  needs measurement.
- Prefer status reads of the same mission during the presentation. If a worker
  is slow, show its progress/blocker and the other completed observations.
  Do not hide wait time by relabeling a replay or fixture as live.
- Keep a timestamped recording of a verified run as a labeled backup. A backup
  is presentation evidence, not a new successful transaction.

Before calling the demo ready, record one complete external-client journey,
submit/read/replan timings, the source revision, hosted or local environment,
each evidence mode, and all unresolved blockers. Supabase persistence, hosted
Eve execution and any Stripe receipt need their own actual proof. No time-saving
or reliability percentage is claimed from the current probes.

## Recover a failed research worker

Research follows the `job_search` reliability pattern: preserve the same task,
record its typed failure and cleanup outcome, and reconcile uncertain browser
state before trying again. There are no automatic browser retries.

The existing authenticated `POST /api/tasks/:id/retry-research` accepts
`{ "expected_revision": <current revision> }`. A failed task gets the initial
attempt plus one manual retry for the same revision/configuration, with a
15-second cooldown after each attempt. Another agent turn alone cannot restart
a task marked `needs_human`; the retry route must explicitly queue it.

After an uncertain start, unconfirmed cleanup or expired research claim, this
route first checks the **exact existing Surfsky lane profile**. Only its observed
`stopped` state permits recovery. Running, absent, duplicated or unknown profiles
remain blocked. No elapsed-time guess or changed credential clears that check.
An in-flight task or any reserved, committed or uncertain spend still blocks
research; this recovery route never resumes checkout.

For repeated technical failures, correct the relevant Surfsky key, assigned API
base URL or proxy configuration, then retry the **same task** after cooldown.
The private fingerprint notices that configuration change without exposing the
credential. A code repair must be deployed; the deployed Git commit participates
in the fingerprint. For a local code-only repair, bump the explicit runtime
version in [research-policy.ts](../src/server/research-policy.ts) with the repair
and restart the runtime. Do not bump it merely to bypass an unresolved failure.
Private attempt metadata stays outside the caller's MissionView; activity and
blocker text expose the observed failure, attempt number and next action.
