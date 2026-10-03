import { createClient } from "@supabase/supabase-js";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AppError } from "./errors";
import type { MissionRecord } from "./model";

const filePath = () => process.env.OCT3_STATE_PATH || join(process.cwd(), ".data", "missions.json");
export const storageMode = () => process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" as const : "local" as const;
const supabase = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
type LocalState = { missions: MissionRecord[]; leases?: Record<string, { owner: string; expires_at: number }> };

async function localTransaction<T>(fn: (state: LocalState) => T, write = false): Promise<T> {
  if (process.env.VERCEL) throw new AppError(503, "storage_not_configured", "Connect Supabase before using hosted missions. Local development storage is disabled on Vercel.");
  const path = filePath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  let lock;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { lock = await open(`${path}.lock`, "wx", 0o600); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  if (!lock) throw new AppError(503, "storage_busy", "Storage is busy. Retry with the same request key.");
  try {
    let state: LocalState = { missions: [] };
    // Runtime-only local fallback; never trace private development state into a deployment.
    try { state = JSON.parse(await readFile(/*turbopackIgnore: true*/ path, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const result = fn(state);
    if (write) {
      const tmp = `${path}.${process.pid}.tmp`;
      const file = await open(tmp, "w", 0o600);
      try { await file.writeFile(JSON.stringify(state)); await file.sync(); } finally { await file.close(); }
      await rename(tmp, path);
    }
    return structuredClone(result);
  } finally { await lock.close(); await unlink(`${path}.lock`); }
}

function dbError(message: string): never { throw new AppError(503, "storage_unavailable", `Supabase could not persist this operation: ${message}`); }

export async function createRecord(record: MissionRecord): Promise<{ record: MissionRecord; created: boolean }> {
  if (storageMode() === "local") return localTransaction(state => {
    const found = state.missions.find(x => x.workspace_id === record.workspace_id && x.idempotency_key === record.idempotency_key);
    if (found) {
      if (found.request_hash !== record.request_hash) throw new AppError(409, "idempotency_conflict", "This request key belongs to different mission input.");
      return { record: found, created: false };
    }
    state.missions.push(record); return { record, created: true };
  }, true);
  const db = supabase();
  const inserted = await db.from("oct3_missions").insert({ id: record.id, workspace_id: record.workspace_id, idempotency_key: record.idempotency_key, request_hash: record.request_hash, version: record.version, payload: record }).select("payload").maybeSingle();
  if (!inserted.error) return { record: inserted.data!.payload as MissionRecord, created: true };
  if (inserted.error.code !== "23505") dbError(inserted.error.message);
  const existing = await db.from("oct3_missions").select("payload").eq("workspace_id", record.workspace_id).eq("idempotency_key", record.idempotency_key).single();
  if (existing.error) dbError(existing.error.message);
  const found = existing.data.payload as MissionRecord;
  if (found.request_hash !== record.request_hash) throw new AppError(409, "idempotency_conflict", "This request key belongs to different mission input.");
  return { record: found, created: false };
}

export async function getRecord(id: string, workspace: string): Promise<MissionRecord> {
  let record: MissionRecord | undefined;
  if (storageMode() === "local") record = await localTransaction(state => state.missions.find(x => x.id === id && x.workspace_id === workspace));
  else {
    const result = await supabase().from("oct3_missions").select("payload").eq("id", id).eq("workspace_id", workspace).maybeSingle();
    if (result.error) dbError(result.error.message);
    record = result.data?.payload as MissionRecord | undefined;
  }
  if (!record) throw new AppError(404, "mission_not_found", "Mission not found.");
  return record;
}

export async function latestRecord(workspace: string): Promise<MissionRecord | null> {
  if (storageMode() === "local") return localTransaction(state => state.missions.filter(x => x.workspace_id === workspace).sort((a, b) => b.view.created_at.localeCompare(a.view.created_at))[0] || null);
  const result = await supabase().from("oct3_missions").select("payload").eq("workspace_id", workspace).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) dbError(result.error.message);
  return result.data?.payload as MissionRecord || null;
}

export async function listRecords(workspace: string): Promise<MissionRecord[]> {
  if (storageMode() === "local") return localTransaction(state => state.missions.filter(x => x.workspace_id === workspace).sort((a, b) => b.view.created_at.localeCompare(a.view.created_at)).slice(0, 20));
  const result = await supabase().from("oct3_missions").select("payload").eq("workspace_id", workspace).order("created_at", { ascending: false }).limit(20);
  if (result.error) dbError(result.error.message);
  return result.data.map(x => x.payload as MissionRecord);
}

export async function findTask(taskId: string, workspace: string): Promise<MissionRecord> {
  // Task IDs carry their owning mission ID; still enforce workspace in the fetch.
  const separator = taskId.lastIndexOf(":");
  if (separator < 1) throw new AppError(404, "task_not_found", "Task not found.");
  const record = await getRecord(taskId.slice(0, separator), workspace);
  if (!record.view.tasks.some(x => x.id === taskId)) throw new AppError(404, "task_not_found", "Task not found.");
  return record;
}

/** Mutators must be synchronous and side-effect free: a CAS conflict may rerun them. */
export async function mutateRecord(id: string, workspace: string, mutate: (record: MissionRecord) => void): Promise<MissionRecord> {
  if (storageMode() === "local") return localTransaction(state => {
    const record = state.missions.find(x => x.id === id && x.workspace_id === workspace);
    if (!record) throw new AppError(404, "mission_not_found", "Mission not found.");
    mutate(record); record.version++; record.view.updated_at = new Date().toISOString(); return record;
  }, true);
  for (let attempt = 0; attempt < 12; attempt++) {
    const record = await getRecord(id, workspace);
    const version = record.version;
    mutate(record); record.version++; record.view.updated_at = new Date().toISOString();
    const result = await supabase().from("oct3_missions").update({ payload: record, version: record.version, updated_at: record.view.updated_at }).eq("id", id).eq("workspace_id", workspace).eq("version", version).select("payload").maybeSingle();
    if (result.error) dbError(result.error.message);
    if (result.data) return result.data.payload as MissionRecord;
  }
  throw new AppError(409, "concurrent_update", "The mission changed while saving. Reload and try again.");
}

export async function acquireLane(workspace: string, lane: string, owner: string): Promise<boolean> {
  if (storageMode() === "local") return localTransaction(state => {
    state.leases ||= {};
    const key = `${workspace}:${lane}`, lease = state.leases[key];
    if (lease && lease.expires_at > Date.now() && lease.owner !== owner) return false;
    state.leases[key] = { owner, expires_at: Date.now() + 180000 }; return true;
  }, true);
  const result = await supabase().rpc("oct3_acquire_lane", { p_workspace: workspace, p_lane: lane, p_owner: owner });
  if (result.error) dbError(result.error.message);
  return result.data === true;
}

export async function releaseLane(workspace: string, lane: string, owner: string): Promise<void> {
  if (storageMode() === "local") {
    await localTransaction(state => { const key = `${workspace}:${lane}`; if (state.leases?.[key]?.owner === owner) delete state.leases[key]; }, true);
    return;
  }
  const result = await supabase().from("oct3_browser_leases").delete().eq("workspace_id", workspace).eq("lane", lane).eq("owner", owner);
  if (result.error) dbError(result.error.message);
}
