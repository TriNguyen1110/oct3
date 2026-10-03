# Food and hosted UI demo retest

Actual hosted Gemini audio-to-draft: HTTP 200 in 2,968 ms, synthetic microphone through real client audio conversion. Explicit Apply was required; no mission submitted or forbidden mutation attempted. Late actual initial-mission response preserved the recording.

Actual hosted authenticated UI: desktop 1440 passed in 3,606 ms; mobile 390 passed in 2,458 ms. Both opened a worker review and loaded/selected actual mission history (five entries). No overflow, page errors or mutations. No screenshots of private mission/profile contents saved.

Actual Surfsky food adapter: blocked after 29,888 ms because the exact Potrero store was not visible. Zero options, no cart/checkout/payment. Cleanup confirmed and durable lease released. A blocked preparation is not a successful menu or checkout result.

Targeted local tests: 9 passed in 16.710 s (food mission compatibility, strict network guard, selected store/modifier state). These use synthetic/local pages; they do not establish merchant completion.

Corrected one UI copy bug: the food form now explains the current one-drink Boba Guys pickup scope instead of claiming DoorDash-only research. Typecheck passed.

Evidence: ../performance/food-demo-retest.json, ../performance/hosted-ui-demo-retest.json, ../performance/hosted-voice-demo-retest.json.

Food diagnosis and fix: the actual location picker exposed the exact 580 20th Street autocomplete suggestion, but the adapter had never selected it. Added a bounded exact suggestion selection before the existing Potrero address/radio verification. Added a regression whose store only appears after suggestion selection; all five selected-state checks pass (22.951 s), and typecheck passes. The first actual rerun after the fix returned a generic merchant navigation/page-inspection error after 51.052 s, with confirmed cleanup. Live preparation is still not proven.

Final instrumented actual rerun: 50,336 ms, TimeoutError at item interaction. It advanced beyond autocomplete, exact Potrero address and selected-radio verification. Thus the store-selection fix is observed live; complete drink preparation remains blocked before modifier readback. Cleanup and exact profile stopped confirmed; durable lease released. No further provider runs attempted.

## Final live outcome: prepared option, checkout handoff

The targeted repair loop succeeded on the actual official Boba Guys site in 52,971 ms. The worker verified Potrero at 1002 16th St and its selected radio, then selected/read back 16oz ICED, Boba, Organic Half + Half (Clover), and 50% sweetness. The Add to order button displayed $6.60 and was never activated. One Classic Black option is returned with checkout_handoff; no cart, final taxes/total, checkout or order is claimed. Exact profile stopped, cleanup confirmed, lease released.

Repairs: select the exact address autocomplete suggestion; prefer the on-screen responsive menu match; read back native select options and semantic checkbox/radio controls; tolerate label whitespace; avoid an unnecessary eight-second pre-category wait. No network guard changes or RPC exceptions. Eight selected-state regression checks pass in46.447s; typecheck passes. Success copy now distinguishes verified controls from unverified checkout.
