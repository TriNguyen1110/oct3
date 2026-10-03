# Luma registration and confirmation email

**Latest reconciliation: confirmation email found in the correct Gmail inbox.** At 2026-10-03T22:07:47Z, the existing dedicated read-only Gmail connection returned one eligible Luma-domain Open Together message received at **2026-10-03T21:23:08Z (14:23:08 PDT)**. Metadata-first screening followed by a bounded matching body read identified a registration/ticket confirmation. Its labels include INBOX and exclude SPAM/TRASH. This proves receipt by this Gmail mailbox, not that the user opened it. The connected account matches the privately pinned event recipient and does not match the account shown in the Amazon screenshot. No account address, body, ticket link, reference or code is recorded here.

The single query was pinned to the exact event terms, recipient and time window after 21:22Z, included spam/trash, was capped at ten results, and required no pagination. Exactly one metadata read and one eligible body read occurred. No links were followed and no message was sent, resent, changed or marked read. The existing external credential file was not copied or modified; token metadata had verified exactly Gmail readonly. This supersedes the earlier email-delivery uncertainty below. [Sanitized evidence](luma-email-reconciliation.json).

## Earlier provider-only reconciliation

Fresh actual Supabase read at 2026-10-03T21:58:04Z still shows the event task **confirmed**, with exact native approval, one task-bound live provider confirmation, a finished attempt and a committed $0 reservation. The private prepared name and email exactly match the current saved manager profile; the prepared proposal still matches. No personal fields, ticket reference or private links are included here. [Sanitized read evidence](luma-email-reconciliation.json).

This establishes the stored provider-approved ticket result, **not email delivery**. No sent/delivered/bounced status or raw provider response was retained, and no receipt was captured. The user reports no confirmation email. The historical provider response cannot be independently reconstructed from the sanitized record.

A single actual GET-only reconciliation loaded the exact public event (HTTP200). Its guest object contained field names but no guest email or approval status, and Sign in remained visible. It therefore did not independently revalidate the ticket or email. All non-read requests were aborted (six blocked), WebSockets were closed, the page bypassed service workers, and no control was clicked. The owned Surfsky profile was verified stopped and the durable event lease released. No RSVP, sign-in code, email resend, approval or profile edit occurred.

## Concrete corrections and checks

The adapter previously accepted one matching free ticket even when an additional unexpected ticket was returned, and ignored an explicitly different response email. New negative tests reproduced both false confirmations (also a malformed email value). The adapter now requires exactly one total ticket and rejects any present, non-null response email that differs from the approved attendee. Missing/null response email does not establish identity on its own; the exact outbound request remains pinned to the approved private attendee. These post-submit mismatches remain uncertain, with no confirmation reference or automatic retry. No existing persisted record was changed.

Success evidence now explicitly says **“Confirmation email delivery was not verified.”** The previous optional account-email-verification wording did not describe confirmation-message delivery and has been removed for future results.

- Before correction: focused tests failed as expected (three response cases plus wording assertion; Node reports five failures including the parent subtest).
- After correction: `node --import tsx --test tests/luma-registration.test.ts tests/free-registration-backend.test.ts` passed **49/49**, 0 failed, 0 skipped, 2.163s. All test provider calls and records were synthetic. Existing exact request, early/duplicate request, uncertain replay, concurrent claim, shared lease and bound confirmation checks remain passing.
- `npm run typecheck` passed; scoped `git diff --check` passed.
- Frozen source SHA256: `de4d8b6f6034a4b267ff72706bda200065763d5c9e2ff84e2305086ae0fb4413` (`src/browser/luma-registration.ts`).
- Frozen tests SHA256: `342e089efb18410514ce9977ee2d411612757acd690a1b852b0d7fe9647e225c` (`tests/luma-registration.test.ts`).

## Remaining reconciliation

Luma documents that confirmed registrations normally receive a confirmation email; this is expected product behavior, not evidence that this user's message was sent. [Registration process](https://help.luma.com/p/event-registration-process).

The next meaningful check is the organizer's existing guest timeline and email delivery status, or the recipient's existing inbox/spam/quarantine. Luma's delivery status only establishes recipient-server acceptance, not inbox placement. The current unauthenticated event browser cannot inspect organizer records. No organizer access or recipient mailbox access was available during the earlier provider-only check. The later user-authorized, scoped Gmail check above resolved mailbox delivery directly. [Luma delivery documentation](https://help.luma.com/p/email-delivery-open-troubleshooting), [recipient troubleshooting](https://help.luma.com/p/not-receiving-emails).

**Readiness:** provider confirmation has real stored evidence and the later scoped Gmail read proves the confirmation message arrived in the correct Inbox. Private ticket-link navigation was intentionally not performed. Do not resubmit the registration to resolve missing email. Any later email resend is a separate external action requiring authorization. Source correction awaits coordinator independent review and release; this report does not claim it is deployed.
