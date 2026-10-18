alter table public.configured_models
  add column protocol text check (protocol in ('openai', 'anthropic', 'gemini'));

-- A null protocol preserves existing models' provider-level protocol inheritance.
create or replace function public.create_model_provider_with_models(p_provider jsonb, p_models jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare provider_id uuid := (p_provider->>'id')::uuid;
begin
  insert into public.model_providers(id, created_by, name, category, preset, protocol, base_url, api_key_ciphertext, enabled, proxy_mode, proxy_url)
  values(provider_id, (p_provider->>'created_by')::uuid, p_provider->>'name', p_provider->>'category', p_provider->>'preset', p_provider->>'protocol', p_provider->>'base_url', p_provider->>'api_key_ciphertext', (p_provider->>'enabled')::boolean, coalesce(p_provider->>'proxy_mode', 'global'), coalesce(p_provider->>'proxy_url', ''));
  insert into public.configured_models(id, provider_id, model_key, kind, protocol, api_model, name, description, adapter, enabled, options)
  select m.id, provider_id, 'configured/' || m.id::text, m.kind, m.protocol, m.api_model, m.name, m.description, m.adapter, m.enabled, m.options
  from jsonb_to_recordset(p_models) as m(id uuid, kind text, protocol text, api_model text, name text, description text, adapter text, enabled boolean, options jsonb);
  return provider_id;
end;
$$;

revoke all on function public.create_model_provider_with_models(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.create_model_provider_with_models(jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
