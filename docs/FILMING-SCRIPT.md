# Cue — two-minute filming script

**Theme:** Make Something Agents Want  
**Judging:** Innovation/originality · Design · Functionality · Impact  
**Core claim:** Cue is the execution layer for agents: one request becomes bounded browser work across hiring, logistics, and travel, with deterministic manager approval and inspectable evidence.

## Before recording

- Record at 1440p or higher with browser zoom set so the mission desk and worker states stay legible.
- Open the cinematic Cue home page, Claude Code with `/mcp`, the saved four-lane mission, the budget-revision example, the confirmed Luma result, the redacted Amazon confirmation, and Past missions.
- Use mission `421d6be5-462d-4848-bd7a-223cf3dd6cd4` for the same-ID readback.
- Keep credentials, attendee details, delivery address, payment digits, ticket codes, and the full Amazon order number off screen.
- Show **Previously completed** on provider-confirmed evidence and **Separate local-browser proof** on Amazon. Never imply Link funded that order or that the deployed mission worker clicked Buy.
- Capture clean screen recordings first, then record the voiceover. Keep cuts direct and cursor movement deliberate.

## Final cut

| Time | Picture and edit | Voiceover | Criterion |
|---|---|---|---|
| **0:00–0:08** | Black frame, then the automatically moving 3D Cue emblem. Title: **HANDS FREE. IN GOOD HANDS.** Cut to Hiring · Logistics · Travel. | “Agents can plan almost anything. But the moment work reaches a browser—hiring someone, moving goods, booking travel—they still need a human.” | Impact, Design |
| **0:08–0:20** | Claude Code. Show `/mcp` with Cue connected, type **Order the usual**, then flash the verified `submit_mission` → mission handle and same-ID `mission_status`. | “Cue gives agents hands. Claude connects through our MCP, sends one mission, and gets back a durable dashboard, review links, and structured results.” | Innovation, Functionality |
| **0:20–0:35** | Cut to the exact mission dashboard. Pan across Hiring, Logistics, Travel & booking; show the workers operating concurrently. | “One request fans out into browser workers: source talent, buy supplies, prepare pickup, and book an event. Supabase keeps every worker, budget, retry, and result in one shared mission.” | Innovation, Functionality |
| **0:35–0:49** | Open two review cards. Show source link, observed price, preview, and explicit blocker. Avoid long scrolling. | “Every worker returns something inspectable. A real source. The observed amount. A preview. And when a site blocks automation, an honest handoff instead of a fake success.” | Design, Functionality |
| **0:49–1:03** | Switch to the labeled budget example. Change $900 to $650 and show the prior approval becoming stale. Overlay: **REVISION + EXACT ACTION + BUDGET HOLD**. | “The model can propose; code keeps authority. Every commitment is bound to the exact item, amount, mission revision, and budget hold. Change the plan, and the old approval stops working.” | Functionality, Originality |
| **1:03–1:17** | Show the saved OpenTogether review, native-passkey-approved state, then matching Luma confirmation. Overlay: **$0 · PROVIDER CONFIRMED**. | “For travel, I approved one exact free event with my device passkey. Cue registered once, Luma confirmed it, and the evidence came back to the mission.” | Functionality, Design |
| **1:17–1:31** | Show the redacted Amazon evidence: one tube, item/shipping/tax/total, thank-you page, then confirmation email. Label it **SEPARATE LOCAL-BROWSER EXECUTION PROOF**. | “For logistics, our signed-in local-browser path reached the fee-inclusive Amazon review. I approved exactly seven dollars and seventy-three cents. It submitted once, opened Amazon’s confirmation, and the email arrived.” | Functionality |
| **1:31–1:41** | Brief Gemini voice-draft clip: record, transcript appears, then **Use this draft**. Do not submit. Overlay: **VOICE → EDITABLE DRAFT**. | “A manager can also speak the brief. Gemini turns it into an editable mission draft; nothing runs until the manager applies it.” | Design, Gemini |
| **1:41–1:52** | Past missions, then the same mission ID returning to Claude. Overlay: **34% LOWER OBSERVED WALL WAIT** and **27.7 s saved across three research lanes**. | “Parallel workers cut observed browser wait by thirty-four percent in our measured three-lane run, while history and evidence stay available to both the manager and the calling agent.” | Impact |
| **1:52–2:00** | Return to the moving Cue hero. Sponsor line fades in: **Claude · Supabase · Vercel · Stripe · Gemini · Codex**. End card: **CUE — YOUR AGENT’S EXTRA HANDS.** | “Cue turns agents from advisers into operators—across hiring, logistics, and travel—without giving up human control. We made what agents want: the ability to finish the job.” | Theme, all four |

## Exact Claude prompt on camera

```text
Order the usual.
```

The demo launcher maps this phrase to the tested four-lane preset, calls
`submit_mission` once, then reads the returned mission once. Its exact three MCP
tools are pre-authorized in Claude's automatic permission mode. Cue still stops
merchant commitments at its deterministic approval boundary.

Launch Claude Code with Cue already connected:

```sh
cd /Users/tringuyen/Developer/.worktrees/oct3
OCT3_BASE_URL=https://oct3-five.vercel.app npm run claude
```

## Performance notes

- Read the voiceover at roughly 145–155 words per minute. Pause after “Cue gives agents hands,” “code keeps authority,” and the final line.
- Let the opening hero breathe for one second before speaking. Its motion now runs automatically and pauses when off screen; reduced-motion viewers receive a still composition.
- Use hard cuts between terminal, mission desk, approval, and evidence. Use one soft dissolve only for the final return to the hero.
- Keep the terminal and browser footage live-sized. Do not add simulated typing, synthetic receipts, or fake biometric prompts.

## Evidence boundaries for the final edit

- The Claude Code → MCP → hosted mission → same-ID status loop is end to end and verified.
- The confirmed Luma RSVP used a native passkey approval and matching provider evidence.
- The confirmed Amazon order used an authorized signed-in local Chrome profile. It proves the local-browser purchase loop; the deployed Cue mission runner did not perform its final click, and Link did not fund it.
- Stripe evidence is a sandbox service fee and Link test lifecycle, separate from merchant payment.
- Gemini evidence uses synthetic microphone audio through the real hosted model and produces a draft only.
- The 34.0% figure is measured browser wall-wait compression across three research lanes, not a claim about all workflows or human labor.
