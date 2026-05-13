"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth/current-user";
import { slugify } from "@/lib/util/slug";
import { encryptSecret } from "@/lib/secrets/crypto";
import type {
  McpConfig,
  McpSecretPayload,
  HttpApiConfig,
  HttpApiSecretPayload,
  HttpEndpoint,
} from "@/lib/db/types";

const mcpSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  url: z.string().url(),
  transport: z.enum(["http", "sse"]).default("http"),
  authorization_token: z.string().optional(),
  extra_headers_json: z.string().optional(),
  tool_allowlist: z.string().optional(),
});

export type ActionResult =
  | { ok: true; redirectTo?: string }
  | { ok: false; error: string };

export async function createMcpConector(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = mcpSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    url: formData.get("url"),
    transport: formData.get("transport") || "http",
    authorization_token: formData.get("authorization_token") || undefined,
    extra_headers_json: formData.get("extra_headers_json") || undefined,
    tool_allowlist: formData.get("tool_allowlist") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  let extraHeaders: Record<string, string> | undefined;
  if (parsed.data.extra_headers_json?.trim()) {
    try {
      const obj = JSON.parse(parsed.data.extra_headers_json);
      if (typeof obj !== "object" || Array.isArray(obj) || obj == null) {
        return { ok: false, error: "Headers extras devem ser um objeto JSON" };
      }
      extraHeaders = obj as Record<string, string>;
    } catch {
      return { ok: false, error: "JSON de headers inválido" };
    }
  }

  const allowlist = parsed.data.tool_allowlist
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const supabase = await createClient();
  const service = createServiceClient();

  // Insert secret (service-role, contornando RLS)
  let secretsId: string | null = null;
  if (parsed.data.authorization_token) {
    const payload: McpSecretPayload = {
      authorization_token: parsed.data.authorization_token,
    };
    const encrypted = encryptSecret(payload);
    const { data, error } = await service
      .from("conector_secrets")
      .insert({
        encrypted_payload: encrypted.encryptedPayload,
        key_version: encrypted.keyVersion,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, error: error?.message ?? "Falha ao salvar secret" };
    }
    secretsId = data.id;
  }

  const config: McpConfig = {
    url: parsed.data.url,
    transport: parsed.data.transport,
    ...(extraHeaders ? { headers: extraHeaders } : {}),
    ...(allowlist?.length ? { tool_allowlist: allowlist } : {}),
  };

  const slug = slugify(parsed.data.name);
  const { data: conector, error } = await supabase
    .from("conectores")
    .insert({
      slug,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      type: "mcp",
      config: config as unknown as Record<string, unknown>,
      secrets_id: secretsId,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !conector) {
    return { ok: false, error: error?.message ?? "Falha ao criar conector" };
  }

  await supabase.from("edit_logs").insert({
    entity_type: "conector",
    entity_id: conector.id,
    action: "created",
    actor_id: user.id,
    metadata: { type: "mcp", has_secret: !!secretsId },
  });

  revalidatePath("/conectores");
  redirect(`/conectores/${conector.id}`);
}

export async function updateMcpConector(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const conectorId = formData.get("conectorId") as string;
  if (!conectorId) return { ok: false, error: "conectorId obrigatório" };

  const parsed = mcpSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    url: formData.get("url"),
    transport: formData.get("transport") || "http",
    authorization_token: formData.get("authorization_token") || undefined,
    extra_headers_json: formData.get("extra_headers_json") || undefined,
    tool_allowlist: formData.get("tool_allowlist") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  let extraHeaders: Record<string, string> | undefined;
  if (parsed.data.extra_headers_json?.trim()) {
    try {
      extraHeaders = JSON.parse(parsed.data.extra_headers_json) as Record<string, string>;
    } catch {
      return { ok: false, error: "JSON de headers inválido" };
    }
  }

  const allowlist = parsed.data.tool_allowlist
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const supabase = await createClient();
  const service = createServiceClient();

  // Carrega conector atual pra saber secrets_id
  const { data: existing } = await supabase
    .from("conectores")
    .select("secrets_id")
    .eq("id", conectorId)
    .single();

  let secretsId = existing?.secrets_id ?? null;
  const newToken = parsed.data.authorization_token?.trim();
  if (newToken) {
    // se já existe secret, atualiza; senão cria
    const payload: McpSecretPayload = { authorization_token: newToken };
    const encrypted = encryptSecret(payload);
    if (secretsId) {
      await service
        .from("conector_secrets")
        .update({
          encrypted_payload: encrypted.encryptedPayload,
          key_version: encrypted.keyVersion,
        })
        .eq("id", secretsId);
    } else {
      const { data, error } = await service
        .from("conector_secrets")
        .insert({
          encrypted_payload: encrypted.encryptedPayload,
          key_version: encrypted.keyVersion,
        })
        .select("id")
        .single();
      if (error || !data) {
        return { ok: false, error: error?.message ?? "Falha ao salvar secret" };
      }
      secretsId = data.id;
    }
  }

  const config: McpConfig = {
    url: parsed.data.url,
    transport: parsed.data.transport,
    ...(extraHeaders ? { headers: extraHeaders } : {}),
    ...(allowlist?.length ? { tool_allowlist: allowlist } : {}),
  };

  const { error } = await supabase
    .from("conectores")
    .update({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      config: config as unknown as Record<string, unknown>,
      secrets_id: secretsId,
    })
    .eq("id", conectorId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("edit_logs").insert({
    entity_type: "conector",
    entity_id: conectorId,
    action: "updated",
    actor_id: user.id,
    metadata: { token_rotated: !!newToken },
  });

  revalidatePath(`/conectores/${conectorId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// HTTP API conectores (Fase 3)
// ---------------------------------------------------------------------------

const httpApiSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  base_url: z.string().url(),
  auth_type: z.enum(["bearer", "basic", "api_key_header", "api_key_query", "none"]),
  auth_header_name: z.string().optional(),
  auth_query_param: z.string().optional(),
  endpoints_json: z.string().min(2),
  bearer_token: z.string().optional(),
  basic_username: z.string().optional(),
  basic_password: z.string().optional(),
  api_key: z.string().optional(),
});

function validateEndpoints(raw: string): HttpEndpoint[] | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "JSON de endpoints inválido" };
  }
  if (!Array.isArray(parsed)) {
    return { error: "endpoints deve ser um array" };
  }
  const result: HttpEndpoint[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      return { error: "Cada endpoint deve ser um objeto" };
    }
    const e = item as Partial<HttpEndpoint>;
    if (!e.name || !e.method || !e.path || !e.input_schema) {
      return {
        error: `Endpoint precisa de name, method, path, input_schema (faltou em: ${JSON.stringify(e).slice(0, 80)})`,
      };
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(e.name)) {
      return { error: `name "${e.name}" precisa ser identificador (letras/digitos/underscore, sem espaços)` };
    }
    result.push({
      name: e.name,
      method: e.method,
      path: e.path,
      description: e.description ?? "",
      input_schema: e.input_schema,
    });
  }
  return result;
}

export async function createHttpApiConector(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = httpApiSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    base_url: formData.get("base_url"),
    auth_type: formData.get("auth_type"),
    auth_header_name: formData.get("auth_header_name") || undefined,
    auth_query_param: formData.get("auth_query_param") || undefined,
    endpoints_json: formData.get("endpoints_json"),
    bearer_token: formData.get("bearer_token") || undefined,
    basic_username: formData.get("basic_username") || undefined,
    basic_password: formData.get("basic_password") || undefined,
    api_key: formData.get("api_key") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const endpoints = validateEndpoints(parsed.data.endpoints_json);
  if ("error" in endpoints) return { ok: false, error: endpoints.error };

  const supabase = await createClient();
  const service = createServiceClient();

  // Constrói payload de secret conforme auth_type
  const secretPayload: HttpApiSecretPayload = {};
  if (parsed.data.auth_type === "bearer" && parsed.data.bearer_token) {
    secretPayload.bearer_token = parsed.data.bearer_token;
  } else if (parsed.data.auth_type === "basic") {
    if (parsed.data.basic_username) secretPayload.basic_username = parsed.data.basic_username;
    if (parsed.data.basic_password) secretPayload.basic_password = parsed.data.basic_password;
  } else if (
    (parsed.data.auth_type === "api_key_header" || parsed.data.auth_type === "api_key_query") &&
    parsed.data.api_key
  ) {
    secretPayload.api_key = parsed.data.api_key;
  }

  let secretsId: string | null = null;
  if (Object.keys(secretPayload).length > 0) {
    const enc = encryptSecret(secretPayload);
    const { data, error } = await service
      .from("conector_secrets")
      .insert({
        encrypted_payload: enc.encryptedPayload,
        key_version: enc.keyVersion,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Falha ao salvar secret" };
    secretsId = data.id;
  }

  const config: HttpApiConfig = {
    base_url: parsed.data.base_url,
    auth_type: parsed.data.auth_type,
    ...(parsed.data.auth_header_name ? { auth_header_name: parsed.data.auth_header_name } : {}),
    ...(parsed.data.auth_query_param ? { auth_query_param: parsed.data.auth_query_param } : {}),
    endpoints,
  };

  const slug = slugify(parsed.data.name);
  const { data: conector, error } = await supabase
    .from("conectores")
    .insert({
      slug,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      type: "http_api",
      config: config as unknown as Record<string, unknown>,
      secrets_id: secretsId,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !conector) {
    return { ok: false, error: error?.message ?? "Falha ao criar conector" };
  }

  await supabase.from("edit_logs").insert({
    entity_type: "conector",
    entity_id: conector.id,
    action: "created",
    actor_id: user.id,
    metadata: { type: "http_api", endpoint_count: endpoints.length },
  });

  revalidatePath("/conectores");
  redirect(`/conectores/${conector.id}`);
}

export async function archiveConector(conectorId: string): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { count } = await supabase
    .from("processo_conectores")
    .select("processo_id", { count: "exact", head: true })
    .eq("conector_id", conectorId);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Conector em uso por ${count} processo(s). Remova-o dos processos primeiro.`,
    };
  }

  const { error } = await supabase
    .from("conectores")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", conectorId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("edit_logs").insert({
    entity_type: "conector",
    entity_id: conectorId,
    action: "archived",
    actor_id: user.id,
  });

  revalidatePath("/conectores");
  return { ok: true, redirectTo: "/conectores" };
}
