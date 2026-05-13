"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/current-user";
import { slugify } from "@/lib/util/slug";
import { AVAILABLE_MODELS } from "@/lib/costs/model-rates";

const createSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  skill_id: z.string().uuid(),
  cliente_id: z.string().uuid().optional().nullable(),
});

export type ActionResult =
  | { ok: true; redirectTo?: string }
  | { ok: false; error: string };

export async function createProcesso(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    skill_id: formData.get("skill_id"),
    cliente_id: formData.get("cliente_id") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const slug = slugify(parsed.data.name);

  const { data, error } = await supabase
    .from("processos")
    .insert({
      slug,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      skill_id: parsed.data.skill_id,
      cliente_id: parsed.data.cliente_id ?? null,
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Falha ao criar" };
  }

  // Cria automaticamente um trigger manual (sempre disponível)
  await supabase.from("triggers").insert({
    processo_id: data.id,
    kind: "manual",
    enabled: true,
    config: {},
    created_by: user.id,
  });

  await supabase.from("edit_logs").insert({
    entity_type: "processo",
    entity_id: data.id,
    action: "created",
    actor_id: user.id,
  });

  revalidatePath("/processos");
  redirect(`/processos/${data.id}`);
}

const updateSchema = z.object({
  processoId: z.string().uuid(),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  cliente_id: z.string().uuid().optional().nullable(),
  custom_prompt: z.string().optional(),
  model: z.string(),
  max_turns: z.coerce.number().int().min(1).max(100),
  max_duration_seconds: z.coerce.number().int().min(30).max(3600),
  inputs_schema_json: z.string().optional(),
  default_inputs_json: z.string().optional(),
  status: z.enum(["draft", "active", "paused"]),
  selected_conector_ids: z.array(z.string().uuid()).default([]),
});

export async function updateProcesso(rawInput: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  if (!AVAILABLE_MODELS.includes(parsed.data.model)) {
    return { ok: false, error: `Modelo desconhecido: ${parsed.data.model}` };
  }

  let inputs_schema: unknown = { type: "object", properties: {} };
  if (parsed.data.inputs_schema_json?.trim()) {
    try {
      inputs_schema = JSON.parse(parsed.data.inputs_schema_json);
    } catch {
      return { ok: false, error: "inputs_schema_json inválido" };
    }
  }
  let default_inputs: unknown = {};
  if (parsed.data.default_inputs_json?.trim()) {
    try {
      default_inputs = JSON.parse(parsed.data.default_inputs_json);
    } catch {
      return { ok: false, error: "default_inputs_json inválido" };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("processos")
    .update({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      cliente_id: parsed.data.cliente_id ?? null,
      custom_prompt: parsed.data.custom_prompt ?? null,
      model: parsed.data.model,
      max_turns: parsed.data.max_turns,
      max_duration_seconds: parsed.data.max_duration_seconds,
      inputs_schema: inputs_schema as Record<string, unknown>,
      default_inputs: default_inputs as Record<string, unknown>,
      status: parsed.data.status,
    })
    .eq("id", parsed.data.processoId);
  if (error) return { ok: false, error: error.message };

  // Sincroniza conectores: remove os removidos, adiciona os novos
  const { data: existing } = await supabase
    .from("processo_conectores")
    .select("conector_id")
    .eq("processo_id", parsed.data.processoId);
  const existingIds = new Set((existing ?? []).map((r) => r.conector_id));
  const wantedIds = new Set(parsed.data.selected_conector_ids);

  const toAdd = parsed.data.selected_conector_ids.filter((id) => !existingIds.has(id));
  const toRemove = [...existingIds].filter((id) => !wantedIds.has(id));

  if (toRemove.length > 0) {
    await supabase
      .from("processo_conectores")
      .delete()
      .eq("processo_id", parsed.data.processoId)
      .in("conector_id", toRemove);
  }
  if (toAdd.length > 0) {
    await supabase.from("processo_conectores").insert(
      toAdd.map((conector_id, idx) => ({
        processo_id: parsed.data.processoId,
        conector_id,
        ordering: idx,
      })),
    );
  }

  await supabase.from("edit_logs").insert({
    entity_type: "processo",
    entity_id: parsed.data.processoId,
    action: "updated",
    actor_id: user.id,
  });

  revalidatePath(`/processos/${parsed.data.processoId}`);
  return { ok: true };
}

export async function archiveProcesso(processoId: string): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("processos")
    .update({ archived_at: new Date().toISOString(), status: "paused" })
    .eq("id", processoId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("edit_logs").insert({
    entity_type: "processo",
    entity_id: processoId,
    action: "archived",
    actor_id: user.id,
  });

  revalidatePath("/processos");
  return { ok: true, redirectTo: "/processos" };
}
