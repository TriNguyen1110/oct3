import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../app/api/voice/draft/route";
import { validateVoiceAudio, MAX_AUDIO_BYTES } from "../src/server/voice";

function wav(seconds = 1, silent = false) {
  const b = Buffer.alloc(44 + 32000 * seconds); b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(b.length - 44, 40);
  if (!silent) for (let n = 44; n < b.length; n += 2) b.writeInt16LE(Math.round(Math.sin(n / 30) * 10000), n);
  return b;
}
const draft = { transcript: 'Get one boba for pickup.', objective: 'Find one boba for pickup nearby.', purchase_budget_minor: null, food: null, notes: [] };
test('voice audio validates canonical bounded PCM and rejects silence/malformed headers', () => {
  assert.equal(validateVoiceAudio(wav()), 1); assert.equal(validateVoiceAudio(wav(20)), 20);
  for (const bad of [wav(0.2), wav(21), wav(1, true), Buffer.alloc(0)]) assert.throws(() => validateVoiceAudio(bad));
  for (const offset of [0, 4, 8, 12, 16, 20, 22, 24, 28, 32, 34, 36, 40]) { const bad = wav(); bad[offset] ^= 1; assert.throws(() => validateVoiceAudio(bad), `offset ${offset}`); }
});

test('voice endpoint manager/origin/upload boundary, provider schema, redaction and lease cleanup', async t => {
  for (const [key, value] of Object.entries({ SUPABASE_URL: 'https://voice.synthetic.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-db-secret', OCT3_MANAGER_TOKEN: 'synthetic-manager', OCT3_AGENT_TOKEN: 'synthetic-agent', GEMINI_API_KEY: 'synthetic-gemini-secret' })) {
    const old = process.env[key]; process.env[key] = value; t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  let held = false, providerCalls = 0, releases = 0, mode = 'ok'; let owner = '';
  t.mock.method(globalThis, 'fetch', async (resource: string | URL | Request, init?: RequestInit) => {
    const url = new URL(resource instanceof Request ? resource.url : resource);
    if (url.hostname === 'voice.synthetic.test') {
      if (url.pathname.endsWith('oct3_acquire_lane')) { const body = JSON.parse(String(init?.body)); assert.equal(body.p_workspace, 'oct3-demo'); assert.equal(body.p_lane, 'voice_draft'); if (held) return Response.json(false); held = true; owner = body.p_owner; return Response.json(true); }
      assert.equal(url.pathname, '/rest/v1/oct3_browser_leases'); assert.equal(init?.method, 'DELETE'); assert.equal(url.searchParams.get('owner'), `eq.${owner}`); assert.equal(url.searchParams.get('workspace_id'), 'eq.oct3-demo'); assert.equal(url.searchParams.get('lane'), 'eq.voice_draft'); releases++; held = false; return new Response(null, { status: 204 });
    }
    assert.equal(url.href, 'https://generativelanguage.googleapis.com/v1beta/interactions'); providerCalls++;
    const body = JSON.parse(String(init?.body)); assert.equal(body.store, false); assert.equal(body.tools, undefined); assert.equal(body.input[0].mime_type, 'audio/wav'); assert.equal(init?.redirect, 'error'); assert.ok(init?.signal);
    if (mode === 'timeout') throw new DOMException('synthetic-gemini-secret', 'TimeoutError');
    if (mode === 'denied') return Response.json({ private: 'synthetic-gemini-secret' }, { status: 403 });
    if (mode === 'concurrent') { assert.equal((await POST(request())).status, 429); }
    return Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(mode === 'schema' ? { ...draft, approved: true } : draft) }] }] });
  });
  function request(audio = wav(), token: string | null = 'synthetic-manager', origin: string | null = 'http://localhost:3003', extra = false) {
    const form = new FormData(); form.append('audio', new Blob([new Uint8Array(audio)], { type: 'audio/wav' }), 'clip.wav'); if (extra) form.append('approved', 'true');
    return new Request('http://localhost:3003/api/voice/draft', { method: 'POST', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(origin ? { origin } : {}) }, body: form });
  }
  await t.test('unauthenticated, agent, missing/wrong origin, extra fields and body caps stop before provider', async () => {
    for (const [r, status] of [[request(wav(), null), 401], [request(wav(), 'synthetic-agent'), 403], [request(wav(), 'synthetic-manager', null), 403], [request(wav(), 'synthetic-manager', 'https://attacker.test'), 403], [request(wav(), 'synthetic-manager', undefined, true), 400]] as const) assert.equal((await POST(r)).status, status);
    const large = new Request('http://localhost:3003/api/voice/draft', { method: 'POST', headers: { authorization: 'Bearer synthetic-manager', origin: 'http://localhost:3003', 'content-type': 'multipart/form-data; boundary=test' }, body: Buffer.alloc(MAX_AUDIO_BYTES + 9000) }); assert.equal((await POST(large)).status, 413);
    const advertised = request(); advertised.headers.set('content-length', '900000'); assert.equal((await POST(advertised)).status, 413);
    assert.equal(providerCalls, 0); assert.equal(releases, 0);
  });
  await t.test('invalid audio, silence, provider failure, timeout and invalid schema release lease with sanitized errors', async () => {
    for (const [m, audio, expected] of [['ok', wav(1, true), 400], ['ok', Buffer.alloc(20), 400], ['timeout', wav(), 504], ['denied', wav(), 502], ['schema', wav(), 422]] as const) {
      mode = m; const before = releases; const response = await POST(request(audio)); assert.equal(response.status, expected); assert.equal(releases, before + 1); assert.equal(held, false); assert.doesNotMatch(await response.text(), /synthetic-.*secret/);
    }
  });
  await t.test('concurrent call rejects; successful output is draft-only and causes only one provider call', async () => {
    mode = 'concurrent'; const before = providerCalls; const response = await POST(request()); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.deepEqual(await response.json(), { ...draft, model: 'gemini-3.8-flash', draft_only: true }); assert.equal(providerCalls, before + 1); assert.equal(held, false);
  });
});
