-- Instance-wide model catalog, maintained by administrators.
create table public.system_user_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'user' check (role in ('admin', 'user')),
  updated_at timestamptz not null default now()
);
create table public.model_providers (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  name text not null check (length(btrim(name)) between 1 and 100),
  category text not null check (category in ('manufacturer','third_party','cloud','custom')),
  preset text not null default 'custom',
  protocol text not null check (protocol in ('openai','anthropic','gemini')),
  base_url text not null,
  api_key_ciphertext text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index model_providers_created_by_idx on public.model_providers(created_by);
create table public.configured_models (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.model_providers(id) on delete cascade,
  model_key text not null unique,
  kind text not null check (kind in ('text','audio','image','video')),
  api_model text not null,
  name text not null,
  description text not null default '',
  adapter text not null default 'auto' check (adapter in ('auto','agnes','veo')),
  enabled boolean not null default false,
  is_default boolean not null default false,
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_id, kind, api_model)
);
create index configured_models_provider_idx on public.configured_models(provider_id);
create index configured_models_enabled_kind_idx on public.configured_models(kind) where enabled;
create unique index configured_models_default_kind_idx on public.configured_models(kind) where is_default;

alter table public.system_user_roles enable row level security;
alter table public.model_providers enable row level security;
alter table public.configured_models enable row level security;
-- Keys and configuration are server-only, even for admin browser sessions.
revoke all on public.model_providers, public.configured_models, public.system_user_roles from anon, authenticated;
grant all on public.model_providers, public.configured_models, public.system_user_roles to service_role;
grant select on public.system_user_roles to authenticated;
create policy system_roles_read_self on public.system_user_roles for select to authenticated using (user_id = (select auth.uid()));

create trigger model_providers_updated before update on public.model_providers for each row execute function public.set_updated_at();
create trigger configured_models_updated before update on public.configured_models for each row execute function public.set_updated_at();

create function public.set_default_configured_model(p_model_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare target_kind text;
begin
  perform pg_advisory_xact_lock(hashtextextended('loomic:model-default', 0));
  select m.kind into target_kind from public.configured_models m
    join public.model_providers p on p.id = m.provider_id
    where m.id = p_model_id and m.enabled and p.enabled;
  if target_kind is null then raise exception 'Model is not enabled'; end if;
  update public.configured_models set is_default = false where kind = target_kind and is_default;
  update public.configured_models set is_default = true where id = p_model_id;
end;
$$;
revoke all on function public.set_default_configured_model(uuid) from public, anon, authenticated;
grant execute on function public.set_default_configured_model(uuid) to service_role;

create function public.set_system_user_role(p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('loomic:system-roles', 0));
  if p_role not in ('admin', 'user') then raise exception 'Invalid role'; end if;
  if p_role = 'user'
    and exists(select 1 from public.system_user_roles where user_id = p_user_id and role = 'admin')
    and (select count(*) from public.system_user_roles where role = 'admin') <= 1
  then raise exception 'Cannot remove the last administrator'; end if;
  insert into public.system_user_roles(user_id, role) values(p_user_id, p_role)
    on conflict(user_id) do update set role = excluded.role, updated_at = now();
end;
$$;
revoke all on function public.set_system_user_role(uuid,text) from public, anon, authenticated;
grant execute on function public.set_system_user_role(uuid,text) to service_role;
