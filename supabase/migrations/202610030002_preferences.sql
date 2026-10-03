-- Workspace-scoped manager profile. This stores defaults, never purchase approval.
create table if not exists public.oct3_preferences (
  workspace_id text primary key,
  profile jsonb not null check (jsonb_typeof(profile) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.oct3_preferences enable row level security;
revoke all on public.oct3_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.oct3_preferences to service_role;
