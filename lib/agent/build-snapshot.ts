import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { ProcessoSnapshot } from "@/lib/db/types";

/**
 * Resolve um processo + suas dependências num snapshot completo
 * que será salvo em process_runs.processo_snapshot.
 *
 * Garante reprodutibilidade: edições posteriores no processo/skill
 * não afetam runs antigos.
 */
export async function buildProcessoSnapshot(
  processoId: string,
): Promise<{
  snapshot: ProcessoSnapshot;
  skillVersionId: string;
} | { error: string }> {
  const service = createServiceClient();

  const { data: processo, error: pErr } = await service
    .from("processos")
    .select("*")
    .eq("id", processoId)
    .single();
  if (pErr || !processo) {
    return { error: `Processo não encontrado: ${pErr?.message ?? "?"}` };
  }

  // Resolve skill version: pinned ou HEAD
  let skillVersionId: string | null = null;
  if (processo.skill_version_pinning === "pinned" && processo.pinned_skill_version_id) {
    skillVersionId = processo.pinned_skill_version_id;
  } else {
    const { data: skill } = await service
      .from("skills")
      .select("current_version_id")
      .eq("id", processo.skill_id)
      .single();
    skillVersionId = skill?.current_version_id ?? null;
  }
  if (!skillVersionId) {
    return { error: "Skill não tem versão HEAD" };
  }

  const { data: skillVersion, error: svErr } = await service
    .from("skill_versions")
    .select("id, version_number, content, skill:skills(id, slug, name)")
    .eq("id", skillVersionId)
    .single();
  if (svErr || !skillVersion) {
    return { error: `Versão da skill não encontrada: ${svErr?.message ?? "?"}` };
  }

  const skill = (skillVersion as unknown as { skill: { id: string; slug: string; name: string } }).skill;

  // Conectores ligados ao processo
  const { data: pcRows } = await service
    .from("processo_conectores")
    .select("conector_id, ordering, config_override, conector:conectores(id, slug, name, type, config)")
    .eq("processo_id", processoId)
    .order("ordering");

  const conectores = (pcRows ?? []).map((row) => {
    const c = (row as unknown as {
      conector: { id: string; slug: string; name: string; type: "mcp" | "http_api"; config: unknown } | null;
    }).conector;
    if (!c) return null;
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      type: c.type,
      config: c.config as Record<string, unknown>,
      config_override: row.config_override,
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  // Cliente
  let cliente = null;
  if (processo.cliente_id) {
    const { data } = await service
      .from("clientes")
      .select("id, slug, name, created_at, archived_at")
      .eq("id", processo.cliente_id)
      .single();
    cliente = data;
  }

  const snapshot: ProcessoSnapshot = {
    processo,
    cliente,
    skill: {
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      version_id: skillVersion.id,
      version_number: skillVersion.version_number,
      content: skillVersion.content,
    },
    conectores,
    custom_prompt: processo.custom_prompt,
    resolved_at: new Date().toISOString(),
  };

  return { snapshot, skillVersionId };
}
