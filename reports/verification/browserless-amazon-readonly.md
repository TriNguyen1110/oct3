# Browserless fallback — independent actual verification

**PASS for isolated read-only product access, Live View availability and short reconnect. Not an authenticated checkout proof.** Two bounded browser sessions were used; no further session was opened after the successful refined check. No app source was changed or committed.

| Check | Actual result |
|---|---|
| Requested transport | Browserless managed stealth, residential proxy, country `us`; connection accepted. Exit IP/country was not independently measured. |
| Amazon identity | HTTP200, exact ASIN B0195UTBKA, public title “Colgate Cavity Protection Fluoride Toothpaste, Mint, 6 oz”. Price was not captured. |
| CAPTCHA | No CAPTCHA detected in the inspected DOM; automatic solving disabled. This is a point-in-time observation. |
| Account state | Explicit sign-in prompt visible in the fresh isolated cloud browser. No sign-in attempted. |
| Live View | `Browserless.liveURL` returned an interactable URL; private URL fetch returned HTTP200. No URL or token retained in the public report. Viewer rendering/input was not exercised. Link was closed. |
| Reconnect | After leaving Amazon for about:blank, a private synthetic in-memory nonce survived disconnect/reconnect to the same session. This proves short live-state continuity, not authenticated cookies or days-long persistence. |
| Read-only guard | GET/HEAD/OPTIONS-only interception and WebSocket blocking installed before navigation; service-worker bypass enabled. Seven disallowed requests blocked on the successful probe, zero allowed merchant writes, clicks, sign-ins, cart or checkout actions. |
| Cleanup | Remote Browser.close acknowledged; transport disconnected; owned lease released. Confirmed for both probes. |

The first probe connected but timed out waiting for Amazon DOMContentLoaded at26.836s. It blocked nine requests and then fully closed. The refinement used navigation commit followed by bounded product inspection, avoiding dependence on full page-load completion. It succeeded in17.054s at2026-10-03T22:54:03Z. This distinction matters: the initial result did not prove Browserless could not access Amazon.

Actual sanitized artifacts: [successful refined probe](../performance/browserless-amazon-readonly.json), [initial timeout and cleanup](../performance/browserless-amazon-first-probe.json). Credentials were loaded privately only from Cue's ignored `.env.local`; no local Chrome/profile/CDP access, cookie reading/export, sign-in, merchant form submission, or credential transfer occurred. Guard enforcement was removed only after navigating away from the merchant before the reconnect gap.

The ordinary network guard controls request methods and known navigation paths, not the semantics of every possible GET handler. No merchant controls were activated. The reconnect test has a15-second idle window; it does not establish what the account supports for longer sessions or persistent profiles. Browserless charged-service usage/cost was not measured and no plan was changed.

Official references used: [stealth routes](https://docs.browserless.io/baas/bot-detection/stealth), [CDP Live View/reconnect commands](https://docs.browserless.io/api-reference/cdp-extensions), [session lifecycle](https://docs.browserless.io/baas/session-management/standard-sessions). Eve registry search found no official Browserless integration item; the probe reused installed Playwright without new dependencies.

Temporary diagnostic SHA256: `0d3d3d6569f4ff10d02da3d40945e8619bc8761c6a0492cd0a9a1274f2769307` (`/tmp/cue-browserless-verify.mjs`). It is an evidence script, not a production integration or persistent sign-in helper. A later user-login handoff requires a newly owned bounded session because these probes were deliberately terminated.
