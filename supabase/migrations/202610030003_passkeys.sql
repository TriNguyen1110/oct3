create table if not exists public.oct3_passkey_credentials (
  workspace_id text not null,
  principal_id text not null,
  credential_id text not null,
  public_key text not null,
  counter bigint not null default 0 check (counter >= 0),
  transports text[] not null default '{}',
  device_type text not null check (device_type in ('singleDevice','multiDevice')),
  backed_up boolean not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, principal_id),
  unique (credential_id)
);
alter table public.oct3_passkey_credentials enable row level security;
revoke all on public.oct3_passkey_credentials from public, anon, authenticated;
grant all on public.oct3_passkey_credentials to service_role;

create table if not exists public.oct3_passkey_challenges (
  id uuid primary key,
  workspace_id text not null,
  principal_id text not null,
  kind text not null check (kind in ('registration','approval')),
  challenge text not null,
  task_id text,
  proposal_id text,
  revision integer,
  action_hash text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind='registration' and task_id is null and proposal_id is null and revision is null and action_hash is null)
      or (kind='approval' and task_id is not null and proposal_id is not null and revision is not null and action_hash ~ '^[0-9a-f]{64}$'))
);
alter table public.oct3_passkey_challenges enable row level security;
revoke all on public.oct3_passkey_challenges from public, anon, authenticated;
grant all on public.oct3_passkey_challenges to service_role;
create index if not exists oct3_passkey_challenge_scope_idx on public.oct3_passkey_challenges(workspace_id,principal_id,expires_at);

create or replace function public.oct3_consume_passkey_challenge(p_id uuid,p_workspace text,p_principal text,p_kind text)
returns boolean language plpgsql security invoker set search_path=public as $$
declare consumed uuid;
begin
  update public.oct3_passkey_challenges set consumed_at=now()
  where id=p_id and workspace_id=p_workspace and principal_id=p_principal and kind=p_kind
    and consumed_at is null and expires_at>now()
  returning id into consumed;
  return consumed is not null;
end $$;
revoke all on function public.oct3_consume_passkey_challenge(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.oct3_consume_passkey_challenge(uuid,text,text,text) to service_role;
