create table public.system_network_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  proxy_url text not null default '',
  no_proxy text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.system_network_settings enable row level security;
revoke all on public.system_network_settings from anon, authenticated;
grant all on public.system_network_settings to service_role;
insert into public.system_network_settings(id) values(1);
create trigger system_network_settings_updated before update on public.system_network_settings for each row execute function public.set_updated_at();

-- Provider and its staged models are committed together. Only the authenticated
-- administrator API may call this function with validated, encrypted input.
create function public.create_model_provider_with_models(p_provider jsonb, p_models jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare provider_id uuid := (p_provider->>'id')::uuid;
begin
  insert into public.model_providers(id, created_by, name, category, preset, protocol, base_url, api_key_ciphertext, enabled)
  values(provider_id, (p_provider->>'created_by')::uuid, p_provider->>'name', p_provider->>'category', p_provider->>'preset', p_provider->>'protocol', p_provider->>'base_url', p_provider->>'api_key_ciphertext', (p_provider->>'enabled')::boolean);
  insert into public.configured_models(id, provider_id, model_key, kind, api_model, name, description, adapter, enabled, options)
  select m.id, provider_id, 'configured/' || m.id::text, m.kind, m.api_model, m.name, m.description, m.adapter, m.enabled, m.options
  from jsonb_to_recordset(p_models) as m(id uuid, kind text, api_model text, name text, description text, adapter text, enabled boolean, options jsonb);
  return provider_id;
end;
$$;
revoke all on function public.create_model_provider_with_models(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.create_model_provider_with_models(jsonb,jsonb) to service_role;
