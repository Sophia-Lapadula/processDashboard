-- Processos Axenya - schema inicial
-- Migration 0001: tudo necessário para Fase 1 (MVP) e estrutura para Fases 2-4.

-- =========================================================================
-- Extensions
-- =========================================================================
create extension if not exists "pgcrypto";

-- =========================================================================
-- Profiles (espelho auth.users + role para autorização futura)
-- =========================================================================
create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'operator' check (role in ('admin', 'operator')),
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Clientes (lookup canônica para tag de cliente — evita rot "Takoda" vs "takoda")
-- =========================================================================
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- =========================================================================
-- Skills (ponteiro HEAD + metadata)
-- =========================================================================
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  current_version_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

-- Histórico imutável de versões de skill
create table public.skill_versions (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills(id) on delete cascade,
  version_number int not null,
  content text not null,
  change_summary text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (skill_id, version_number)
);

alter table public.skills
  add constraint skills_current_version_fk
  foreign key (current_version_id) references public.skill_versions(id);

create index skill_versions_skill_idx on public.skill_versions(skill_id, version_number desc);

-- =========================================================================
-- Conector secrets (criptografia AES-GCM separada para fácil RLS lockdown)
-- =========================================================================
create table public.conector_secrets (
  id uuid primary key default gen_random_uuid(),
  encrypted_payload bytea not null,
  key_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================================
-- Conectores (MCP ou HTTP API)
-- =========================================================================
create table public.conectores (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  type text not null check (type in ('mcp', 'http_api')),
  config jsonb not null default '{}'::jsonb,
  secrets_id uuid references public.conector_secrets(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index conectores_type_idx on public.conectores(type) where archived_at is null;

-- =========================================================================
-- Processos
-- =========================================================================
create table public.processos (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  skill_id uuid not null references public.skills(id),
  skill_version_pinning text not null default 'head' check (skill_version_pinning in ('head', 'pinned')),
  pinned_skill_version_id uuid references public.skill_versions(id),
  custom_prompt text,
  inputs_schema jsonb not null default '{"type":"object","properties":{}}'::jsonb,
  default_inputs jsonb not null default '{}'::jsonb,
  cliente_id uuid references public.clientes(id),
  model text not null default 'claude-sonnet-4-5',
  max_turns int not null default 30,
  max_duration_seconds int not null default 600,
  max_cost_usd numeric(10, 4),
  concurrency_policy text not null default 'allow' check (concurrency_policy in ('allow', 'queue', 'reject')),
  status text not null default 'active' check (status in ('active', 'paused', 'draft')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint pinned_version_required check (
    (skill_version_pinning = 'head') or (pinned_skill_version_id is not null)
  )
);

create index processos_skill_idx on public.processos(skill_id);
create index processos_cliente_idx on public.processos(cliente_id);

-- Conectores ligados a um processo (m2m com override por processo)
create table public.processo_conectores (
  processo_id uuid not null references public.processos(id) on delete cascade,
  conector_id uuid not null references public.conectores(id) on delete restrict,
  ordering int not null default 0,
  config_override jsonb,
  primary key (processo_id, conector_id)
);

create index processo_conectores_conector_idx on public.processo_conectores(conector_id);

-- =========================================================================
-- Triggers (manual / webhook / cron / chain) — polimórfico por kind
-- =========================================================================
create table public.triggers (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos(id) on delete cascade,
  kind text not null check (kind in ('manual', 'webhook', 'cron', 'chain')),
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index triggers_processo_idx on public.triggers(processo_id);
create index triggers_kind_enabled_idx on public.triggers(kind, enabled);

-- Webhook tokens são únicos (extraídos de config->>'token')
create unique index triggers_webhook_token_idx
  on public.triggers ((config->>'token'))
  where kind = 'webhook';

-- Anti-double-fire para cron (uma execução por minuto por trigger)
create table public.cron_dispatches (
  trigger_id uuid not null references public.triggers(id) on delete cascade,
  fire_minute timestamptz not null,
  dispatched_at timestamptz not null default now(),
  primary key (trigger_id, fire_minute)
);

-- =========================================================================
-- Process runs (uma linha por execução)
-- =========================================================================
create table public.process_runs (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos(id),
  processo_snapshot jsonb not null,
  skill_version_id uuid not null references public.skill_versions(id),
  trigger_id uuid references public.triggers(id),
  trigger_kind text not null check (trigger_kind in ('manual', 'webhook', 'cron', 'chain')),
  trigger_payload jsonb,
  inputs jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out')),
  workflow_run_id text,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms int,
  output jsonb,
  error jsonb,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_creation_tokens int not null default 0,
  cost_usd numeric(10, 6),
  parent_run_id uuid references public.process_runs(id),
  chain_depth int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index process_runs_processo_idx on public.process_runs(processo_id, created_at desc);
create index process_runs_status_idx on public.process_runs(status, created_at desc);
create index process_runs_workflow_idx on public.process_runs(workflow_run_id);
create index process_runs_parent_idx on public.process_runs(parent_run_id);

-- =========================================================================
-- Run steps (timeline streaming do agente)
-- =========================================================================
create table public.run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.process_runs(id) on delete cascade,
  seq int not null,
  kind text not null check (kind in (
    'workflow_started', 'workflow_ended',
    'agent_message', 'agent_thinking',
    'tool_call', 'tool_result',
    'mcp_connect', 'mcp_disconnect',
    'log', 'error'
  )),
  ts timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  tool_name text,
  tool_status text,
  duration_ms int,
  tokens_in int,
  tokens_out int
);

create index run_steps_run_idx on public.run_steps(run_id, seq);
create index run_steps_run_kind_idx on public.run_steps(run_id, kind);

-- =========================================================================
-- Edit logs (auditoria cross-entidade)
-- =========================================================================
create table public.edit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('skill', 'conector', 'processo', 'trigger', 'cliente')),
  entity_id uuid not null,
  action text not null,
  actor_id uuid references auth.users(id),
  diff jsonb,
  metadata jsonb,
  ts timestamptz not null default now()
);

create index edit_logs_entity_idx on public.edit_logs(entity_type, entity_id, ts desc);

-- =========================================================================
-- Slack destinations
-- =========================================================================
create table public.slack_destinations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'incoming_webhook' check (kind in ('incoming_webhook', 'bot_token')),
  config jsonb not null default '{}'::jsonb,
  secrets_id uuid references public.conector_secrets(id),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Processo → destino default (opcional)
alter table public.processos
  add column slack_destination_id uuid references public.slack_destinations(id);

-- =========================================================================
-- updated_at trigger
-- =========================================================================
create or replace function public.tg_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at_skills before update on public.skills
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at_conectores before update on public.conectores
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at_conector_secrets before update on public.conector_secrets
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at_processos before update on public.processos
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at_triggers before update on public.triggers
  for each row execute function public.tg_set_updated_at();

-- =========================================================================
-- RLS — todos autenticados leem/escrevem tudo (single tenant Axenya)
-- =========================================================================
alter table public.user_profiles enable row level security;
alter table public.clientes enable row level security;
alter table public.skills enable row level security;
alter table public.skill_versions enable row level security;
alter table public.conectores enable row level security;
alter table public.conector_secrets enable row level security;
alter table public.processos enable row level security;
alter table public.processo_conectores enable row level security;
alter table public.triggers enable row level security;
alter table public.cron_dispatches enable row level security;
alter table public.process_runs enable row level security;
alter table public.run_steps enable row level security;
alter table public.edit_logs enable row level security;
alter table public.slack_destinations enable row level security;

-- Política: qualquer usuário autenticado pode acessar tudo (single-tenant)
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'user_profiles', 'clientes', 'skills', 'skill_versions',
    'conectores', 'processos', 'processo_conectores',
    'triggers', 'cron_dispatches', 'process_runs', 'run_steps',
    'edit_logs', 'slack_destinations'
  ])
  loop
    execute format('create policy "authenticated_all_access" on public.%I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- conector_secrets: só service role tem acesso (não exposto à UI direto)
create policy "service_role_only" on public.conector_secrets
  for all to service_role using (true) with check (true);

-- =========================================================================
-- Realtime — habilitar para process_runs e run_steps (UI live updates)
-- =========================================================================
alter publication supabase_realtime add table public.process_runs;
alter publication supabase_realtime add table public.run_steps;

-- =========================================================================
-- Auto-create user_profile ao criar auth.user
-- =========================================================================
create or replace function public.tg_handle_new_user() returns trigger as $$
begin
  insert into public.user_profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_handle_new_user();
