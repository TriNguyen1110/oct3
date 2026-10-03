# Final four-worker SCREEN check

Pass on local Chrome at **1440×1000 and 390×1000**, with all API responses mocked and zero API mutation requests. No real manager data, approvals, passkey enrollment or merchant actions were used.

Frozen sources: `app/globals.css` SHA256 `c25990c72927a4420e726cd6e5ddc464dde82e0868914cac296c3606017fa627`; `components/worker-art.tsx` SHA256 `43df115ce29d0481c35d8713ca80607407b802129988d864c775649255e5754c`; `components/mission-desk.tsx` SHA256 `a60ae30921f794765cd3433238cd2b3897f2a2479e7f1a5ca81ccdedb3da162a`.

- Four illustrated worker cards render correctly; desktop uses a balanced two-by-two worker grid, mobile stacks all four. The hero command panel has computed `transform: none` at both widths.
- Home and new-mission dialog have no horizontal overflow or page errors. Desktop/mobile full-page screenshots and the mobile form screenshot were opened and visually inspected.
- Food is enabled by default: **boba milk tea**, **pickup**, **quantity 1**, search near **580 20th Street, San Francisco**. The form explicitly labels food as menu research only; no order is placed.
- Existing auth, fixture budget and all four worker-dialog checks passed at both widths. The visual test was updated from three to four cards and to the current “Confirm with passkey” label; the initial stale-label timeout was a test mismatch, not a feature defect.
- Final live-shaped visibility tests pass at both widths under normal and reduced motion: all four cards and the modal reach opacity 1, and the mocked enrolled-passkey review control is enabled without being clicked.

Evidence: `tests/visual-refinement-ui.test.ts`; final filtered run (`live-shaped|final four-worker`) **8 reported checks pass, zero failures**, 11.274 seconds. The fixture/dialog group separately passed both viewports (three reported checks). `npm run typecheck`: exit 0. No broad suite repeated.

Screenshots: `/tmp/cue-final-palette-independent-{1440,390}.png`, `/tmp/cue-final-food-form-independent-{1440,390}.png`. Actual cloud passkey proof is separate coordinator evidence in `reports/performance/passkey-cloud-proof.json`.
