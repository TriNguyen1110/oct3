import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPasskeyRequestOrigin } from "../src/server/passkeys";
import { AppError } from "../src/server/errors";

const code = (value: string) => (error: unknown) => error instanceof AppError && error.code === value;
const request = (origin: string) => new Request(`${origin}/api/passkeys`, { method: "POST", headers: { origin } });

function setEnv(t: { after: (fn: () => void) => void }, changes: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(changes)) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
}

test("a deployment without OCT3_APP_URL refuses passkey ceremonies instead of trusting a built-in host", t => {
  setEnv(t, { OCT3_APP_URL: undefined, VERCEL: "1" });
  assert.throws(() => assertPasskeyRequestOrigin(request("https://oct3-five.vercel.app")), code("passkey_config_invalid"));
});

test("a deployment trusts only its own HTTPS OCT3_APP_URL", t => {
  setEnv(t, { OCT3_APP_URL: "https://cue.example.test", VERCEL: "1" });
  assertPasskeyRequestOrigin(request("https://cue.example.test"));
  assert.throws(() => assertPasskeyRequestOrigin(request("https://oct3-five.vercel.app")), code("invalid_origin"));
});

test("a deployment refuses a plain-HTTP passkey origin", t => {
  setEnv(t, { OCT3_APP_URL: "http://cue.example.test", VERCEL: "1" });
  assert.throws(() => assertPasskeyRequestOrigin(request("http://cue.example.test")), code("passkey_config_invalid"));
});

test("local development defaults to localhost", t => {
  setEnv(t, { OCT3_APP_URL: undefined, VERCEL: undefined, NODE_ENV: "test" });
  assertPasskeyRequestOrigin(request("http://localhost:3003"));
});
