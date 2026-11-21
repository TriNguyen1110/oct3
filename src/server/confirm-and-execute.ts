// MCP confirm_and_execute: approve one exact proposal, then continue it. The approval goes
// through the ordinary approve route, so a live proposal is approved only by an earlier
// passkey ceremony on the mission board; this call can then continue it, never approve it.

/** Calls approve, and resume only when approve succeeded. Returns whichever response ends the flow. */
export async function confirmAndExecute(approve: () => Promise<Response>, resume: () => Promise<Response>): Promise<Response> {
  const approved = await approve();
  if (!approved.ok) return approved;
  return resume();
}
