import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Principal } from "./auth";
import { AppError } from "./errors";
import type { PreferencesView } from "../shared/preferences";

export const preferencesSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  company: z.string().trim().max(160),
  role: z.string().trim().max(120),
}).strict();

function database() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError(503, "preferences_storage_unavailable", "Connect Supabase to save your profile.");
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getPreferences(principal: Principal): Promise<PreferencesView> {
  const { data, error } = await database().from("oct3_preferences")
    .select("profile,updated_at").eq("workspace_id", principal.workspace_id).maybeSingle();
  if (error) throw new AppError(503, "preferences_storage_unavailable", "The saved profile is temporarily unavailable.");
  return { profile_ref: "manager", preferences: data ? preferencesSchema.parse(data.profile) : null, updated_at: data?.updated_at ?? null, storage: "supabase" };
}

export async function savePreferences(principal: Principal, input: unknown): Promise<PreferencesView> {
  if (principal.role !== "manager") throw new AppError(403, "manager_required", "Only the manager can change the saved profile.");
  const profile = preferencesSchema.parse(input);
  const { data, error } = await database().from("oct3_preferences").upsert({
    workspace_id: principal.workspace_id, profile, updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id" }).select("profile,updated_at").single();
  if (error) throw new AppError(503, "preferences_storage_unavailable", "The profile could not be saved. Try again on this workspace.");
  return { profile_ref: "manager", preferences: preferencesSchema.parse(data.profile), updated_at: data.updated_at, storage: "supabase" };
}
