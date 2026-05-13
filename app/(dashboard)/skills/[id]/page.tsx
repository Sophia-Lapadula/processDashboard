import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SkillEditor from "./SkillEditor";
import VersionHistory from "./VersionHistory";
import EditLogList from "@/components/audit/EditLogList";

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: skill } = await supabase
    .from("skills")
    .select("*")
    .eq("id", id)
    .single();
  if (!skill) notFound();

  const { data: currentVersion } = skill.current_version_id
    ? await supabase
        .from("skill_versions")
        .select("*")
        .eq("id", skill.current_version_id)
        .single()
    : { data: null };

  const { data: versions } = await supabase
    .from("skill_versions")
    .select("id, version_number, change_summary, created_at, created_by")
    .eq("skill_id", id)
    .order("version_number", { ascending: false });

  const { data: editLogs } = await supabase
    .from("edit_logs")
    .select("*")
    .eq("entity_type", "skill")
    .eq("entity_id", id)
    .order("ts", { ascending: false })
    .limit(20);

  const { count: processosUsing } = await supabase
    .from("processos")
    .select("id", { count: "exact", head: true })
    .eq("skill_id", id)
    .is("archived_at", null);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/skills" className="text-xs text-muted-foreground hover:text-foreground">
          ← Skills
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-2xl font-semibold">{skill.name}</h1>
            <p className="text-xs text-muted-foreground mt-1 font-mono">{skill.slug}</p>
            {skill.description && (
              <p className="text-sm text-muted-foreground mt-2">{skill.description}</p>
            )}
          </div>
          <div className="text-right text-xs text-muted-foreground space-y-0.5">
            <div>
              Versão atual: <strong className="font-mono">v{currentVersion?.version_number ?? "—"}</strong>
            </div>
            <div>Em uso por {processosUsing ?? 0} processo(s)</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          <SkillEditor
            skillId={id}
            initialContent={currentVersion?.content ?? ""}
            currentVersionNumber={currentVersion?.version_number ?? 0}
          />
        </div>
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium mb-2">Histórico</h3>
            <VersionHistory
              skillId={id}
              versions={versions ?? []}
              currentVersionId={skill.current_version_id}
            />
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2">Log de edição</h3>
            <EditLogList logs={editLogs ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}
