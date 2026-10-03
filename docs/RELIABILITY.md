# Runtime form handling and recovery

Forms are discovered at runtime. The browser worker does not assume that two
merchant pages, or two visits to one page, expose the same fields.

## Components, not whole-form templates

[The internal tools](../src/browser/component-tools.ts) share one live browser
page and a trusted server policy. The sequence is inspect, plan explicit values,
set one component, verify readback, and rediscover conditional fields. A changed
layout invalidates the previous plan. Exact IDs resolve repeated labels; missing
or ambiguous targets remain explicit outcomes.

Supported components are native text inputs, selects, radio buttons and
checkboxes. Custom comboboxes, embedded frames and arbitrary widgets remain
unsupported. Password, payment and final-submit controls are excluded. Changing
fields requires explicit `readOnly: false` plus an exact origin and field
allowlist. Inspection omits current field values. Consent requires a separate
trusted policy setting.

Each operation gets at most eight seconds, within the worker's 90-second budget.
One closure allows three observed layouts and 32 mutations. A checkbox is set
to its intended state, never blindly toggled. An interaction timeout allows one
retry only after unchanged-layout readback establishes that the intended value
was not retained. A hard operation timeout closes the page to stop late actions.
There is no purchase, hire, message-send or arbitrary-click tool in this toolkit.

Read-only discovery is integrated into merchant research without extra model
turns. Preparatory filling was exercised on local synthetic forms. A real Claude
Sonnet 5.5 run discovered a conditional field, planned and filled four supplied
values, and invoked verification in **20.654 seconds**. This is one local
observation with a real model call, not a live merchant checkout measurement.
See [the recorded tool sequence](../reports/performance/local-components.json)
and [the repeatable harness](../scripts/benchmark-components.ts).

## Persisted research retry policy

[Research policy](../src/server/research-policy.ts) records a private attempt
ledger per task and mission revision: attempt count, runtime/configuration
fingerprint, typed blocker, cleanup result and cooldown. Both the API and the
actual worker enforce it, so repeated model tool calls cannot bypass the gate.

- Initial attempt plus one explicit manual retry for unchanged configuration.
- Fifteen-second cooldown after an attempt; no automatic browser retries.
- Uncertain startup, cleanup or stale claims require an observed stopped state
  for the exact saved Surfsky lane profile. Elapsed time alone does not clear it.
- Running, missing, duplicated or unknown profiles remain blocked.
- A repaired runtime or corrected configuration can reset the attempt budget;
  it cannot override uncertain cleanup, active work or allocated spending.
- Reuse the same mission and task. Status reads do not rerun browsers.

The private fingerprint and ledger stay outside public mission results. Actual
manager approval, Link authorization, budget reservation and merchant
confirmation remain separate. Recovery instructions are in [the demo
runbook](DEMO.md#recover-a-failed-research-worker).

## Adapted from job_search

The architectural references were `scripts/form-components.mjs` (discovery,
explicit answer planning, component action and bounded rediscovery),
`scripts/form-dropdown.mjs` (scope a control to its associated menu),
`scripts/application-attempt.mjs` (preserve uncertain submission state), and
`routines/application-reliability.md` (bounded attempts and provider cleanup).
These patterns were adapted into oct3's three lanes. Applicant data, ATS-specific
aliases, account policies and credentials were not copied into the tools.

The corresponding implementation lives in [components.ts](../src/browser/components.ts),
[research.ts](../src/server/research.ts) and [surfsky.ts](../src/browser/surfsky.ts).
Independent checks and their exact scope are recorded under
[verification reports](../reports/verification/).
