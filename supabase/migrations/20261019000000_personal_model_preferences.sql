-- Personal defaults remain separate from workspace and assistant overrides.
alter table public.profiles add column model_preferences jsonb not null default '{}'::jsonb
  check (jsonb_typeof(model_preferences) = 'object');

-- Preserve an explicitly saved conversation default from the personal workspace.
update public.profiles p
set model_preferences = jsonb_build_object('text', s.default_model)
from public.workspaces w
join public.workspace_settings s on s.workspace_id = w.id
where w.owner_user_id = p.id and w.type = 'personal';

-- Existing profiles_select_own / profiles_update_own policies also protect this column.
notify pgrst, 'reload schema';
