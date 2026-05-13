"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth/current-user";
import { encryptSecret } from "@/lib/secrets/crypto";

const schema = z.object({
  name: z.string().min(2).max(80),
  webhook_url: z.string().url().refine((u) => u.startsWith("https://hooks.slack.com/"), {
    message: "URL deve começar com https://hooks.slack.com/",
  }),
});

export type SlackActionResult = { ok: true } | { ok: false; error: string };

export async function createSlackDestination(
  formData: FormData,
): Promise<SlackActionResult> {
  await requireUser();
  const parsed = schema.safeParse({
    name: formData.get("name"),
    webhook_url: formData.get("webhook_url"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Inválido" };
  }

  const service = createServiceClient();

  // Guarda webhook URL criptografada
  const encrypted = encryptSecret({ webhook_url: parsed.data.webhook_url });
  const { data: secret, error: sErr } = await service
    .from("conector_secrets")
    .insert({
      encrypted_payload: encrypted.encryptedPayload,
      key_version: encrypted.keyVersion,
    })
    .select("id")
    .single();
  if (sErr || !secret) {
    return { ok: false, error: sErr?.message ?? "Falha ao salvar secret" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("slack_destinations").insert({
    name: parsed.data.name,
    kind: "incoming_webhook",
    config: {},
    secrets_id: secret.id,
    enabled: true,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/slack");
  return { ok: true };
}

export async function deleteSlackDestination(id: string): Promise<SlackActionResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("slack_destinations").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/slack");
  return { ok: true };
}

export async function setProcessoSlackDestination(
  processoId: string,
  destinationId: string | null,
): Promise<SlackActionResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("processos")
    .update({ slack_destination_id: destinationId })
    .eq("id", processoId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/processos/${processoId}`);
  return { ok: true };
}
