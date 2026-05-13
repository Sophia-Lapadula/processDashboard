"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth/current-user";
import { slugify } from "@/lib/util/slug";

const createSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  content: z.string().min(10),
});

export type ActionResult =
  | { ok: true; redirectTo?: string }
  | { ok: false; error: string };

export async function createSkill(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    content: formData.get("content"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const slug = slugify(parsed.data.name);

  const { data: skill, error: skillErr } = await supabase
    .from("skills")
    .insert({
      slug,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (skillErr || !skill) {
    return { ok: false, error: skillErr?.message ?? "Falha ao criar skill" };
  }

  const { data: version, error: versionErr } = await supabase
    .from("skill_versions")
    .insert({
      skill_id: skill.id,
      version_number: 1,
      content: parsed.data.content,
      change_summary: "Versão inicial",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (versionErr || !version) {
    return { ok: false, error: versionErr?.message ?? "Falha ao criar versão" };
  }

  await supabase
    .from("skills")
    .update({ current_version_id: version.id })
    .eq("id", skill.id);

  await supabase.from("edit_logs").insert({
    entity_type: "skill",
    entity_id: skill.id,
    action: "created",
    actor_id: user.id,
    metadata: { version_id: version.id, version_number: 1 },
  });

  revalidatePath("/skills");
  redirect(`/skills/${skill.id}`);
}

const saveContentSchema = z.object({
  skillId: z.string().uuid(),
  content: z.string().min(10),
  changeSummary: z.string().max(200).optional(),
});

export async function saveSkillVersion(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = saveContentSchema.safeParse({
    skillId: formData.get("skillId"),
    content: formData.get("content"),
    changeSummary: formData.get("changeSummary") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();

  // Carrega versão atual para comparar
  const { data: skill, error: skillErr } = await supabase
    .from("skills")
    .select("id, current_version_id, skill_versions!skills_current_version_fk(content, version_number)")
    .eq("id", parsed.data.skillId)
    .single();
  if (skillErr || !skill) {
    return { ok: false, error: skillErr?.message ?? "Skill não encontrada" };
  }

  const currentVersion = (skill as unknown as {
    skill_versions: { content: string; version_number: number } | null;
  }).skill_versions;

  if (currentVersion && currentVersion.content === parsed.data.content) {
    return { ok: false, error: "Sem mudanças no conteúdo" };
  }

  const nextNumber = (currentVersion?.version_number ?? 0) + 1;

  const { data: version, error: versionErr } = await supabase
    .from("skill_versions")
    .insert({
      skill_id: parsed.data.skillId,
      version_number: nextNumber,
      content: parsed.data.content,
      change_summary: parsed.data.changeSummary ?? null,
      created_by: user.id,
    })
    .select("id, version_number")
    .single();
  if (versionErr || !version) {
    return { ok: false, error: versionErr?.message ?? "Falha ao salvar versão" };
  }

  await supabase
    .from("skills")
    .update({ current_version_id: version.id })
    .eq("id", parsed.data.skillId);

  await supabase.from("edit_logs").insert({
    entity_type: "skill",
    entity_id: parsed.data.skillId,
    action: "version_published",
    actor_id: user.id,
    metadata: {
      version_id: version.id,
      version_number: version.version_number,
      change_summary: parsed.data.changeSummary,
    },
  });

  revalidatePath(`/skills/${parsed.data.skillId}`);
  return { ok: true };
}

export async function rollbackSkill(
  skillId: string,
  versionId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: version, error: vErr } = await supabase
    .from("skill_versions")
    .select("id, version_number, skill_id")
    .eq("id", versionId)
    .single();
  if (vErr || !version || version.skill_id !== skillId) {
    return { ok: false, error: "Versão não encontrada" };
  }

  const { error: upErr } = await supabase
    .from("skills")
    .update({ current_version_id: versionId })
    .eq("id", skillId);
  if (upErr) return { ok: false, error: upErr.message };

  await supabase.from("edit_logs").insert({
    entity_type: "skill",
    entity_id: skillId,
    action: "rolled_back",
    actor_id: user.id,
    metadata: { to_version_id: versionId, to_version_number: version.version_number },
  });

  revalidatePath(`/skills/${skillId}`);
  return { ok: true };
}

export async function updateSkillMetadata(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const skillId = formData.get("skillId") as string;
  const name = (formData.get("name") as string)?.trim();
  const description = ((formData.get("description") as string) || "").trim();

  if (!skillId || !name) {
    return { ok: false, error: "Nome obrigatório" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("skills")
    .update({ name, description: description || null })
    .eq("id", skillId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("edit_logs").insert({
    entity_type: "skill",
    entity_id: skillId,
    action: "updated",
    actor_id: user.id,
    diff: { name, description },
  });

  revalidatePath(`/skills/${skillId}`);
  return { ok: true };
}

export async function archiveSkill(skillId: string): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  // Verifica se algum processo ativo usa essa skill
  const { count } = await supabase
    .from("processos")
    .select("id", { count: "exact", head: true })
    .eq("skill_id", skillId)
    .is("archived_at", null);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Skill em uso por ${count} processo(s) ativo(s). Arquive-os antes.`,
    };
  }

  const { error } = await supabase
    .from("skills")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", skillId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("edit_logs").insert({
    entity_type: "skill",
    entity_id: skillId,
    action: "archived",
    actor_id: user.id,
  });

  revalidatePath("/skills");
  return { ok: true, redirectTo: "/skills" };
}

// helper para uso em queries server-side
export async function loadSkillWithCurrentContent(skillId: string) {
  const service = createServiceClient();
  const { data: skill } = await service
    .from("skills")
    .select("*")
    .eq("id", skillId)
    .single();
  if (!skill) return null;

  let content = "";
  if (skill.current_version_id) {
    const { data: version } = await service
      .from("skill_versions")
      .select("content")
      .eq("id", skill.current_version_id)
      .single();
    content = version?.content ?? "";
  }
  return { skill, content };
}
