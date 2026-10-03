# Local Chrome consent-only bridge — independent review

**GO for an explicitly user-approved native connection probe only. NO-GO for merchant preparation/integration claims.** No actual user Chrome attachment, readiness-marker read, setting change, existing tab access, cookie/storage access, provider request or merchant action was performed by verifier. This review used installed source and isolated subprocess mocks.

Frozen source SHA256:
- `scripts/local-browser.ts`: `f8f3263ff7794558b64854d202d36841b6d71256b079f0fd432e67b50150b4c5`
- `docs/LOCAL_BROWSER.md`: `e3d32c8aafe28bc64acf69a7433cd6cc3e0c7921601615d142590fa647ca9c8d`

## Checks

`node --import tsx --test tests/local-browser.test.ts`: **6 reported checks passed**, zero failures, 5297.836ms. `npm run typecheck` and diff check passed.

The helper `tests/helpers/local-browser-preload.mjs` replaces homedir with a temporary synthetic directory and mocks connectOverCDP; it does not repurpose the user's HOME or read the actual profile. Coverage:

- Missing consent and malformed port/path/extra-line markers do not connect or acquire a lease.
- Status reads only the fake marker; an existing lease rejects before connection and remains untouched.
- Success uses the exact loopback endpoint with20s timeout/isLocal/noDefaults, creates one owned blank page, verifies its own target, closes only that page, disconnects, and removes its lease.
- SIGINT during stalled newPage interrupts, disconnects, releases the lease, and exits without waiting forever.
- Connection failure and wrong target are sanitized; owned-page/transport cleanup is attempted in order and the lease releases.
- Synthetic private error strings/endpoints do not appear in stdout/stderr.

## Installed Playwright disconnect evidence

Read `node_modules/playwright-core/lib/coreBundle.js` from installed Playwright1.63. `_connectOverCDPInternal` supplies `chromeTransport.closeAndWait` (around43102); `_connectOverCDPImpl` injects that callback as both browserProcess.close/kill and removes temporary artifacts (43120–43125). Server Browser._close invokes that callback (52697). WebSocketTransport.closeAndWait closes the WebSocket (39613). Thus this attachment's browser.close path disconnects its transport rather than sending CDP Browser.close or terminating the attached Chrome process. No native connection was needed to establish this source fact.

The same installed source autoattaches and initializes existing targets during connection (`Target.setAutoAttach`, frame/runtime/network initialization around38371/37620). `noDefaults` avoids certain focus/media/download overrides; it does not make existing targets invisible to the SDK. Documentation/output now correctly limit the promise to no explicit application access to existing tabs, and disclose internal SDK initialization.

## Findings resolved before pass

The initial script had no cancellation race after connection; a stalled newPage could hold the process/lease despite SIGINT. Owner added a25s lifecycle abort timer, abort-raced operations,20s connect timeout, bounded4s cleanup attempts, late page/session cleanup and honest unconfirmed tab cleanup when creation outcome is unknown. The final timer-only correction starts the25s lifecycle timer after attachment; attachment has its separate20s bound and cleanup can add time. This is not a25s total-process latency guarantee. Existing lock files now fail closed rather than risking stale-lock reclamation deleting a concurrent replacement.

This is an empty-tab compatibility probe, not an Amazon adapter, outbound authorized-job bridge, purchase executor, or live proof of Chrome's native permission prompt. Native browser permission remains separate from manager passkey approval. No broader product readiness follows from these mocked checks.

Final timer-placement delta independently inspected: only timer declaration, start immediately after successful attach, and conditional timer cleanup changed; reversing those three edits reconstructs the exact previously verified adaf4d7 source hash. Signal listeners remain active during attachment and an already-aborted signal is checked before creating a page. Builder reports6/6 tests and typecheck passed at final f8f3263; verifier did not repeat unchanged tests for this source-only delta. GO remains limited to the user-approved empty-tab native compatibility probe.
