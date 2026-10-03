# Luma blocked registration diagnosis and narrow guard correction

The hosted attempt in `reports/performance/luma-registration-live.json` returned `needs_human` after 48.852 seconds. Independent read-only Supabase reconciliation found the approval stale, attempt finished, zero-dollar reservation released, private preparation removed and no confirmation. The exact Surfsky event lane was confirmed stopped. The existing code emits this blocker only while `allowedSubmit` is false: it did not continue an approved registration POST. The failed attempt did not retain its actual request body, so that original payload cannot be reconstructed from storage.

GET-only inspection of the current public event/client bundle identified an incompatible representation: the blank optional phone input is initialized as an empty string and is copied into the registration body, while the guard allowed only null/undefined. Public asset: `https://luma.com/_next/static/chunks/3j7g9ttbi0lle.js`.

With coordinator authorization, the current public form was then exercised in a fresh local Chrome context using synthetic attendee fields, with service workers disabled and **all network writes aborted before dispatch**. No Surfsky browser was started and no real attendee was used. Initial `.test` email diagnostics were rejected by the provider's client validation before forming a registration request; changing the synthetic address to an example.com address permitted capture at the blocked request boundary.

The captured request matched the exact endpoint, attendee fields, event, single selected ticket, quantity one, zero amount/tax, blank optional answer and null payment fields. Its `phone_number` was `""`. Five writes were aborted and zero writes continued. Only field names, types and equality/emptiness booleans were retained in `luma-registration-payload-shape.json`; no attendee values, cookies, headers, private URLs or tokens were saved in the report. This is a browser-generated payload capture with the transport blocked, not an actual registration.

The minimal correction accepts `phone_number === ""` in addition to null/undefined. Nonempty phone values remain rejected, and no endpoint, approval, payment, ticket, attendee, amount or nested-field restriction was widened. A faithful synthetic full-body regression failed before the correction and passes afterward; an added nonempty phone case is blocked.

Frozen handoff:

- `src/browser/luma-registration.ts`: SHA256 `775d6b4adbcabfa1de1b995ff1c832646a70b77b63b2934ba736b6a3bf35ff5e`.
- `tests/luma-registration.test.ts`: SHA256 `b2ac557598a2416128d341bc6dbf29cb137c4eddfc4af678a2777b489f64db17`.
- Node24 `node --import tsx --test tests/luma-registration.test.ts tests/free-registration-backend.test.ts`: 44 reported checks, all pass, zero failures, 2.739 seconds.
- `npm run typecheck`: exit 0. `git diff --check` on changed source/tests: exit 0.

The coordinator must independently review this source correction before deployment because this diagnostic agent authored it. No actual registration or replay was attempted. The previous approval was invalidated by the clean failure; any later real attempt must use the normal fresh preparation and exact approval path after reconciliation.
