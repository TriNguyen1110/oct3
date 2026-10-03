# Hosted stable-release voice proof

PASS · 2026-10-03T21:31:04.399Z

Owned hosted app: https://oct3-five.vercel.app. Synthetic microphone fixture was passed through the real browser audio conversion and hosted voice endpoint. Provider response status: 200. End-to-end audio/draft roundtrip: 3238 ms.

Explicit draft application: verified. Other form fields preserved: true. Forbidden mutation attempts: 0. Mission submissions: 0. No passkey enrollment, merchant action or real user microphone was used. No tokens, cookies, raw audio, transcripts, profile values or private links are included in this evidence.

Full safe measurements: [hosted-voice-stable-release.json](../performance/hosted-voice-stable-release.json).

The first real authenticated `GET /api/missions?latest=1` returned HTTP200 and was held by the verification harness until the New mission dialog was open and synthetic recording had started. Its actual response was delivered unchanged. The dialog and recording stayed active; one real voice upload then returned200 in3.238seconds. The new ivory statue asset decoded successfully.

Anonymous desktop1440 and mobile390 screenshots: `/tmp/cue-statue-hosted-1440.png`, `/tmp/cue-statue-hosted-390.png`. Both had zero page errors or horizontal overflow. No private mission/profile screenshots were taken.

A single fresh-context headless Chrome mobile-viewport load was measured while taking the required mobile screenshot: DOMContentLoaded/load271ms, statue response complete166ms,9578 transferbytes (9278 encoded bodybytes), decode observed321ms. These are one synthetic run on the verification machine without throttling, not real-device or percentile measurements. See [hosted-statue-load.json](../performance/hosted-statue-load.json).
