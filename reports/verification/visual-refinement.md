# Concierge visual refinement — independent SCREEN review

Verified local `http://127.0.0.1:3003` with actual Chrome rendering at 1440×1000 and 390×1000. All `/api/` traffic was intercepted with synthetic responses and external origins blocked. No real sign-in, approval, provider action or workspace mutation was performed.

Frozen source hashes:

| Path | SHA256 |
| --- | --- |
| `components/mission-desk.tsx` | `f115fae27635ca612050c5ccab06271ee2f89cb6a0ba3eb5516da1a23a31db33` |
| `components/worker-art.tsx` | `024276c4de07882ae13d4c5b51094086477cc11edbf58c908bdaf43990826971` |
| `app/globals.css` | `2a1678a3ec4e3a589f8ecae24e1c8f4e640b6d1c847cbd49d625b8eec0966a0f` |
| `components/free-registration-review.tsx` (unchanged) | `fe280c11974a17e23024683c79afc70de83bd843cf66fb2840d812bfa3559b09` |

Checks and evidence:

- `OCT3_SCREEN_UI_URL=http://127.0.0.1:3003 node --import tsx --test tests/visual-refinement-ui.test.ts`: both viewport cases pass (three reported tests including parent), zero failures, 4.564 seconds.
- All three original worker illustrations and cards render. Hero, warm palette, illustrated cards and glass command panel are visibly different from the earlier dashboard. Independent full-page and worker-modal screenshots were opened and inspected: `/tmp/cue-screen-verified-{1440,390}.png`, `/tmp/cue-screen-dialog-{1440,390}.png`.
- New mission and Saved profile require the manager-access dialog when unauthenticated. Password input remains masked; empty authentication submission is disabled. Native dialog focuses its content, background controls stay out of the tab sequence, and Escape/close work.
- Budget revision updates only the local example. All three worker dialogs retain explicit example labels and contain no approval or registration actions. No API mutation request was observed.
- With reduced motion enabled, the pointer spotlight receives no pointer coordinates, its pseudo-element is hidden and the card transform is disabled. Source inspection confirms navigation uses instant scrolling under reduced motion.
- Home and exercised dialogs have no horizontal document overflow, unnamed visible buttons or duplicate IDs. No page errors or failing local assets were observed. This is a targeted accessibility check, not a complete WCAG audit.
- `OCT3_PROFILE_UI_URL=http://127.0.0.1:3003 node --import tsx --test tests/preferences-ui.test.ts`: one pass, zero failures, 7.936 seconds. The mocked authenticated profile retains truthful status through edits, rejected/unconfirmed saves, successful save and reload failure.
- `npm run typecheck`: exit 0. The earlier broad backend suite was not repeated for this visual-only slice.

Two initial harness assumptions were corrected without feature changes: the example eyebrow includes adjacent revision text, and a native modal can briefly yield tab focus to browser chrome (represented by `document.body`) while background page controls remain inert. Final checks pass on the source hashes above.

Actual authenticated free-RSVP review rendering is separate coordinator evidence in `reports/performance/free-registration-ui.json`. This review does not claim a real RSVP or completed live merchant action.

Follow-up final-visibility check: a coordinator screenshot was taken during the entrance animation. Added a separate mocked authenticated live-shaped mission and pinned RSVP review case, covering both 1440/390 widths and normal/reduced motion. The test waits for finite animations to finish and verifies all three cards plus the open dialog have computed opacity `1`, visible display and nonzero area. The pinned synthetic approval button remains enabled without being clicked. All four cases pass (five reported including parent), zero failures, 7.364 seconds; typecheck passes again. Screenshots `/tmp/cue-screen-live-{1440,390}-{no-preference,reduce}.png` and corresponding `cue-screen-live-cards-*` captures record the final state; the desktop card capture was also visually inspected. No feature correction was needed and zero API mutation requests occurred.
