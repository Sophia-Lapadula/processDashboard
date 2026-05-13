// Tipos do banco — espelham a migration 0001_init.sql.
// Mantenha em sincronia ao alterar o schema.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type UUID = string;
export type Timestamp = string;

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------
export interface Cliente {
  id: UUID;
  slug: string;
  name: string;
  created_at: Timestamp;
  archived_at: Timestamp | null;
}

// ---------------------------------------------------------------------------
// User profile
// ---------------------------------------------------------------------------
export interface UserProfile {
  id: UUID;
  email: string;
  name: string | null;
  role: "admin" | "operator";
  created_at: Timestamp;
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------
export interface Skill {
  id: UUID;
  slug: string;
  name: string;
  description: string | null;
  current_version_id: UUID | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  archived_at: Timestamp | null;
}

export interface SkillVersion {
  id: UUID;
  skill_id: UUID;
  version_number: number;
  content: string;
  change_summary: string | null;
  created_by: UUID | null;
  created_at: Timestamp;
}

// ---------------------------------------------------------------------------
// Conectores
// ---------------------------------------------------------------------------
export type ConectorType = "mcp" | "http_api";

export interface McpConfig {
  url: string;
  transport: "http" | "sse";
  scope?: string[];
  headers?: Record<string, string>;
  tool_allowlist?: string[];
}

export interface HttpEndpoint {
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
  input_schema: Json;
}

export interface HttpApiConfig {
  base_url: string;
  auth_type: "bearer" | "basic" | "api_key_header" | "api_key_query" | "none";
  auth_header_name?: string;
  auth_query_param?: string;
  endpoints: HttpEndpoint[];
}

export type ConectorConfig = McpConfig | HttpApiConfig;

export interface Conector {
  id: UUID;
  slug: string;
  name: string;
  description: string | null;
  type: ConectorType;
  config: Json;
  secrets_id: UUID | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  archived_at: Timestamp | null;
}

export interface ConectorSecret {
  id: UUID;
  encrypted_payload: string; // bytea como base64 quando vem do client
  key_version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// Payload decriptado guardado no secret (shape varia por conector type)
export interface McpSecretPayload {
  authorization_token?: string;
  headers?: Record<string, string>;
}

export interface HttpApiSecretPayload {
  bearer_token?: string;
  basic_username?: string;
  basic_password?: string;
  api_key?: string;
}

export type SecretPayload = McpSecretPayload | HttpApiSecretPayload;

// ---------------------------------------------------------------------------
// Processos
// ---------------------------------------------------------------------------
export interface Processo {
  id: UUID;
  slug: string;
  name: string;
  description: string | null;
  skill_id: UUID;
  skill_version_pinning: "head" | "pinned";
  pinned_skill_version_id: UUID | null;
  custom_prompt: string | null;
  inputs_schema: Json;
  default_inputs: Json;
  cliente_id: UUID | null;
  model: string;
  max_turns: number;
  max_duration_seconds: number;
  max_cost_usd: number | null;
  concurrency_policy: "allow" | "queue" | "reject";
  status: "active" | "paused" | "draft";
  slack_destination_id: UUID | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  archived_at: Timestamp | null;
}

export interface ProcessoConector {
  processo_id: UUID;
  conector_id: UUID;
  ordering: number;
  config_override: Json | null;
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------
export type TriggerKind = "manual" | "webhook" | "cron" | "chain";

export interface ManualTriggerConfig {
  // sem campos por enquanto
  _placeholder?: never;
}

export interface WebhookTriggerConfig {
  token: string;
  hmac_secret?: string;
  payload_mapping?: Record<string, string>;
}

export interface CronTriggerConfig {
  cron_expression: string;
  timezone: string;
  static_inputs?: Json;
}

export interface ChainTriggerConfig {
  parent_processo_id: UUID;
  on: "success" | "failure" | "any";
  input_mapping?: Record<string, string>;
}

export type TriggerConfig =
  | ManualTriggerConfig
  | WebhookTriggerConfig
  | CronTriggerConfig
  | ChainTriggerConfig;

export interface Trigger {
  id: UUID;
  processo_id: UUID;
  kind: TriggerKind;
  enabled: boolean;
  config: Json;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ---------------------------------------------------------------------------
// Process runs
// ---------------------------------------------------------------------------
export type ProcessRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out";

export interface ProcessRun {
  id: UUID;
  processo_id: UUID;
  processo_snapshot: Json;
  skill_version_id: UUID;
  trigger_id: UUID | null;
  trigger_kind: TriggerKind;
  trigger_payload: Json | null;
  inputs: Json;
  status: ProcessRunStatus;
  workflow_run_id: string | null;
  started_at: Timestamp | null;
  finished_at: Timestamp | null;
  duration_ms: number | null;
  output: Json | null;
  error: Json | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cost_usd: number | null;
  parent_run_id: UUID | null;
  chain_depth: number;
  created_by: UUID | null;
  created_at: Timestamp;
}

// O snapshot completo armazenado em process_runs.processo_snapshot
export interface ProcessoSnapshot {
  processo: Processo;
  cliente: Cliente | null;
  skill: {
    id: UUID;
    slug: string;
    name: string;
    version_id: UUID;
    version_number: number;
    content: string;
  };
  conectores: Array<{
    id: UUID;
    slug: string;
    name: string;
    type: ConectorType;
    config: Record<string, unknown>;
    config_override: Record<string, unknown> | null;
  }>;
  custom_prompt: string | null;
  resolved_at: Timestamp;
}

// ---------------------------------------------------------------------------
// Run steps
// ---------------------------------------------------------------------------
export type RunStepKind =
  | "workflow_started"
  | "workflow_ended"
  | "agent_message"
  | "agent_thinking"
  | "tool_call"
  | "tool_result"
  | "mcp_connect"
  | "mcp_disconnect"
  | "log"
  | "error";

export interface RunStep {
  id: UUID;
  run_id: UUID;
  seq: number;
  kind: RunStepKind;
  ts: Timestamp;
  payload: Json;
  tool_name: string | null;
  tool_status: string | null;
  duration_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
}

// ---------------------------------------------------------------------------
// Edit logs
// ---------------------------------------------------------------------------
export interface EditLog {
  id: UUID;
  entity_type: "skill" | "conector" | "processo" | "trigger" | "cliente";
  entity_id: UUID;
  action: string;
  actor_id: UUID | null;
  diff: Json | null;
  metadata: Json | null;
  ts: Timestamp;
}

// ---------------------------------------------------------------------------
// Slack destinations
// ---------------------------------------------------------------------------
export interface SlackDestination {
  id: UUID;
  name: string;
  kind: "incoming_webhook" | "bot_token";
  config: Json;
  secrets_id: UUID | null;
  enabled: boolean;
  created_at: Timestamp;
}
