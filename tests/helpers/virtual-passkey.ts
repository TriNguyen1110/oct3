import { chromium } from "playwright-core";
import type { RegistrationResponseJSON, AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON as CreationJSON, PublicKeyCredentialRequestOptionsJSON as RequestJSON } from "@simplewebauthn/server";

/** Fresh software authenticator on a blank intercepted localhost page. No app
 * API, provider, user hardware, or database call is made by this helper. */
export async function virtualPasskeyDevice() {
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const context = await browser.newContext();
  await context.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Synthetic WebAuthn verification</title>" }));
  const page = await context.newPage(); await page.goto("http://localhost:3003");
  const cdp = await context.newCDPSession(page); await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  return {
    page, cdp, authenticatorId,
    register: (options: CreationJSON) => page.evaluate(async options => {
      const credential = await navigator.credentials.create({ publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options as PublicKeyCredentialCreationOptionsJSON) }) as PublicKeyCredential;
      return credential.toJSON();
    }, options) as Promise<RegistrationResponseJSON>,
    authenticate: (options: RequestJSON) => page.evaluate(async options => {
      const credential = await navigator.credentials.get({ publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options as PublicKeyCredentialRequestOptionsJSON) }) as PublicKeyCredential;
      return credential.toJSON();
    }, options) as Promise<AuthenticationResponseJSON>,
    close: () => browser.close(),
  };
}
