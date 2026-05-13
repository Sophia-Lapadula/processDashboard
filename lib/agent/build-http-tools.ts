import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptSecret, bytesToBuffer } from "@/lib/secrets/crypto";
import type {
  HttpApiConfig,
  HttpApiSecretPayload,
  HttpEndpoint,
  ProcessoSnapshot,
} from "@/lib/db/types";
import type Anthropic from "@anthropic-ai/sdk";

type AnthropicTool = Anthropic.Beta.BetaTool;

export interface HttpToolHandler {
  conectorSlug: string;
  endpoint: HttpEndpoint;
  invoke: (input: Record<string, unknown>) => Promise<HttpInvokeResult>;
}

export interface HttpInvokeResult {
  ok: boolean;
  status: number;
  body: unknown;
  durationMs: number;
}

export interface BuiltHttpTools {
  tools: AnthropicTool[];
  handlers: Map<string, HttpToolHandler>;
  warnings: string[];
}

/**
 * Para cada conector http_api do snapshot, gera tools nativas do Anthropic
 * + um handler que faz fetch real quando o agente chamar a tool.
 */
export async function buildHttpTools(snapshot: ProcessoSnapshot): Promise<BuiltHttpTools> {
  const httpConectores = snapshot.conectores.filter((c) => c.type === "http_api");
  const tools: AnthropicTool[] = [];
  const handlers = new Map<string, HttpToolHandler>();
  const warnings: string[] = [];

  if (httpConectores.length === 0) {
    return { tools, handlers, warnings };
  }

  const service = createServiceClient();

  // Carrega secrets em batch
  const conectorIds = httpConectores.map((c) => c.id);
  const { data: rows } = await service
    .from("conectores")
    .select("id, secrets_id, config")
    .in("id", conectorIds);

  const secretsIds = (rows ?? []).map((r) => r.secrets_id).filter((id): id is string => !!id);
  const secretMap = new Map<string, HttpApiSecretPayload>();
  if (secretsIds.length > 0) {
    const { data: secretRows } = await service
      .from("conector_secrets")
      .select("id, encrypted_payload, key_version")
      .in("id", secretsIds);
    for (const row of secretRows ?? []) {
      try {
        const buf = bytesToBuffer(row.encrypted_payload);
        const payload = decryptSecret<HttpApiSecretPayload>(buf, row.key_version);
        secretMap.set(row.id, payload);
      } catch (err) {
        warnings.push(`Falha ao decriptar secret ${row.id}: ${(err as Error).message}`);
      }
    }
  }

  const rowById = new Map((rows ?? []).map((r) => [r.id, r]));

  for (const con of httpConectores) {
    const row = rowById.get(con.id);
    if (!row) {
      warnings.push(`Conector ${con.slug} não encontrado`);
      continue;
    }
    const config = (con.config_override ?? row.config) as HttpApiConfig;
    const secret = row.secrets_id ? secretMap.get(row.secrets_id) : undefined;

    for (const endpoint of config.endpoints ?? []) {
      const toolName = `${con.slug}__${endpoint.name}`;
      if (toolName.length > 64) {
        warnings.push(
          `Tool name "${toolName}" excede 64 chars; renomeie conector ou endpoint`,
        );
        continue;
      }
      tools.push({
        name: toolName,
        description: endpoint.description || `${endpoint.method} ${endpoint.path}`,
        input_schema: endpoint.input_schema as AnthropicTool["input_schema"],
      });

      handlers.set(toolName, {
        conectorSlug: con.slug,
        endpoint,
        invoke: (input) => invokeHttpEndpoint(config, secret, endpoint, input),
      });
    }
  }

  return { tools, handlers, warnings };
}

async function invokeHttpEndpoint(
  config: HttpApiConfig,
  secret: HttpApiSecretPayload | undefined,
  endpoint: HttpEndpoint,
  input: Record<string, unknown>,
): Promise<HttpInvokeResult> {
  const started = Date.now();
  const url = new URL(joinUrl(config.base_url, endpoint.path));
  const headers: Record<string, string> = { accept: "application/json" };
  let body: BodyInit | undefined;

  // Auth
  if (config.auth_type === "bearer" && secret?.bearer_token) {
    headers["authorization"] = `Bearer ${secret.bearer_token}`;
  } else if (config.auth_type === "basic" && secret?.basic_username) {
    const creds = Buffer.from(
      `${secret.basic_username}:${secret.basic_password ?? ""}`,
      "utf8",
    ).toString("base64");
    headers["authorization"] = `Basic ${creds}`;
  } else if (config.auth_type === "api_key_header" && secret?.api_key && config.auth_header_name) {
    headers[config.auth_header_name.toLowerCase()] = secret.api_key;
  } else if (config.auth_type === "api_key_query" && secret?.api_key && config.auth_query_param) {
    url.searchParams.set(config.auth_query_param, secret.api_key);
  }

  const method = endpoint.method;
  // Inputs em GET/DELETE viram query; em outros, body JSON.
  if (method === "GET" || method === "DELETE") {
    for (const [k, v] of Object.entries(input ?? {})) {
      if (v == null) continue;
      url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
  } else {
    headers["content-type"] = "application/json";
    body = JSON.stringify(input ?? {});
  }

  let status = 0;
  let respBody: unknown = null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    const response = await fetch(url.toString(), {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    status = response.status;
    const text = await response.text();
    try {
      respBody = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      respBody = text;
    }
    return {
      ok: response.ok,
      status,
      body: respBody,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      status: status || 0,
      body: { error: (err as Error).message, name: (err as Error).name },
      durationMs: Date.now() - started,
    };
  }
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return b + p;
}
