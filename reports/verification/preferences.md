# Saved profile — independent bounded verification

Date: 2026-10-03T19:57:53.741783+00:00
Root: `/Users/tringuyen/Developer/.worktrees/oct3`; workspace guard passed. Sources were read and hashed before tests. Verifier changed only tests, this report and board appends; no feature or cloud data changes.

## Verdict

PASS for current profile write authorization, workspace scoping, schema, error handling and saved-status behavior. No claim of new independent cloud persistence or visual layout coverage is made here. Read-access distinction: GET requires authentication but permits an agent bearer to retrieve the full profile within its workspace; PUT and direct savePreferences require manager role. This was flagged to coordinator as the current policy, not silently described as manager-only reading. The public MCP tool set does not expose a profile read tool.

## Checks

- `node --import tsx --test tests/preferences.test.ts`: four leaf checks, five reported passes, zero failures/skips; included in the initial combined run below.
- `OCT3_PROFILE_UI_URL=http://127.0.0.1:3003 node --import tsx --test tests/preferences-ui.test.ts`: one pass, zero failures/skips,3197.5425ms, actual local Chrome with every /api request intercepted.
- Initial combined run had five reported backend passes and a UI test timeout caused by opening the dialog before synthetic authentication hydrated. The test now waits for authenticated UI and passes; no product change was needed.
- No full suite or build repeated while the free-RSVP owner edits shared mission code. Full-suite integration remains deferred until that slice is stable. A later typecheck caught test-only nullable workspace-filter typing; it was corrected, and npm run typecheck now exits0. No production build is claimed for this test snapshot.

Follow-up: the initial passing runtime checks did not establish TypeScript compilation. A deployment that included the untracked test snapshot failed on filter possibly null in tests/preferences.test.ts. The verifier added explicit null narrowing, reran the four backend leaf checks successfully, and ran npm run typecheck with exit0. The earlier done row lacked this check; a corrected verdict row now records it.

## Backend evidence

Tests substitute fetch only for a synthetic Supabase origin; no real database is contacted. They verify unauthenticated GET401, agent PUT403, direct agent save rejection, no database call for denied access, explicit null for missing profile, trimmed schema-valid save/read and queries/upserts bound to principal.workspace_id. Reads from another workspace return no data. Upsert conflict key is workspace_id, and returned API reads use cache-control:no-store.

Unknown fields such as workspace_id or approved, invalid email, blank name and overlong role/company are rejected before persistence and cannot alter the saved row. Missing configuration and simulated database failures return explicit503 storage errors with no saved-profile claim or raw database/service-role diagnostic disclosure.

Migration inspection confirms RLS enabled, public/anon/authenticated permissions revoked, and access granted to service_role. API ownership checks therefore remain necessary; this audit verifies those calls using mocked HTTP, not actual hosted SQL permission enforcement.

## UI evidence

The saved-profile dialog initially shows Saved in Supabase only after a returned profile with storage:supabase. Editing clears that status. A rejected save preserves edits and shows an error without a saved claim. A200 response with no confirmed profile is also rejected. A valid save restores the status. A subsequent failed reload clears it again. All three test PUTs are intercepted locally; no actual profile is written.

Source inspection verifies new live briefs use attendee_ref:manager when an existing profile is selected, not name/email/company/role text. The interface explicitly says a saved profile never approves purchase or registration. Existing history text describes the workspace's latest20 missions; it does not claim merchant-account history import. The test does not independently prove free RSVP execution, external merchant imports, model privacy beyond request construction, or new visual styling.

## Source/test evidence hashes

- `src/server/preferences.ts`: `b5e38185df44693646ed20a04f5d44fd68de9cd283dc516e9c77522053e6222f`
- `app/api/preferences/route.ts`: `4f113bbf93c22ae7fa26f445f54f1940121206bbc282eff73f3fbfc21163f2c5`
- `src/shared/preferences.ts`: `2e9b4185141139511779f01b552a32e9a7ac7dc549a1f4a1f785052fedae126a`
- `supabase/migrations/202610030002_preferences.sql`: `8b253a773cdd800dc557ba472cee82bf2ad0d5a3a6c05ce245a49ef2d2071b36`
- `components/saved-profile.tsx`: `62d162ab843161d4d59cb8e36eb0751e206c96b33a593edaef508ac462ef4b01`
- `components/mission-desk.tsx`: `b042724daa1520477edb86be3e5fa11e967fcd0193f1d7d3afc55bbac4677262`
- `tests/preferences.test.ts`: `a598cfaddeb74127fbe468395942debd2d1067e219dbfee0e5f98eb298357fca`
- `tests/preferences-ui.test.ts`: `7624c12057c3a51dc9b63e3a0879d470cc4e77cea39a88aa5eacc642b2ae6e46`

## Board scope

Appended review/done for preferences-local only. Actual cloud profile save/reload, independently verified by coordinator, is outside this report. No commit or push by verifier.
