/**
 * The hackathon deployment uses a shorter manager confirmation flow. The
 * server still derives and verifies the exact action hash; it only skips the
 * browser's WebAuthn ceremony.
 */
export function demoApprovalEnabled() {
  if (process.env.OCT3_DEMO_SKIP_PASSKEY === "false") return false;
  return process.env.OCT3_DEMO_SKIP_PASSKEY === "true" || process.env.OCT3_DEMO_MODE === "true";
}

