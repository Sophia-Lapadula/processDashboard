-- Migration 0002: endurecer segurança das funções de trigger.
-- Resolve advisors: function_search_path_mutable + anon_security_definer_function_executable.
--
-- Aplicada via MCP Supabase em 2026-05-13.

create or replace function public.tg_set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.tg_handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Revoga EXECUTE público — só o trigger interno do auth.users precisa chamar.
revoke execute on function public.tg_handle_new_user() from public, anon, authenticated;
revoke execute on function public.tg_set_updated_at() from public, anon, authenticated;
