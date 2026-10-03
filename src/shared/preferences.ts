export interface ManagerPreferences {
  name: string;
  email: string;
  company: string;
  role: string;
}

export interface PreferencesView {
  profile_ref: "manager";
  preferences: ManagerPreferences | null;
  updated_at: string | null;
  storage: "supabase";
}
