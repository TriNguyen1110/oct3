# Food selected-state readback — independent verification

Frozen source: `src/browser/doordash.ts` SHA256 `f2e35cff8b53106955a99cd2d6dd09630f45e615eb4791a4ce195a08453fa747`.

Source review found that ae20d46d checked exact store address/radio only when the finder was open, yet success evidence unconditionally asserted those checks. Coordinator added a fail-closed missing-finder guard before store lookup. No verifier feature edits.

## Narrow synthetic checks

- Existing localhost real-browser network canary: **4/4 reported checks passed**. GET/HEAD/OPTIONS work; write methods/beacon and WebSockets blocked; existing service-worker page interception bypassed.
- New `tests/food-selected-state.test.ts`: **4/4 reported checks passed**, 12.417 seconds. Real local Chrome renders synthetic HTML; Surfsky API/CDP entry points are mocked. Missing finder and wrong address produce zero options/merchant_changed without exact-store evidence. A supported native-radio/checkbox form passes readback and yields the $6.60 estimate plus checkout_handoff; Add to order is never activated. An initial plain-text-label fixture correctly handed off because its selected state was not readable by the adapter; the positive fixture uses supported nested label text. This remains a layout-dependent adapter, not a universal form handler.
- Typecheck and diff check pass. Test SHA256 `1764f65615888235bc2188f8080b85746cb258821f291705bf763a50d81c765e`.

## One authorized actual smoke

`reports/verification/food-readback-live.json` records the sole new actual Surfsky run, using the exact existing oct3-food profile and one boba pickup near the supplied venue. The profile was confirmed stopped before the run; the durable lane lease was acquired.

**Result: truthful handoff, not successful preparation.** In25.665 seconds the adapter returned zero options and merchant_changed: the location search did not expose the expected Boba Guys Potrero result. No Add to order, cart, checkout, order or payment action occurred. Adapter cleanup and independent stopped-profile verification passed; the durable lease was released. No mission or profile personal data changed. No second live attempt was made.

The bounded guard/readback implementation passes its tested scope. Current real merchant preparation remains blocked. Earlier observed $6.60 form evidence is historical and does not establish a current cart or final checkout total.
