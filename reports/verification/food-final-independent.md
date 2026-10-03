# Food selected-state and network verification

Independent review passed for the frozen food adapter, selected-state regressions, and mission-form copy. No provider browser was started for this review.

Frozen revisions:

- `src/browser/doordash.ts`: `0f454e2dce54fae5c1db25cba230482571a677078378516e45a9c3147ef372cc`
- `tests/food-selected-state.test.ts`: `b82a27bcf7446a42270eaa6332fdb1e04f0837a846417dc4e5ec393eb69d5035`
- `components/food-mission-fields.tsx`: `8bbb4e327d7432c943db18ef65f5c47b9ee37cc3c827f0d0f8ac7303f5086fa9`

The adapter remains pinned to one boba pickup near 580 20th Street, quantity one, Boba Guys Potrero at 1002 16th Street, Classic Black, 16oz iced, boba, Organic Half + Half, and 50% sweetness. It selects the exact address autocomplete result before accepting the Potrero store, requires the store radio to retain selection, prefers an on-screen duplicate menu category, reads native select values after selection, and checks semantic or linked checkbox/radio state. Missing finder, wrong address, missing selected state, or changed controls fail closed.

The unchanged network guard installs context routing before navigation, permits only GET/HEAD/OPTIONS, closes WebSockets, enables CDP Network, and bypasses an installed service worker. Independent tests confirmed POST, PATCH, DELETE, PUT, `sendBeacon`, WebSocket upgrades, and service-worker interception did not reach the local server. The adapter locates but never activates **Add to order $6.60**.

`node --import tsx --test tests/food-selected-state.test.ts tests/food-network-guard.test.ts` passed 12 reported checks in 46.735 seconds. This includes the negative finder/address cases plus valid, autocomplete, responsive duplicate-category, native-select, and linked-label variants. Every successful variant returned one $6.60 option with `checkout_handoff`; the add-control canary remained at zero. `npx tsc --noEmit` and `git diff --check` passed.

The frozen actual report `reports/performance/food-demo-retest.json` has SHA-256 `f16019c25bd4a4691afd87b2055c18e29b761cd9fe76d0d1eaa39d201c75809c`. Its `final_actual_success` records one option at 660 USD minor units after 52.971 seconds, exact store and four modifier readbacks, an observed Add control that was not activated, `checkout_handoff`, confirmed session cleanup, released durable lease, and a stopped exact profile. The stored actual option reason predates the final copy clarification, but its evidence and progress already say no cart or checkout was prepared. This one provider run is compatible with the frozen logic; it does not independently prove current availability or a cart, taxes, final total, pickup time, checkout, payment, or order.

The form text accurately limits the current worker to one drink from the official pickup site and describes menu price as an estimate. It does not claim an order or fee-inclusive checkout total.
