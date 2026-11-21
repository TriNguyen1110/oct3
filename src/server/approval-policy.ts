/**
 * Demo confirmation switch. When on, the MCP server exposes confirm_and_execute so a
 * terminal demo can confirm a fixture plan and continue it in one call, or continue a live
 * plan the manager already approved with a passkey.
 *
 * It never approves a live action: decideTask refuses any live approval that does not come
 * from a verified passkey, whatever this switch says. OCT3_DEMO_SKIP_PASSKEY=false turns it
 * off even when OCT3_DEMO_MODE=true. Both default to off.
 */
export function demoApprovalEnabled() {
  if (process.env.OCT3_DEMO_SKIP_PASSKEY === "false") return false;
  return process.env.OCT3_DEMO_SKIP_PASSKEY === "true" || process.env.OCT3_DEMO_MODE === "true";
}
