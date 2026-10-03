import assert from "node:assert/strict";
import { test } from "node:test";
import { getPreferences, savePreferences } from "../src/server/preferences";
import { GET, PUT } from "../app/api/preferences/route";
import type { Principal } from "../src/server/auth";

const manager: Principal = { id: "synthetic-manager", workspace_id: "oct3-demo", role: "manager" };
const agent: Principal = { ...manager, id: "synthetic-agent", role: "agent" };
const profile = { name: "Synthetic Attendee", email: "synthetic@example.test", company: "Synthetic Company", role: "Synthetic Role" };

test("preferences enforce role, workspace and strict schema against mocked Supabase", async t => {
  for (const [key, value] of Object.entries({ SUPABASE_URL: "https://synthetic.supabase.test", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role", OCT3_MANAGER_TOKEN: "synthetic-pref-manager", OCT3_AGENT_TOKEN: "synthetic-pref-agent" })) {
    const previous = process.env[key]; process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  const rows = new Map<string, { profile: typeof profile; updated_at: string }>();
  const calls: Array<{ method: string; workspace?: string }> = [];
  let fail = false;
  t.mock.method(globalThis, "fetch", async (resource: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof resource === "string" || resource instanceof URL ? resource : resource.url);
    assert.equal(url.origin, "https://synthetic.supabase.test");
    assert.equal(url.pathname, "/rest/v1/oct3_preferences");
    const method = init?.method ?? "GET";
    if (fail) return Response.json({ message: "synthetic-private-database-message", details: "synthetic-service-role" }, { status: 500 });
    if (method === "GET") {
      const filter = url.searchParams.get("workspace_id");
      assert.equal(typeof filter, "string");
      assert.ok(filter !== null && filter.startsWith("eq."));
      if (filter === null) throw new Error("Missing workspace filter");
      const workspace = filter.slice(3);
      calls.push({ method, workspace });
      return Response.json(rows.has(workspace) ? [rows.get(workspace)] : []);
    }
    assert.equal(method, "POST");
    assert.equal(url.searchParams.get("on_conflict"), "workspace_id");
    const body = JSON.parse(String(init?.body));
    calls.push({ method, workspace: body.workspace_id });
    assert.deepEqual(Object.keys(body).sort(), ["profile", "updated_at", "workspace_id"]);
    const saved = { profile: body.profile, updated_at: body.updated_at };
    rows.set(body.workspace_id, saved);
    return Response.json(saved);
  });
  const request = (method = "GET", body?: unknown, token?: string) => new Request("https://cue.synthetic.test/api/preferences", { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

  await t.test("unauthenticated reads and agent writes reject before database access", async () => {
    const before = calls.length;
    assert.equal((await GET(request())).status, 401);
    assert.equal((await PUT(request("PUT", profile, "synthetic-pref-agent"))).status, 403);
    await assert.rejects(savePreferences(agent, profile), /manager/);
    assert.equal(calls.length, before);
  });

  await t.test("empty profile is explicit and manager save/read trims data in only its workspace", async () => {
    const empty = await getPreferences(manager);
    assert.equal(empty.preferences, null); assert.equal(empty.updated_at, null);
    const saved = await savePreferences(manager, { ...profile, name: `  ${profile.name}  `, email: ` ${profile.email} ` });
    assert.deepEqual(saved.preferences, profile);
    assert.equal(saved.profile_ref, "manager"); assert.equal(saved.storage, "supabase");
    assert.ok(saved.updated_at);
    assert.deepEqual((await getPreferences(manager)).preferences, profile);
    assert.equal((await getPreferences({ ...manager, workspace_id: "other-workspace" })).preferences, null);
    assert.deepEqual([...rows.keys()], [manager.workspace_id]);
    const response = await GET(request("GET", undefined, "synthetic-pref-manager"));
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  });

  await t.test("unknown fields, invalid email and overlong values cannot alter saved profile", async () => {
    const before = calls.length;
    for (const invalid of [{ ...profile, workspace_id: "other-workspace" }, { ...profile, approved: true }, { ...profile, email: "invalid" }, { ...profile, name: " " }, { ...profile, role: "x".repeat(121) }, { ...profile, company: "x".repeat(161) }]) {
      const result = await PUT(request("PUT", invalid, "synthetic-pref-manager"));
      assert.equal(result.status, 400);
    }
    assert.equal(calls.length, before);
    assert.deepEqual(rows.get(manager.workspace_id)!.profile, profile);
  });

  await t.test("storage errors are explicit and never expose raw database details or claim save", async () => {
    fail = true;
    try {
      for (const response of [await GET(request("GET", undefined, "synthetic-pref-manager")), await PUT(request("PUT", profile, "synthetic-pref-manager"))]) {
        assert.equal(response.status, 503);
        const body = await response.json();
        assert.equal(body.error.code, "preferences_storage_unavailable");
        assert.equal(body.preferences, undefined);
        assert.doesNotMatch(JSON.stringify(body), /synthetic-private|synthetic-service-role/);
      }
    } finally { fail = false; }
    const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try { await assert.rejects(savePreferences(manager, profile), /Connect Supabase/); }
    finally { process.env.SUPABASE_SERVICE_ROLE_KEY = previous; }
  });
});
