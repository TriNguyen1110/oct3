import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/server";

export interface PasskeyStatus { enrolled: boolean; required: true }
export interface PasskeyRegistrationOptions { challenge_id: string; options: PublicKeyCredentialCreationOptionsJSON }
export interface PasskeyApprovalOptions { challenge_id: string; options: PublicKeyCredentialRequestOptionsJSON }
export interface PasskeyRegistrationVerification { challenge_id: string; response: RegistrationResponseJSON }
export interface PasskeyAssertion { challenge_id: string; response: AuthenticationResponseJSON }
