// In-repo fake WebAuthn library for node tests. No crypto: an assertion "verifies" when its
// signature equals the expected challenge and its clientDataJSON equals the expected origin. It is
// injected through setWebAuthnLibraryForTests, so the real server-side checks in passkeys.ts
// (challenge binding, task scope, expiry, single use, counter, approver policy) all run.
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { Principal } from "../../src/server/auth";
import { decideTask } from "../../src/server/missions";
import { approvalOptions, passkeyStatus, registrationOptions, setWebAuthnLibraryForTests, verifyApproval, verifyRegistration } from "../../src/server/passkeys";

let counter = 0;
type Any = any; // the fake only reads the fields it checks

export const fakeWebAuthn = {
  generateRegistrationOptions: async () => ({ challenge: `fake-reg-${++counter}` }) as Any,
  verifyRegistrationResponse: async ({ response, expectedChallenge, expectedOrigin }: Any) => {
    const ok = response.response.signature === expectedChallenge && response.response.clientDataJSON === expectedOrigin;
    return { verified: ok, registrationInfo: ok ? { userVerified: true, credential: { id: response.id, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: [] }, credentialDeviceType: "singleDevice", credentialBackedUp: false } : undefined } as Any;
  },
  generateAuthenticationOptions: async (options: Any) => ({ challenge: `fake-auth-${++counter}`, allowCredentials: options.allowCredentials }) as Any,
  verifyAuthenticationResponse: async ({ response, expectedChallenge, expectedOrigin }: Any) => {
    if (response.response.signature !== expectedChallenge || response.response.clientDataJSON !== expectedOrigin) throw new Error("fake assertion does not match");
    return { verified: true, authenticationInfo: { userVerified: true, newCounter: 1 + Number(response.response.authenticatorData || 0) } } as Any;
  },
};

export const FAKE_ORIGIN = "http://localhost:3003";
export const FAKE_CREDENTIAL = "fake-credential-1";

/** A fake assertion for a challenge, as the board would post it. */
export const fakeAssertion = (challenge: string, origin = FAKE_ORIGIN, credential = FAKE_CREDENTIAL): AuthenticationResponseJSON =>
  ({ id: credential, rawId: credential, type: "public-key", response: { clientDataJSON: origin, authenticatorData: "0", signature: challenge }, clientExtensionResults: {} }) as AuthenticationResponseJSON;

/** Runs fn with the fake library installed, then restores whichever library was installed before. */
export async function withFakeWebAuthn<T>(fn: () => Promise<T>): Promise<T> {
  const previous = setWebAuthnLibraryForTests(fakeWebAuthn);
  try { return await fn(); } finally { setWebAuthnLibraryForTests(previous); }
}

/** Enrolls the principal's fake platform passkey if it has none. */
export async function enrollFakePasskey(principal: Principal) {
  return withFakeWebAuthn(async () => {
    if ((await passkeyStatus(principal)).enrolled) return;
    const options = await registrationOptions(principal);
    const challenge = (options.options as Any).challenge as string;
    await verifyRegistration(principal, { challenge_id: options.challenge_id, response: { id: FAKE_CREDENTIAL, rawId: FAKE_CREDENTIAL, type: "public-key", authenticatorAttachment: "platform", response: { clientDataJSON: FAKE_ORIGIN, attestationObject: "fake", signature: challenge, transports: [] }, clientExtensionResults: {} } as Any });
  });
}

/** A fresh approval challenge for this exact action. */
export async function fakeChallenge(taskId: string, principal: Principal, exact: { proposal_id: string; revision: number }) {
  return withFakeWebAuthn(async () => {
    const options = await approvalOptions(taskId, principal, exact);
    return { challenge_id: options.challenge_id, challenge: (options.options as Any).challenge as string, credential: ((options.options as Any).allowCredentials?.[0]?.id as string) || FAKE_CREDENTIAL };
  });
}

/** The real verifyApproval over a fake assertion: returns a minted proof for this exact action. */
export async function fakeVerifiedApproval(taskId: string, principal: Principal, exact: { proposal_id: string; revision: number }) {
  await enrollFakePasskey(principal);
  const challenge = await fakeChallenge(taskId, principal, exact);
  return withFakeWebAuthn(() => verifyApproval(taskId, principal, exact, { challenge_id: challenge.challenge_id, response: fakeAssertion(challenge.challenge, FAKE_ORIGIN, challenge.credential) }));
}

/** Approves a live task through the real passkey checks with a fake authenticator. */
export async function approveWithFakePasskey(taskId: string, principal: Principal, exact: { proposal_id: string; revision: number }) {
  return decideTask(taskId, principal, exact, "approve", await fakeVerifiedApproval(taskId, principal, exact));
}
