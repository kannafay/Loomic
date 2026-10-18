-- Keep shared configuration and collaborators' history when a creator leaves.
alter table public.model_providers
  drop constraint model_providers_created_by_fkey,
  alter column created_by drop not null,
  add constraint model_providers_created_by_fkey foreign key (created_by)
    references public.profiles(id) on delete set null;
alter table public.chat_sessions
  drop constraint chat_sessions_created_by_fkey,
  add constraint chat_sessions_created_by_fkey foreign key (created_by)
    references auth.users(id) on delete set null;
alter table public.credit_transactions
  drop constraint credit_transactions_user_id_fkey,
  drop constraint credit_transactions_job_id_fkey,
  add constraint credit_transactions_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete set null,
  add constraint credit_transactions_job_id_fkey foreign key (job_id)
    references public.background_jobs(id) on delete set null;

-- Jobs belong to their submitting account and workspace; remove them together.
alter table public.background_jobs
  drop constraint background_jobs_created_by_fkey,
  drop constraint background_jobs_workspace_id_fkey,
  add constraint background_jobs_created_by_fkey foreign key (created_by)
    references auth.users(id) on delete cascade,
  add constraint background_jobs_workspace_id_fkey foreign key (workspace_id)
    references public.workspaces(id) on delete cascade;

-- Share the role-change lock so concurrent deletion/demotion cannot remove
-- the final administrator. Raising aborts the entire Auth deletion transaction.
create function public.guard_last_admin_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin' then
    perform pg_advisory_xact_lock(hashtextextended('loomic:system-roles', 0));
    if (select count(*) from public.system_user_roles where role = 'admin') <= 1
    then raise exception 'Cannot remove the last administrator'; end if;
  end if;
  return old;
end;
$$;
revoke all on function public.guard_last_admin_deletion() from public, anon, authenticated;
create trigger system_roles_guard_deletion before delete on public.system_user_roles
  for each row execute function public.guard_last_admin_deletion();
