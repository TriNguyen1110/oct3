# Delayed initial mission load — independent UI regression

Frozen `components/mission-desk.tsx` SHA256 `266d26f6e7c571b40a6521b0e39523dfdeadb5b4d8d7d8db3e34e2be35c4ad76`.

`OCT3_INITIAL_UI_URL=http://localhost:3003 node --import tsx --test tests/initial-mission-modal-ui.test.ts`: **5 reported checks passed**, zero failures, 4928.294ms. `npm run typecheck`: exit0. Diff check passed.

Actual headless Chrome against the coordinator's local server; every application API mocked and external requests aborted. Fake getUserMedia/MediaRecorder, no real microphone or provider. Four cases:

1. Auth succeeds while latest mission response is held. Manager opens New mission and starts synthetic recording. Releasing the real non-null mission payload updates the background mission without closing the dialog, stopping tracks, or removing Stop & draft. Explicit close then stops the tracks.
2. An authenticated initial mission/task deep link opens its exact task review when there is no later manager interaction.
3. A signed-out deep link opens authentication and reads no mission.
4. Mock sign-in to an empty workspace opens New mission as before.

Zero unexpected API writes or page errors. One expected mocked authentication POST in the sign-in case; no voice upload, mission submission, passkey ceremony, approval, registration, order or database write. No product source edited by verifier. Frontend owner's separate before/after reproduction is supporting evidence; this independent run checks the frozen correction and preserved defaults.

Also read coordinator's `reports/performance/native-passkey-live-event.json`: newer user-native enrollment and approved/confirmed free Luma registration supersede earlier unenrolled/no-registration snapshots. It reports matching confirmation reference and one bound confirmation evidence item; receipt remains not_captured. Its27428ms interval is approval-to-confirmation server timestamps including any manager delay, not isolated execution or active time. No new registration call was made by verifier.
