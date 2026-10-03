-- One aggregate row per mission gives budget + approval updates one CAS boundary.
-- Only server service-role access is allowed. Browser tokens never receive this key.
create table if not exists public.oct3_missions (
  id text primary key,
  workspace_id text not null,
  idempotency_key text not null,
  request_hash text not null,
  version integer not null default 1 check (version > 0),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key),
  check ((payload->'view'->'budget'->>'reserved_minor')::bigint +
         (payload->'view'->'budget'->>'committed_minor')::bigint +
         (payload->'view'->'budget'->>'uncertain_minor')::bigint <=
         (payload->'view'->'budget'->>'limit_minor')::bigint)
);
alter table public.oct3_missions enable row level security;
revoke all on public.oct3_missions from anon, authenticated;
grant all on public.oct3_missions to service_role;
create index if not exists oct3_missions_workspace_created_idx on public.oct3_missions (workspace_id, created_at desc);

create table if not exists public.oct3_browser_leases (
  workspace_id text not null,
  lane text not null,
  owner text not null,
  expires_at timestamptz not null,
  primary key (workspace_id, lane)
);
alter table public.oct3_browser_leases enable row level security;
revoke all on public.oct3_browser_leases from anon, authenticated;
grant all on public.oct3_browser_leases to service_role;

create or replace function public.oct3_acquire_lane(p_workspace text, p_lane text, p_owner text)
returns boolean language plpgsql security invoker set search_path = public as $$
declare acquired text;
begin
  insert into public.oct3_browser_leases(workspace_id, lane, owner, expires_at)
    values (p_workspace, p_lane, p_owner, now() + interval '3 minutes')
  on conflict (workspace_id, lane) do update
    set owner = excluded.owner, expires_at = excluded.expires_at
    where oct3_browser_leases.expires_at <= now() or oct3_browser_leases.owner = excluded.owner
  returning owner into acquired;
  return acquired is not null;
end $$;
revoke all on function public.oct3_acquire_lane(text, text, text) from public, anon, authenticated;
grant execute on function public.oct3_acquire_lane(text, text, text) to service_role;
