"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { CronExpressionParser } from "cron-parser";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/current-user";

export type TriggerActionResult =
  | { ok: true }
  | { ok: false; error: string };

function genToken(): string {
  return randomBytes(24).toString("base64url");
}

const webhookSchema = z.object({
  processoId: z.string().uuid(),
  payload_mapping_json: z.string().optional(),
  require_hmac: z.coerce.boolean().default(false),
});

export async function createWebhookTrigger(
  formData: FormData,
): Promise<TriggerActionResult> {
  const user = await requireUser();
  const parsed = webhookSchema.safeParse({
    processoId: formData.get("processoId"),
    payload_mapping_json: formData.get("payload_mapping_json") || undefined,
    require_hmac: formData.get("require_hmac") || false,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Inválido" };
  }

  let payloadMapping: Record<string, string> | undefined;
  if (parsed.data.payload_mapping_json?.trim()) {
    try {
      const obj = JSON.parse(parsed.data.payload_mapping_json);
      if (typeof obj !== "object" || Array.isArray(obj) || obj == null) {
        return { ok: false, error: "Payload mapping deve ser um objeto JSON" };
      }
      payloadMapping = obj as Record<string, string>;
    } catch {
      return { ok: false, error: "JSON de payload_mapping inválido" };
    }
  }

  const supabase = await createClient();
  const config: Record<string, unknown> = { token: genToken() };
  if (parsed.data.require_hmac) {
    config.hmac_secret = randomBytes(32).toString("base64");
  }
  if (payloadMapping) {
    config.payload_mapping = payloadMapping;
  }

  const { data, error } = await supabase
    .from("triggers")
    .insert({
      processo_id: parsed.data.processoId,
      kind: "webhook",
      enabled: true,
      config,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Falha ao criar trigger" };
  }

  await supabase.from("edit_logs").insert({
    entity_type: "trigger",
    entity_id: data.id,
    action: "created",
    actor_id: user.id,
    metadata: { kind: "webhook", processo_id: parsed.data.processoId },
  });

  revalidatePath(`/processos/${parsed.data.processoId}`);
  return { ok: true };
}

const cronSchema = z.object({
  processoId: z.string().uuid(),
  cron_expression: z.string().min(5),
  timezone: z.string().default("America/Sao_Paulo"),
  static_inputs_json: z.string().optional(),
});

const chainSchema = z.object({
  processoId: z.string().uuid(),
  parent_processo_id: z.string().uuid(),
  on: z.enum(["success", "failure", "any"]).default("success"),
  input_mapping_json: z.string().optional(),
});

export async function createChainTrigger(
  formData: FormData,
): Promise<TriggerActionResult> {
  const user = await requireUser();
  const parsed = chainSchema.safeParse({
    processoId: formData.get("processoId"),
    parent_processo_id: formData.get("parent_processo_id"),
    on: formData.get("on") || "success",
    input_mapping_json: formData.get("input_mapping_json") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Inválido" };
  }

  if (parsed.data.parent_processo_id === parsed.data.processoId) {
    return { ok: false, error: "Um processo não pode encadear consigo mesmo" };
  }

  let inputMapping: Record<string, string> | undefined;
  if (parsed.data.input_mapping_json?.trim()) {
    try {
      const obj = JSON.parse(parsed.data.input_mapping_json);
      if (typeof obj !== "object" || Array.isArray(obj) || obj == null) {
        return { ok: false, error: "input_mapping deve ser um objeto JSON" };
      }
      inputMapping = obj as Record<string, string>;
    } catch {
      return { ok: false, error: "JSON de input_mapping inválido" };
    }
  }

  const supabase = await createClient();
  const config: Record<string, unknown> = {
    parent_processo_id: parsed.data.parent_processo_id,
    on: parsed.data.on,
  };
  if (inputMapping) config.input_mapping = inputMapping;

  const { data, error } = await supabase
    .from("triggers")
    .insert({
      processo_id: parsed.data.processoId,
      kind: "chain",
      enabled: true,
      config,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Falha ao criar trigger" };
  }

  await supabase.from("edit_logs").insert({
    entity_type: "trigger",
    entity_id: data.id,
    action: "created",
    actor_id: user.id,
    metadata: {
      kind: "chain",
      parent_processo_id: parsed.data.parent_processo_id,
      on: parsed.data.on,
    },
  });

  revalidatePath(`/processos/${parsed.data.processoId}`);
  return { ok: true };
}

export async function createCronTrigger(
  formData: FormData,
): Promise<TriggerActionResult> {
  const user = await requireUser();
  const parsed = cronSchema.safeParse({
    processoId: formData.get("processoId"),
    cron_expression: formData.get("cron_expression"),
    timezone: formData.get("timezone") || "America/Sao_Paulo",
    static_inputs_json: formData.get("static_inputs_json") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Inválido" };
  }

  // Valida expressão cron
  try {
    CronExpressionParser.parse(parsed.data.cron_expression, {
      tz: parsed.data.timezone,
    });
  } catch (err) {
    return {
      ok: false,
      error: `Expressão cron inválida: ${(err as Error).message}`,
    };
  }

  let staticInputs: Record<string, unknown> | undefined;
  if (parsed.data.static_inputs_json?.trim()) {
    try {
      staticInputs = JSON.parse(parsed.data.static_inputs_json);
    } catch {
      return { ok: false, error: "JSON de static_inputs inválido" };
    }
  }

  const supabase = await createClient();
  const config: Record<string, unknown> = {
    cron_expression: parsed.data.cron_expression,
    timezone: parsed.data.timezone,
  };
  if (staticInputs) config.static_inputs = staticInputs;

  const { data, error } = await supabase
    .from("triggers")
    .insert({
      processo_id: parsed.data.processoId,
      kind: "cron",
      enabled: true,
      config,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Falha ao criar trigger" };
  }

  await supabase.from("edit_logs").insert({
    entity_type: "trigger",
    entity_id: data.id,
    action: "created",
    actor_id: user.id,
    metadata: { kind: "cron", cron_expression: parsed.data.cron_expression },
  });

  revalidatePath(`/processos/${parsed.data.processoId}`);
  return { ok: true };
}

export async function toggleTrigger(
  triggerId: string,
  enabled: boolean,
): Promise<TriggerActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: trigger } = await supabase
    .from("triggers")
    .select("processo_id")
    .eq("id", triggerId)
    .single();

  const { error } = await supabase
    .from("triggers")
    .update({ enabled })
    .eq("id", triggerId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("edit_logs").insert({
    entity_type: "trigger",
    entity_id: triggerId,
    action: enabled ? "enabled" : "disabled",
    actor_id: user.id,
  });

  if (trigger?.processo_id) {
    revalidatePath(`/processos/${trigger.processo_id}`);
  }
  return { ok: true };
}

export async function deleteTrigger(
  triggerId: string,
): Promise<TriggerActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: trigger } = await supabase
    .from("triggers")
    .select("processo_id, kind")
    .eq("id", triggerId)
    .single();

  // Não deixa apagar trigger manual (sempre precisa existir)
  if (trigger?.kind === "manual") {
    return { ok: false, error: "Não é possível remover o trigger manual" };
  }

  const { error } = await supabase.from("triggers").delete().eq("id", triggerId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("edit_logs").insert({
    entity_type: "trigger",
    entity_id: triggerId,
    action: "deleted",
    actor_id: user.id,
  });

  if (trigger?.processo_id) {
    revalidatePath(`/processos/${trigger.processo_id}`);
  }
  return { ok: true };
}
