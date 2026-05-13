"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/current-user";
import { slugify } from "@/lib/util/slug";

const schema = z.object({
  name: z.string().min(2).max(80),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createCliente(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = schema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Inválido" };
  }
  const supabase = await createClient();
  const slug = slugify(parsed.data.name);

  const { data, error } = await supabase
    .from("clientes")
    .insert({ slug, name: parsed.data.name })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, error: "Já existe um cliente com esse nome" };
    }
    return { ok: false, error: error?.message ?? "Falha ao criar" };
  }

  await supabase.from("edit_logs").insert({
    entity_type: "cliente",
    entity_id: data.id,
    action: "created",
    actor_id: user.id,
  });

  revalidatePath("/clientes");
  return { ok: true };
}
