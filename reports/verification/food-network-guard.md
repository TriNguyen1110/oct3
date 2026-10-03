# Food research network guard — independent local canary

Scope: actual headless Chrome against an ephemeral localhost-only HTTP/WebSocket canary. No Surfsky, merchant traffic, account session, remote mutations, or production state. `tests/food-network-guard.test.ts` installs a synthetic service worker, establishes that it controls the page, applies the exported guard and navigates again as the real adapter does.

Initial source `02a6b788bddeca82e6d0653bacbfe6fd9c13578e5fac44bc7e7c6e07f2778eaf`:

- GET/HEAD/OPTIONS reached the local server.
- POST/PATCH/DELETE/PUT and sendBeacon did not reach it.
- WebSocket was closed with zero server upgrades after the guarded navigation.
- **Failed:** the installed service worker still intercepted fetch after the guard returned. Initial diagnosis suspected CDP detachment; retaining the session alone still failed. Isolated localhost probes established that `Network.enable` was required before `Network.setBypassServiceWorker`. Reproduction expected `server-read`, received `intercepted-by-worker`.

Coordinator received both failed snapshots and the passing local isolation proof. Final code installs routes, retains a CDP session, enables Network, then enables service-worker bypass before navigation. The earlier WebSocket check on an already loaded document was adjusted to the actual adapter's guard-before-navigation sequence; that sequence passes WebSocket blocking.

Source wording is corrected: successful menu inspection reports controls and a $6.60 item estimate, explicitly leaves selected store/modifiers unverified, returns checkout_handoff, and states automatic food ordering is not implemented. No prepared cart or passkey-locked browser guarantee remains.

Final verdict: **PASS for the bounded local network guard**, 4/4 reported checks in1445.275ms; `npm run typecheck` and diff check exit0. Source SHA256 `9ecbf87f6505b90125ccf43ad1b742fe7d3edbe9f7df787c8933d6a8e6de0e01`; test SHA256 `5fe862b8b2628537ea9d6edeb10f002b325bcbd01eb10cd4e65e90ff3444472a`. No live menu run repeated. Existing independent background service-worker activity is outside this page-fetch canary. This guard controls request methods and WebSockets; it does not establish that arbitrary GET endpoints are side-effect free or that current merchant menus are available.
